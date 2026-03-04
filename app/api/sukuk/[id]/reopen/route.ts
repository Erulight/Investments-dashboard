import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'
import { logAudit } from '@/lib/audit'

const RECEIPT_TYPES = ['WITHDRAW_PROFIT', 'WITHDRAW_PRINCIPAL', 'ROLLBACK_PRINCIPAL'] as const

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(['OWNER', 'PARTNER'])
    const { id } = await params

    const investment = await prisma.investment.findUnique({
      where: { id },
      include: {
        account: true,
        dealParticipants: true,
      },
    })

    if (!investment) {
      return NextResponse.json({ error: 'Sukuk not found' }, { status: 404 })
    }

    if (user.role === 'PARTNER') {
      if (!user.personId) {
        return NextResponse.json({ error: 'Partner is missing a person profile' }, { status: 400 })
      }

      const participants = Array.isArray(investment.dealParticipants)
        ? investment.dealParticipants
        : []

      const partnerParticipant = participants.find((p: any) => p?.personId === user.personId)
      if (!partnerParticipant) {
        return NextResponse.json({ error: 'You are not a participant in this deal' }, { status: 403 })
      }
    }

    const result = await prisma.$transaction(async (tx: any) => {
      const scopeFilter = user.role === 'PARTNER'
        ? { personId: user.personId }
        : { OR: [{ personId: null }, { personId: user.personId || null }] }

      const profitBucketsForScope = await tx.cashBucket.findMany({
        where: {
          label: { startsWith: `Profit \u2022 ${investment.name}` },
          ...(scopeFilter as any),
        },
        select: { id: true },
      })
      const profitBucketIdsForScope = profitBucketsForScope.map((b: any) => b.id)

      const receiptMovements = await tx.cashBucketMovement.findMany({
        where: {
          investmentId: id,
          type: { in: RECEIPT_TYPES as unknown as string[] },
          ...(profitBucketIdsForScope.length > 0
            ? {
                OR: [
                  { cashBucketId: { in: profitBucketIdsForScope } },
                  { cashBucket: { ...(scopeFilter as any) } },
                ],
              }
            : { cashBucket: { ...(scopeFilter as any) } }),
        },
      })

      const receiptTransactions = await tx.transaction.findMany({
        where: {
          investmentId: id,
          type: { in: RECEIPT_TYPES as unknown as string[] },
          ...(scopeFilter as any),
        },
      })

      const movementTotal = receiptMovements.reduce((sum: number, m: any) => sum + m.amount, 0)
      const movementProfit = receiptMovements
        .filter((m: any) => m.type === 'WITHDRAW_PROFIT')
        .reduce((sum: number, m: any) => sum + m.amount, 0)
      const movementPrincipal = receiptMovements
        .filter((m: any) => m.type !== 'WITHDRAW_PROFIT')
        .reduce((sum: number, m: any) => sum + m.amount, 0)

      const transactionTotal = receiptTransactions.reduce((sum: number, t: any) => sum + Math.abs(t.amount), 0)
      const transactionProfit = receiptTransactions
        .filter((t: any) => t.type === 'WITHDRAW_PROFIT')
        .reduce((sum: number, t: any) => sum + Math.abs(t.amount), 0)
      const transactionPrincipal = receiptTransactions
        .filter((t: any) => t.type !== 'WITHDRAW_PROFIT')
        .reduce((sum: number, t: any) => sum + Math.abs(t.amount), 0)

      const useMovements = receiptMovements.length > 0
      const totalReceipt = useMovements ? movementTotal : transactionTotal
      const profitReceipt = useMovements ? movementProfit : transactionProfit
      const principalReceipt = useMovements ? movementPrincipal : transactionPrincipal

      if (totalReceipt <= 0) {
        return { success: true }
      }

      const cashBalanceKey = user.role === 'PARTNER'
        ? `CASH_BALANCE:${user.personId}`
        : 'CASH_BALANCE'

      const cashSetting = await tx.systemSetting.findUnique({
        where: { key: cashBalanceKey },
      })

      let currentCash = cashSetting ? Number(cashSetting.value) : 0
      if (!Number.isFinite(currentCash)) currentCash = 0

      // For partners, compute cash from their bucket balances so we don't rely on stale settings.
      if (user.role === 'PARTNER') {
        const agg = await tx.cashBucket.aggregate({
          where: {
            personId: user.personId,
            NOT: [
              { label: { startsWith: 'Debt •' } },
              { label: 'Partner Commission' },
            ],
          } as any,
          _sum: { balance: true },
        })
        const sum = agg._sum.balance || 0
        currentCash = Number.isFinite(sum) ? sum : 0
      }

      const nextCash = currentCash - totalReceipt
      if (nextCash < -0.000001) {
        throw new Error('INSUFFICIENT_CASH')
      }

      if (cashSetting) {
        await tx.systemSetting.update({
          where: { key: cashBalanceKey },
          data: { value: Math.max(0, nextCash).toString() },
        })
      } else {
        await tx.systemSetting.create({
          data: {
            key: cashBalanceKey,
            value: Math.max(0, nextCash).toString(),
            description: 'Available cash balance for investments',
          },
        })
      }

      if (receiptMovements.length > 0) {
        const bucketIds = Array.from(new Set(receiptMovements.map((m: any) => m.cashBucketId)))
        const buckets = await tx.cashBucket.findMany({
          where: { id: { in: bucketIds } },
          select: { id: true, balance: true },
        })
        const bucketMap = new Map<string, number>(
          buckets.map((b: any) => [String(b.id), Number(b.balance) || 0])
        )
        for (const movement of receiptMovements) {
          const movementAmount = Number(movement.amount) || 0
          const bal = bucketMap.get(String(movement.cashBucketId)) ?? 0
          if (bal + 0.000001 < movementAmount) {
            throw new Error('INSUFFICIENT_CASH')
          }
          bucketMap.set(String(movement.cashBucketId), bal - movementAmount)
        }
      }

      for (const movement of receiptMovements) {
        await tx.cashBucket.update({
          where: { id: movement.cashBucketId },
          data: { balance: { decrement: movement.amount } },
        })

        if (movement.type !== 'WITHDRAW_PROFIT') {
          const allocation = await tx.investmentBucketAllocation.findUnique({
            where: {
              investmentId_cashBucketId: {
                investmentId: id,
                cashBucketId: movement.cashBucketId,
              },
            },
          })
          if (allocation) {
            await tx.investmentBucketAllocation.update({
              where: { id: allocation.id },
              data: {
                principalRemaining: allocation.principalRemaining + movement.amount,
              },
            })
          }
        }
      }

      const movementIds = receiptMovements.map((m: any) => m.id)
      if (movementIds.length > 0) {
        await tx.cashBucketMovement.deleteMany({ where: { id: { in: movementIds } } })
      }

      const transactionIds = receiptTransactions.map((t: any) => t.id)
      if (transactionIds.length > 0) {
        await tx.transaction.deleteMany({ where: { id: { in: transactionIds } } })
      }

      // For partners, restore their deal participant and allocation from canonical SELL_TO_PARTNER metadata
      if (user.role === 'PARTNER' && user.personId) {
        const sellTx = await tx.transaction.findFirst({
          where: {
            investmentId: id,
            type: 'SELL_TO_PARTNER',
          },
          orderBy: { date: 'asc' },
        })

        let meta: any = null
        if (sellTx?.metadata) {
          try {
            meta = JSON.parse(sellTx.metadata as string)
          } catch (err) {
            console.log('SELL_TO_PARTNER metadata parse error:', err, sellTx.metadata)
          }
        }

        console.log('SELL_TO_PARTNER metadata:', meta)

        const originalPrincipal = Number(meta?.amountSold || meta?.salePrice || 0)
        const originalProfit = Number(meta?.partnerGrossProfit || 0)

        const canonicalPrincipal = originalPrincipal > 0
          ? originalPrincipal
          : Number(investment.principalAmount || 0)

        const partnerParticipant = await tx.dealParticipant.findFirst({
          where: { investmentId: id, personId: user.personId },
        })

        if (partnerParticipant) {
          await tx.dealParticipant.update({
            where: { id: partnerParticipant.id },
            data: {
              investedAmount: canonicalPrincipal,
              currentValue: canonicalPrincipal,
              profit: originalProfit,
              receivable: originalProfit,
            },
          })
        }

        await tx.investmentBucketAllocation.updateMany({
          where: {
            investmentId: id,
            cashBucket: { personId: user.personId },
          },
          data: {
            principalRemaining: canonicalPrincipal,
          },
        })
      }

      const updatedInvestment = await tx.investment.update({
        where: { id },
        data: {
          totalReceived: Math.max(0, investment.totalReceived - profitReceipt),
          principalAmount: investment.principalAmount + principalReceipt,
          currentValue: investment.currentValue + principalReceipt,
          receivableAmount: investment.receivableAmount,
          reopenedAt: new Date(),
        },
      })

      // Remove any profit buckets that were created for this Sukuk for this scope.
      if (profitBucketIdsForScope.length > 0) {
        await tx.cashBucket.deleteMany({
          where: {
            id: { in: profitBucketIdsForScope },
          },
        })
      }

      await logAudit(tx, {
        userId: user.id,
        action: 'UPDATE',
        entityType: 'SUKUK',
        entityId: investment.id,
        changes: JSON.stringify({
          reopen: {
            removedReceipts: totalReceipt,
          },
        }),
      })

      return { success: true, investment: updatedInvestment }
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error('Reopen error:', error)

    let statusCode = 500
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        statusCode = 401
      } else if (error.message === 'Forbidden') {
        statusCode = 403
      } else if (error.message === 'INSUFFICIENT_CASH') {
        statusCode = 400
      }
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error && error.message === 'INSUFFICIENT_CASH'
            ? 'Insufficient cash balance to reopen'
            : error instanceof Error
              ? error.message
              : 'Failed to reopen',
      },
      { status: statusCode }
    )
  }
}
