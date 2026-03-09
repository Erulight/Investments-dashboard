import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { requireModuleAccess } from '@/lib/rbac'
import { createAuditLog } from '@/lib/audit'

const CASH_BALANCE_KEY = 'CASH_BALANCE'

const diffDays = (start: Date, end: Date) => {
  const s = new Date(start)
  const e = new Date(end)
  s.setHours(0, 0, 0, 0)
  e.setHours(0, 0, 0, 0)
  return Math.max(0, Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)))
}

/**
 * POST  — Receive the ROSCA payout for a Circlys plan.
 *         NEW RULE: Savings zakat is based on receipt date and first contribution date.
 *         - If received >= 354 days after first contribution: zakat due immediately
 *         - If received < 354 days: no immediate zakat, money joins cash with original haul start
 *         Creates ONE receipt bucket (not per-month), excludes monthly contribution buckets from zakat.
 *
 * DELETE — Undo a previous receive.
 */

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireModuleAccess('savings')
    const user = await getCurrentUser()
    if (!user || user.role !== 'OWNER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    
    // FIX 2: Read receipt date and amount from request body
    const body = await req.json()
    const userReceiptDate = body.receiptDate ? new Date(body.receiptDate) : null
    const userAmount = body.amount ? Number(body.amount) : null

    const investment = await prisma.investment.findUnique({
      where: { id },
      include: { account: true },
    })

    if (!investment || investment.account?.type !== 'CIRCLYS') {
      return NextResponse.json({ error: 'Savings plan not found' }, { status: 404 })
    }

    const meta = (() => {
      try { return JSON.parse(investment.metadata || '{}') } catch { return {} }
    })()

    if (!meta.receiptMonth) {
      return NextResponse.json({ error: 'No receipt month configured for this plan' }, { status: 400 })
    }

    if (meta.received?.date) {
      return NextResponse.json({ error: 'Already received for this plan' }, { status: 400 })
    }

    const calculatedAmount = Number(meta.monthlyContribution || 0) * Number(meta.totalMonths || 0)
    const receiveAmount = userAmount && userAmount > 0 ? userAmount : calculatedAmount
    if (receiveAmount <= 0) {
      return NextResponse.json({ error: 'Invalid receive amount' }, { status: 400 })
    }

    const rewardFromPayments = (Object.values(meta?.payments && typeof meta.payments === 'object' ? meta.payments : {}) as any[])
      .reduce((sum: number, p: any) => sum + (Number(p?.reward) || 0), 0)
    const rewardFromMeta = Number(meta.totalRewardPaid || 0)
    const configuredTotalReward = Math.max(
      Number.isFinite(rewardFromMeta) ? rewardFromMeta : 0,
      Number.isFinite(rewardFromPayments) ? rewardFromPayments : 0,
    )

    const currency = investment.account?.currency || 'SAR'

    // NEW RULE 2: Get first contribution date (hawl start)
    const payments: Record<string, any> =
      meta.payments && typeof meta.payments === 'object' ? meta.payments : {}
    
    let firstContributionDate = new Date(investment.startDate)
    const paymentEntries = Object.values(payments) as any[]
    if (paymentEntries.length > 0) {
      const sortedPayments = paymentEntries.sort((a, b) => {
        const dateA = new Date(a.paidDate || a.dueDate)
        const dateB = new Date(b.paidDate || b.dueDate)
        return dateA.getTime() - dateB.getTime()
      })
      firstContributionDate = new Date(sortedPayments[0].paidDate || sortedPayments[0].dueDate)
    }

    // FIX 2: Use user-entered receipt date if provided, otherwise use today
    const receiveDate = userReceiptDate && !Number.isNaN(userReceiptDate.getTime()) ? userReceiptDate : new Date()
    const daysHeld = diffDays(firstContributionDate, receiveDate)
    const zakatDueImmediately = daysHeld >= 354

    const result = await prisma.$transaction(async (tx: any) => {

      // NEW RULE 1: Create ONE receipt bucket (not per-month)
      // Hawl starts from FIRST contribution date, not receipt date
      // Keep zakat-enabled so Zakat page can run the dedicated savings receipt logic.
      const receiptBucket = await tx.cashBucket.create({
        data: {
          label: `Savings Receipt • ${investment.name}`,
          currency,
          balance: receiveAmount,
          haulStartDate: firstContributionDate,
          excludeFromZakat: false,
          personId: null,
          movements: {
            create: {
              investmentId: investment.id,
              amount: receiveAmount,
              type: 'CASH_IN',
              date: receiveDate,
              notes: `Savings receipt • ${investment.name} • Month ${meta.receiptMonth}`,
            },
          },
        },
      })

      // Circlys rewards should be received as ONE bucket (not monthly reward buckets).
      // Consolidate any legacy monthly reward buckets into a single reward receipt bucket,
      // and for new plans (without legacy buckets), credit the full configured reward once.
      const legacyRewardBuckets = await tx.cashBucket.findMany({
        where: {
          personId: null,
          label: { startsWith: `Circlys Reward • ${investment.name} •` },
        },
        select: { id: true, balance: true },
      })

      const legacyRewardBalance = legacyRewardBuckets.reduce(
        (sum: number, b: any) => sum + Math.max(0, Number(b?.balance) || 0),
        0,
      )

      const rewardTargetAmount = Math.max(0, configuredTotalReward)
      const rewardReceiptAmount = Math.max(rewardTargetAmount, legacyRewardBalance)
      const rewardNewCashCredit = Math.max(0, rewardReceiptAmount - legacyRewardBalance)

      let rewardBucketId: string | null = null

      if (legacyRewardBuckets.length > 0) {
        await tx.cashBucket.updateMany({
          where: {
            id: { in: legacyRewardBuckets.map((b: any) => b.id) },
          },
          data: {
            excludeFromZakat: true,
          },
        })

        for (const legacy of legacyRewardBuckets) {
          const legacyBalance = Math.max(0, Number(legacy.balance) || 0)
          if (legacyBalance <= 0) continue

          await tx.cashBucket.update({
            where: { id: legacy.id },
            data: { balance: { decrement: legacyBalance } },
          })

          await tx.cashBucketMovement.create({
            data: {
              cashBucketId: legacy.id,
              investmentId: investment.id,
              amount: -legacyBalance,
              type: 'CASH_OUT',
              date: receiveDate,
              notes: `Consolidated into Circlys reward receipt • ${investment.name}`,
            },
          })
        }
      }

      if (rewardReceiptAmount > 0) {
        const rewardBucket = await tx.cashBucket.create({
          data: {
            label: `Circlys Reward Receipt • ${investment.name}`,
            currency,
            balance: rewardReceiptAmount,
            haulStartDate: firstContributionDate,
            excludeFromZakat: false,
            personId: null,
            movements: {
              create: {
                investmentId: investment.id,
                amount: rewardReceiptAmount,
                type: 'CASH_IN',
                date: receiveDate,
                notes: `Circlys reward receipt • ${investment.name}`,
              },
            },
          },
        })
        rewardBucketId = rewardBucket.id
      }

      // Mark all monthly contribution buckets as excluded from zakat
      // (they were just temporary tracking, not actual zakat buckets)
      const contributionBucketIds = paymentEntries
        .map((p: any) => p.bucketId)
        .filter((id: any) => id && !id.startsWith('post-receipt-')) as string[]

      if (contributionBucketIds.length > 0) {
        await tx.cashBucket.updateMany({
          where: { id: { in: contributionBucketIds } },
          data: { excludeFromZakat: true },
        })
      }

      // Recalculate system cash balance from buckets to avoid double counting
      const cashBucketAgg = await tx.cashBucket.aggregate({
        where: { personId: null },
        _sum: { balance: true },
      })
      const cashBucketSumRaw = cashBucketAgg?._sum?.balance
      const cashBucketSum = Number.isFinite(cashBucketSumRaw as any) ? Number(cashBucketSumRaw) : 0

      await tx.systemSetting.upsert({
        where: { key: CASH_BALANCE_KEY },
        update: { value: cashBucketSum.toString() },
        create: {
          key: CASH_BALANCE_KEY,
          value: cashBucketSum.toString(),
          description: 'Available cash balance for investments',
        },
      })

      // Record a transaction in the cash ledger
      const cashAccount =
        (await tx.account.findFirst({ where: { type: 'CASH', isActive: true } })) ??
        (await tx.account.create({
          data: { name: 'Cash Balance', type: 'CASH', currency, description: 'Cash ledger account' },
        }))

      await tx.transaction.create({
        data: {
          accountId: cashAccount.id,
          investmentId: investment.id,
          personId: null,
          type: 'CASH_IN',
          amount: receiveAmount,
          date: receiveDate,
          description: `Circlys receipt • ${investment.name} • Month ${meta.receiptMonth}`,
        },
      })

      if (rewardNewCashCredit > 0) {
        await tx.transaction.create({
          data: {
            accountId: cashAccount.id,
            investmentId: investment.id,
            personId: null,
            type: 'CASH_IN',
            amount: rewardNewCashCredit,
            date: receiveDate,
            description: `Circlys reward receipt • ${investment.name}`,
          },
        })
      }

      // Save received flag in metadata
      const updated = await tx.investment.update({
        where: { id: investment.id },
        data: {
          totalReceived: receiveAmount,
          metadata: JSON.stringify({
            ...meta,
            received: {
              date: receiveDate.toISOString(),
              amount: receiveAmount,
              bucketId: receiptBucket.id,
              rewardAmount: rewardReceiptAmount,
              rewardBucketId,
              daysHeld,
              zakatDueImmediately,
            },
          }),
        },
        include: { account: true },
      })

      return updated
    })

    await createAuditLog(user.id, 'CREATE', 'CASH_BUCKET', result.id, {
      type: 'SAVINGS_RECEIPT',
      investmentId: investment.id,
      amount: receiveAmount,
      rewardAmount: configuredTotalReward,
      receiptMonth: meta.receiptMonth,
      daysHeld,
      zakatDueImmediately,
    })

    return NextResponse.json({ investment: result, receiveAmount })
  } catch (error) {
    console.error('Error receiving Circlys payout:', error)
    
    let statusCode = 500
    let errorMessage = 'Failed to receive payout'
    
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        statusCode = 401
      } else if (error.message === 'RECEIPT_ALREADY_USED') {
        statusCode = 409
        errorMessage = 'Receipt already used/invested; cannot undo.'
      } else if (error.message === 'RECEIPT_BUCKET_NOT_FOUND') {
        statusCode = 409
        errorMessage = 'Receipt bucket missing; cannot undo.'
      } else if (error.message === 'Forbidden') {
        statusCode = 403
      } else if (error.message.includes('not found')) {
        statusCode = 404
        errorMessage = 'Savings plan not found'
      } else {
        errorMessage = error.message
      }
    }
    
    return NextResponse.json({ error: errorMessage }, { status: statusCode })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireModuleAccess('savings')
    const user = await getCurrentUser()
    if (!user || user.role !== 'OWNER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const investment = await prisma.investment.findUnique({
      where: { id },
      include: { account: true },
    })

    if (!investment || investment.account?.type !== 'CIRCLYS') {
      return NextResponse.json({ error: 'Savings plan not found' }, { status: 404 })
    }

    const meta = (() => {
      try { return JSON.parse(investment.metadata || '{}') } catch { return {} }
    })()

    if (!meta.received?.date) {
      return NextResponse.json({ error: 'No receipt to undo' }, { status: 400 })
    }

    const receiveAmount = Number(meta.received.amount || 0)
    const bucketId = meta.received.bucketId
    const rewardAmount = Number(meta.received.rewardAmount || 0)
    const rewardBucketId = meta.received.rewardBucketId

    if (receiveAmount <= 0) {
      return NextResponse.json({ error: 'Invalid receive amount' }, { status: 400 })
    }

    const result = await prisma.$transaction(async (tx: any) => {
      if (bucketId) {
        const receiptBucket = await tx.cashBucket.findUnique({
          where: { id: bucketId },
          select: { id: true, balance: true },
        })

        if (!receiptBucket) {
          throw new Error('RECEIPT_BUCKET_NOT_FOUND')
        }

        const spentMovements = await tx.cashBucketMovement.findFirst({
          where: {
            cashBucketId: bucketId,
            amount: { lt: 0 },
          },
          select: { id: true },
        })

        if (spentMovements || receiptBucket.balance < receiveAmount - 0.0001) {
          throw new Error('RECEIPT_ALREADY_USED')
        }
      }

      if (rewardBucketId) {
        const rewardBucket = await tx.cashBucket.findUnique({
          where: { id: rewardBucketId },
          select: { id: true, balance: true },
        })

        if (!rewardBucket) {
          throw new Error('RECEIPT_BUCKET_NOT_FOUND')
        }

        const rewardSpentMovements = await tx.cashBucketMovement.findFirst({
          where: {
            cashBucketId: rewardBucketId,
            amount: { lt: 0 },
          },
          select: { id: true },
        })

        if (rewardSpentMovements || rewardBucket.balance < rewardAmount - 0.0001) {
          throw new Error('RECEIPT_ALREADY_USED')
        }
      }

      // Delete the receipt bucket entirely (NEW RULE: single receipt bucket)
      if (bucketId) {
        await tx.cashBucketMovement.deleteMany({
          where: { cashBucketId: bucketId }
        })
        await tx.cashBucket.delete({ where: { id: bucketId } })
      }

      if (rewardBucketId) {
        await tx.cashBucketMovement.deleteMany({
          where: { cashBucketId: rewardBucketId },
        })
        await tx.cashBucket.delete({ where: { id: rewardBucketId } })
      }

      // Restore monthly contribution buckets to be zakat-eligible again
      const payments: Record<string, any> =
        meta.payments && typeof meta.payments === 'object' ? meta.payments : {}
      const paymentEntries = Object.values(payments) as any[]
      const contributionBucketIds = paymentEntries
        .map((p: any) => p.bucketId)
        .filter((id: any) => id && !id.startsWith('post-receipt-')) as string[]

      if (contributionBucketIds.length > 0) {
        await tx.cashBucket.updateMany({
          where: { id: { in: contributionBucketIds } },
          data: { excludeFromZakat: false },
        })
      }

      // Recalculate system cash balance from buckets after undo
      const cashBucketAgg = await tx.cashBucket.aggregate({
        where: { personId: null },
        _sum: { balance: true },
      })
      const cashBucketSumRaw = cashBucketAgg?._sum?.balance
      const cashBucketSum = Number.isFinite(cashBucketSumRaw as any) ? Number(cashBucketSumRaw) : 0

      await tx.systemSetting.upsert({
        where: { key: CASH_BALANCE_KEY },
        update: { value: cashBucketSum.toString() },
        create: {
          key: CASH_BALANCE_KEY,
          value: cashBucketSum.toString(),
          description: 'Available cash balance for investments',
        },
      })

      // Delete the ledger transaction
      const cashAccount = await tx.account.findFirst({ where: { type: 'CASH', isActive: true } })
      if (cashAccount) {
        const txn = await tx.transaction.findFirst({
          where: {
            accountId: cashAccount.id,
            investmentId: investment.id,
            type: 'CASH_IN',
            description: { contains: 'Circlys receipt' },
          },
          orderBy: { date: 'desc' },
        })
        if (txn) {
          await tx.transaction.delete({ where: { id: txn.id } })
        }

        if (rewardAmount > 0) {
          const rewardTxn = await tx.transaction.findFirst({
            where: {
              accountId: cashAccount.id,
              investmentId: investment.id,
              type: 'CASH_IN',
              description: { contains: 'Circlys reward receipt' },
            },
            orderBy: { date: 'desc' },
          })

          if (rewardTxn) {
            await tx.transaction.delete({ where: { id: rewardTxn.id } })
          }
        }
      }

      // Remove received flag from metadata
      const { received, ...restMeta } = meta
      const updated = await tx.investment.update({
        where: { id: investment.id },
        data: {
          totalReceived: 0,
          metadata: JSON.stringify(restMeta),
        },
        include: { account: true },
      })

      return updated
    })

    await createAuditLog(user.id, 'DELETE', 'CASH_BUCKET', bucketId || id, {
      type: 'SAVINGS_RECEIPT_UNDO',
      investmentId: investment.id,
      amount: receiveAmount,
      rewardAmount,
    })

    return NextResponse.json({ investment: result })
  } catch (error) {
    console.error('Error undoing Circlys receipt:', error)
    
    let statusCode = 500
    let errorMessage = 'Failed to undo receipt'
    
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        statusCode = 401
      } else if (error.message === 'Forbidden') {
        statusCode = 403
      } else if (error.message.includes('not found')) {
        statusCode = 404
        errorMessage = 'Savings plan not found'
      } else {
        errorMessage = error.message
      }
    }
    
    return NextResponse.json({ error: errorMessage }, { status: statusCode })
  }
}
