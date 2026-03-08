import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'
import { logAudit } from '@/lib/audit'
import { createSnapshot } from '@/lib/snapshot'

// Trivial change to trigger redeploy: added explicit logging below

const RECEIPT_TYPES = ['WITHDRAW_PROFIT', 'WITHDRAW_PRINCIPAL', 'ROLLBACK_PRINCIPAL'] as const

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(['OWNER', 'PARTNER'])
    const { id } = await params

    console.log('REOPEN START', {
      investmentId: id,
      role: user.role,
      personId: user.personId,
    })

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

      console.log('PARTICIPANTS', participants)

      const partnerParticipant = participants.find((p: any) => p?.personId === user.personId)
      if (!partnerParticipant) {
        return NextResponse.json({ error: 'You are not a participant in this deal' }, { status: 403 })
      }
    }

    const result = await prisma.$transaction(async (tx: any) => {
      // Create snapshot before reopen
      await createSnapshot(tx, {
        label: `Before: Reopen ${investment.name}`,
        trigger: 'REOPEN',
        userId: user.id,
        investmentId: investment.id,
        personId: user.personId || undefined,
      })
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

      // Canonical values for partner flows, derived from SELL_TO_PARTNER metadata
      let partnerCanonicalPrincipal: number | null = null
      let partnerCanonicalProfit: number | null = null
      let canonicalApr: number | undefined
      let canonicalFees: number | undefined

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

      // Restore allocations for principal withdrawals (don't touch bucket balances yet)
      for (const movement of receiptMovements) {
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

      // CASH REVERSAL: When deal is reopened, reverse all withdrawal transactions
      const withdrawals = await tx.transaction.findMany({
        where: {
          investmentId: id,
          type: { in: ['WITHDRAW_PROFIT', 'WITHDRAW_PRINCIPAL'] }
        }
      })

      const totalWithdrawn = withdrawals.reduce((sum: number, t: any) => sum + t.amount, 0)

      // If any withdrawal transactions exist, delete them and related cash buckets
      if (totalWithdrawn > 0) {
        await tx.transaction.deleteMany({
          where: {
            investmentId: id,
            type: { in: ['WITHDRAW_PROFIT', 'WITHDRAW_PRINCIPAL'] },
          },
        })

        // Only delete the specific principal receipt bucket created during withdrawal
        // Do NOT delete ROSCA receipt buckets or other cash buckets
        await tx.cashBucket.deleteMany({
          where: {
            label: `${investment.name} Principal Receipt`,
            personId: null,
          },
        })
      }

      // Recalculate cash balance from all buckets instead of setting to 0
      const allBuckets = await tx.cashBucket.findMany({
        where: { personId: null },
        select: { balance: true },
      })
      const totalCashFromBuckets = allBuckets.reduce((sum: number, b: any) => sum + Number(b.balance || 0), 0)

      await tx.systemSetting.upsert({
        where: { key: 'CASH_BALANCE' },
        update: { value: totalCashFromBuckets.toString() },
        create: {
          key: 'CASH_BALANCE',
          value: totalCashFromBuckets.toString(),
          description: 'Available cash balance for investments',
        },
      })


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

        console.log('SELL_TX metadata', sellTx?.metadata)
        console.log('SELL_TO_PARTNER metadata:', meta)

        const snap = meta?.snapshot
        
        // Use original investment snapshot (full deal values) not partner-share calculations
        const originalPrincipal = Number(
          meta?.principalTransferred ?? snap?.principalAmount ?? 0,
        )
        const originalProfit = Number(
          snap?.receivableAmount ?? meta?.partnerGrossProfit ?? 0,
        )

        const originalApr = Number(
          snap?.interestRate ?? meta?.originalInterestRate ?? 0,
        )
        const originalFees = Number(
          snap?.fees ?? meta?.partnerFeeShare ?? 0,
        )

        const canonicalPrincipal = originalPrincipal > 0
          ? originalPrincipal
          : principalReceipt
        const canonicalProfit = originalProfit > 0
          ? originalProfit
          : profitReceipt

        canonicalApr = Number.isFinite(originalApr) && originalApr > 0
          ? originalApr
          : 0
        canonicalFees = Number.isFinite(originalFees) && originalFees >= 0
          ? originalFees
          : 0

        partnerCanonicalPrincipal = canonicalPrincipal
        partnerCanonicalProfit = canonicalProfit

        console.log('CANONICAL VALUES', {
          canonicalPrincipal,
          canonicalProfit,
        })

        const partnerParticipant = await tx.dealParticipant.findFirst({
          where: { investmentId: id, personId: user.personId },
        })

        console.log('PARTNER PARTICIPANT before restore', partnerParticipant)

        if (partnerParticipant) {
          await tx.dealParticipant.update({
            where: { id: partnerParticipant.id },
            data: {
              investedAmount: canonicalPrincipal,
              currentValue: canonicalPrincipal,
              profit: canonicalProfit,
              receivable: canonicalProfit,
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
            principalAllocated: canonicalPrincipal,
          },
        })
      }

      // Compute canonical values for the Investment itself.
      // For OWNER, canonical principal is current principal plus what we just reversed.
      // For PARTNER, canonical values come from SELL_TO_PARTNER metadata (with receipt fallbacks).
      const ownerCanonicalPrincipal = investment.principalAmount + principalReceipt
      const ownerCanonicalCurrent = investment.currentValue + principalReceipt

      const principalAmountValue =
        user.role === 'PARTNER'
          ? (partnerCanonicalPrincipal !== null && partnerCanonicalPrincipal > 0
              ? partnerCanonicalPrincipal
              : principalReceipt)
          : ownerCanonicalPrincipal

      const currentValueValue =
        user.role === 'PARTNER'
          ? principalAmountValue
          : ownerCanonicalCurrent

      const interestRateValue: number =
        user.role === 'PARTNER'
          ? (typeof canonicalApr === 'number' && !Number.isNaN(canonicalApr) ? canonicalApr : 0)
          : (typeof investment.interestRate === 'number' && !Number.isNaN(investment.interestRate as any) ? (investment.interestRate as number) : 0)

      const feesValue =
        user.role === 'PARTNER'
          ? (typeof canonicalFees !== 'undefined' ? canonicalFees : 0)
          : investment.fees

      // Compute a fallback profit based on principal, rate, and period if snapshot/receivable are missing.
      let fallbackProfit = 0
      const startRaw: any = (investment as any).startDate
      const maturityRaw: any = (investment as any).maturityDate
      const startDate = startRaw ? new Date(startRaw) : null
      const maturityDate = maturityRaw ? new Date(maturityRaw) : null

      if (
        startDate &&
        maturityDate &&
        !Number.isNaN(startDate.getTime()) &&
        !Number.isNaN(maturityDate.getTime()) &&
        principalAmountValue > 0 &&
        Number.isFinite(interestRateValue) &&
        interestRateValue > 0
      ) {
        const periodMonths =
          (maturityDate.getFullYear() - startDate.getFullYear()) * 12 +
          (maturityDate.getMonth() - startDate.getMonth()) +
          (maturityDate.getDate() - startDate.getDate()) / 30
        const periodYears = periodMonths > 0 ? periodMonths / 12 : 0
        if (periodYears > 0) {
          fallbackProfit = principalAmountValue * (interestRateValue / 100) * periodYears
        }
      }

      const existingReceivable = Number(investment.receivableAmount || 0)

      const receivableAmountValue = (() => {
        if (user.role === 'PARTNER') {
          if (partnerCanonicalProfit !== null && partnerCanonicalProfit > 0) {
            return Math.round(partnerCanonicalProfit * 100) / 100
          }
          if (existingReceivable > 0) {
            return Math.round(existingReceivable * 100) / 100
          }
          if (fallbackProfit > 0) {
            return Math.round(fallbackProfit * 100) / 100
          }
          if (profitReceipt > 0) {
            // Last known profit that had been withdrawn before reopen
            return Math.round(profitReceipt * 100) / 100
          }
          return 0
        }
        // OWNER branch
        if (existingReceivable > 0) {
          return Math.round(existingReceivable * 100) / 100
        }
        if (fallbackProfit > 0) {
          return Math.round(fallbackProfit * 100) / 100
        }
        if (profitReceipt > 0) {
          return Math.round(profitReceipt * 100) / 100
        }
        return 0
      })()

      console.log('REOPEN INVESTMENT UPDATE DATA:', {
        principalAmount: principalAmountValue,
        receivableAmount: receivableAmountValue,
        interestRate: interestRateValue,
        fees: feesValue,
        totalReceived: 0, // Reset to 0 on reopen
      })

      const updatedInvestment = await tx.investment.update({
        where: { id },
        data: {
          totalReceived: 0, // Reset to 0 on reopen since withdrawal transactions are deleted
          principalAmount: principalAmountValue,
          currentValue: currentValueValue,
          receivableAmount: receivableAmountValue,
          interestRate: interestRateValue,
          fees: feesValue,
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
  } catch (err) {
    console.error('REOPEN ERROR:', err)
    
    let statusCode = 500
    let errorMessage = 'Failed to reopen investment'
    
    if (err instanceof Error) {
      if (err.message === 'Unauthorized') {
        statusCode = 401
      } else if (err.message === 'Forbidden') {
        statusCode = 403
      } else if (err.message.includes('not found')) {
        statusCode = 404
        errorMessage = 'Investment not found'
      } else {
        errorMessage = err.message
      }
    }
    
    return NextResponse.json({ error: errorMessage }, { status: statusCode })
  }
}
