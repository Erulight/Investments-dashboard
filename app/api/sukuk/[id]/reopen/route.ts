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
    const user = await requireAuth(['OWNER'])
    const { id } = await params

    const investment = await prisma.investment.findUnique({
      where: { id },
      include: { account: true },
    })

    if (!investment) {
      return NextResponse.json({ error: 'Sukuk not found' }, { status: 404 })
    }

    const result = await prisma.$transaction(async (tx) => {
      const receiptMovements = await tx.cashBucketMovement.findMany({
        where: {
          investmentId: id,
          type: { in: RECEIPT_TYPES as unknown as string[] },
        },
      })

      const receiptTransactions = await tx.transaction.findMany({
        where: {
          investmentId: id,
          type: { in: RECEIPT_TYPES as unknown as string[] },
        },
      })

      const movementTotal = receiptMovements.reduce((sum, m) => sum + m.amount, 0)
      const movementProfit = receiptMovements
        .filter((m) => m.type === 'WITHDRAW_PROFIT')
        .reduce((sum, m) => sum + m.amount, 0)
      const movementPrincipal = receiptMovements
        .filter((m) => m.type !== 'WITHDRAW_PROFIT')
        .reduce((sum, m) => sum + m.amount, 0)

      const transactionTotal = receiptTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0)
      const transactionProfit = receiptTransactions
        .filter((t) => t.type === 'WITHDRAW_PROFIT')
        .reduce((sum, t) => sum + Math.abs(t.amount), 0)
      const transactionPrincipal = receiptTransactions
        .filter((t) => t.type !== 'WITHDRAW_PROFIT')
        .reduce((sum, t) => sum + Math.abs(t.amount), 0)

      const useMovements = receiptMovements.length > 0
      const totalReceipt = useMovements ? movementTotal : transactionTotal
      const profitReceipt = useMovements ? movementProfit : transactionProfit
      const principalReceipt = useMovements ? movementPrincipal : transactionPrincipal

      if (totalReceipt <= 0) {
        return { success: true }
      }

      const cashSetting = await tx.systemSetting.findUnique({
        where: { key: 'CASH_BALANCE' },
      })
      const currentCash = cashSetting ? Number(cashSetting.value) : 0
      const nextCash = currentCash - totalReceipt

      if (nextCash < 0) {
        throw new Error('INSUFFICIENT_CASH')
      }

      if (cashSetting) {
        await tx.systemSetting.update({
          where: { key: 'CASH_BALANCE' },
          data: { value: nextCash.toString() },
        })
      } else {
        await tx.systemSetting.create({
          data: {
            key: 'CASH_BALANCE',
            value: nextCash.toString(),
            description: 'Available cash balance for investments',
          },
        })
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

      if (receiptMovements.length > 0) {
        await tx.cashBucketMovement.deleteMany({
          where: {
            investmentId: id,
            type: { in: RECEIPT_TYPES as unknown as string[] },
          },
        })
      }

      if (receiptTransactions.length > 0) {
        await tx.transaction.deleteMany({
          where: {
            investmentId: id,
            type: { in: RECEIPT_TYPES as unknown as string[] },
          },
        })
      }

      const updatedInvestment = await tx.investment.update({
        where: { id },
        data: {
          totalReceived: Math.max(0, investment.totalReceived - profitReceipt),
          principalAmount: investment.principalAmount + principalReceipt,
          currentValue: investment.currentValue + principalReceipt,
          reopenedAt: new Date(),
        },
      })

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
