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

    const result = await prisma.$transaction(async (tx) => {

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

      // Update system cash balance
      const setting = await tx.systemSetting.findUnique({
        where: { key: CASH_BALANCE_KEY },
      })
      const currentCash = setting ? Number(setting.value) : 0
      const nextCash = currentCash + receiveAmount

      if (setting) {
        await tx.systemSetting.update({
          where: { key: CASH_BALANCE_KEY },
          data: { value: nextCash.toString() },
        })
      } else {
        await tx.systemSetting.create({
          data: {
            key: CASH_BALANCE_KEY,
            value: nextCash.toString(),
            description: 'Available cash balance for investments',
          },
        })
      }

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
      receiptMonth: meta.receiptMonth,
      daysHeld,
      zakatDueImmediately,
    })

    return NextResponse.json({ investment: result, receiveAmount })
  } catch (error) {
    console.error('Error receiving Circlys payout:', error)
    return NextResponse.json({ error: 'Failed to receive payout' }, { status: 500 })
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

    if (receiveAmount <= 0) {
      return NextResponse.json({ error: 'Invalid receive amount' }, { status: 400 })
    }

    const result = await prisma.$transaction(async (tx) => {
      // Delete the receipt bucket entirely (NEW RULE: single receipt bucket)
      if (bucketId) {
        await tx.cashBucketMovement.deleteMany({
          where: { cashBucketId: bucketId }
        })
        await tx.cashBucket.delete({ where: { id: bucketId } })
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

      // Reverse system cash balance
      const setting = await tx.systemSetting.findUnique({ where: { key: CASH_BALANCE_KEY } })
      const currentCash = setting ? Number(setting.value) : 0
      const nextCash = Math.max(0, currentCash - receiveAmount)

      if (setting) {
        await tx.systemSetting.update({
          where: { key: CASH_BALANCE_KEY },
          data: { value: nextCash.toString() },
        })
      }

      // Delete the ledger transaction
      const cashAccount = await tx.account.findFirst({ where: { type: 'CASH', isActive: true } })
      if (cashAccount) {
        const txn = await tx.transaction.findFirst({
          where: {
            accountId: cashAccount.id,
            investmentId: investment.id,
            type: 'CASH_IN',
            description: { contains: 'Savings receipt' },
          },
          orderBy: { date: 'desc' },
        })
        if (txn) {
          await tx.transaction.delete({ where: { id: txn.id } })
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
    })

    return NextResponse.json({ investment: result })
  } catch (error) {
    console.error('Error undoing Circlys receipt:', error)
    return NextResponse.json({ error: 'Failed to undo receipt' }, { status: 500 })
  }
}
