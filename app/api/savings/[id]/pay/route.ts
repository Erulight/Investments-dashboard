import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { requireModuleAccess } from '@/lib/rbac'
import { createAuditLog } from '@/lib/audit'
import { withdrawFromBuckets } from '@/lib/cashBuckets'
import { createSnapshot } from '@/lib/snapshot'

const CASH_BALANCE_KEY = 'CASH_BALANCE'

type PayBody = {
  monthIndex: number
  amount: number
  reward?: number
}

type UnpayBody = {
  monthIndex: number
}

const addMonths = (date: Date, months: number) => {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireModuleAccess('savings')
    const user = await getCurrentUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (user.role !== 'OWNER') {
      return NextResponse.json(
        { error: 'Only owners can record monthly contributions' },
        { status: 403 }
      )
    }

    const { id } = await params

    const investment = await prisma.investment.findUnique({
      where: { id },
      include: { account: true },
    })

    if (!investment || investment.account?.type !== 'CIRCLYS') {
      return NextResponse.json({ error: 'Savings plan not found' }, { status: 404 })
    }

    const body = (await req.json()) as PayBody

    const monthIndex = Number(body.monthIndex)
    const amount = Number(body.amount)
    const reward = body.reward !== undefined ? Number(body.reward) : 0

    if (!Number.isInteger(monthIndex) || monthIndex < 0) {
      return NextResponse.json({ error: 'Invalid monthIndex' }, { status: 400 })
    }

    // Snapshot before undoing a savings payment
    await createSnapshot(prisma as any, {
      label: `Before: Savings Unpay ${investment.name}  Month ${monthIndex + 1}`,
      trigger: 'SAVINGS_UNPAY',
      userId: user.id,
      investmentId: investment.id,
      personId: user.personId || undefined,
    })

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })
    }

    if (!Number.isFinite(reward) || reward < 0) {
      return NextResponse.json({ error: 'Invalid reward' }, { status: 400 })
    }

    const meta = (() => {
      try {
        return JSON.parse(investment.metadata || '{}')
      } catch {
        return {}
      }
    })()

    const totalMonths = Number(meta.totalMonths || 0)
    if (totalMonths > 0 && monthIndex >= totalMonths) {
      return NextResponse.json({ error: 'monthIndex exceeds plan totalMonths' }, { status: 400 })
    }

    const payments: Record<string, any> = meta.payments && typeof meta.payments === 'object' ? meta.payments : {}
    if (payments[String(monthIndex)]?.bucketId) {
      return NextResponse.json({ error: 'This month is already paid' }, { status: 400 })
    }

    const dueDate = addMonths(new Date(investment.startDate), monthIndex)
    const monthLabel = `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, '0')}`
    const contributionDate = dueDate

    // Determine if this is a post-receipt month (deducts from cash instead of creating a new bucket)
    const isPostReceipt =
      meta.received?.date &&
      meta.receiptMonth &&
      (monthIndex + 1) > Number(meta.receiptMonth)

    // Snapshot before making changes to savings plan
    await createSnapshot(prisma as any, {
      label: `Before: Savings Pay ${investment.name}  Month ${monthIndex + 1}`,
      trigger: 'SAVINGS_PAY',
      userId: user.id,
      investmentId: investment.id,
      personId: user.personId || undefined,
    })

    let bucketId: string

    if (isPostReceipt) {
      // Post-receipt: withdraw contribution from existing cash balance
      const totalDeduct = amount + reward
      const currency = investment.account?.currency || 'SAR'

      const result = await prisma.$transaction(async (tx: any) => {
        await withdrawFromBuckets(tx, {
          amount: totalDeduct,
          currency,
          date: contributionDate,
          type: 'CASH_OUT',
          investmentId: investment.id,
          notes: `Circlys payback • ${investment.name} • Month ${monthIndex + 1}`,
          availableOnOrBefore: contributionDate,
        })

        // Update system cash balance
        const setting = await tx.systemSetting.findUnique({ where: { key: CASH_BALANCE_KEY } })
        const currentCash = setting ? Number(setting.value) : 0
        const nextCash = currentCash - totalDeduct
        if (nextCash < 0) throw new Error('INSUFFICIENT_CASH')
        if (setting) {
          await tx.systemSetting.update({ where: { key: CASH_BALANCE_KEY }, data: { value: nextCash.toString() } })
        }

        return null
      })

      // Use a placeholder bucket ID to mark as paid without a real bucket
      bucketId = `post-receipt-${investment.id}-${monthIndex}`
    } else {
      // Normal pre-receipt: create a new cash bucket with its own haul
      const bucket = await prisma.cashBucket.create({
        data: {
          label: `Circlys • ${investment.name} • ${monthLabel}`,
          currency: investment.account?.currency || 'SAR',
          haulStartDate: contributionDate,
          balance: amount + reward,
          movements: {
            create: [
              {
                investmentId: investment.id,
                amount,
                type: 'SAVINGS_CONTRIBUTION',
                date: contributionDate,
                notes: `Month ${monthIndex + 1}`,
              },
              ...(reward > 0
                ? [
                    {
                      investmentId: investment.id,
                      amount: reward,
                      type: 'SAVINGS_REWARD',
                      date: contributionDate,
                      notes: `Month ${monthIndex + 1}`,
                    },
                  ]
                : []),
            ],
          },
        },
        select: { id: true, label: true, currency: true, haulStartDate: true, balance: true },
      })
      bucketId = bucket.id
    }

    const nextPayments = {
      ...payments,
      [String(monthIndex)]: {
        monthIndex,
        dueDate: dueDate.toISOString(),
        paidDate: dueDate.toISOString(),
        amount,
        reward,
        bucketId,
        postReceipt: isPostReceipt || false,
      },
    }

    const totalPaid = Object.values(nextPayments).reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0)
    const totalRewardPaid = Object.values(nextPayments).reduce((sum: number, p: any) => sum + (Number(p.reward) || 0), 0)
    const monthsPaid = Object.keys(nextPayments).length

    const updated = await prisma.investment.update({
      where: { id: investment.id },
      data: {
        principalAmount: totalPaid,
        currentValue: totalPaid + totalRewardPaid,
        metadata: JSON.stringify({
          ...meta,
          payments: nextPayments,
          monthsPaid,
          totalPaid,
          totalRewardPaid,
        }),
      },
      include: { account: true },
    })

    await createAuditLog(user.id, 'CREATE', 'CASH_BUCKET', bucketId, {
      type: isPostReceipt ? 'CIRCLYS_PAYBACK' : 'CIRCLYS_CONTRIBUTION',
      investmentId: investment.id,
      monthIndex,
      amount,
      reward,
    })

    return NextResponse.json({ investment: updated, bucketId })
  } catch (error) {
    console.error('Error paying savings month:', error)
    return NextResponse.json({ error: 'Failed to record payment' }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireModuleAccess('savings')
    const user = await getCurrentUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (user.role !== 'OWNER') {
      return NextResponse.json(
        { error: 'Only owners can undo monthly contributions' },
        { status: 403 }
      )
    }

    const { id } = await params

    const investment = await prisma.investment.findUnique({
      where: { id },
      include: { account: true },
    })

    if (!investment || investment.account?.type !== 'CIRCLYS') {
      return NextResponse.json({ error: 'Savings plan not found' }, { status: 404 })
    }

    const body = (await req.json()) as UnpayBody
    const monthIndex = Number(body.monthIndex)

    if (!Number.isInteger(monthIndex) || monthIndex < 0) {
      return NextResponse.json({ error: 'Invalid monthIndex' }, { status: 400 })
    }

    const meta = (() => {
      try {
        return JSON.parse(investment.metadata || '{}')
      } catch {
        return {}
      }
    })()

    const payments: Record<string, any> =
      meta.payments && typeof meta.payments === 'object' ? meta.payments : {}

    const existing = payments[String(monthIndex)]
    const bucketId = existing?.bucketId

    if (!bucketId) {
      return NextResponse.json({ error: 'This month is not paid' }, { status: 400 })
    }

    const isPostReceipt = existing?.postReceipt === true

    if (isPostReceipt) {
      // Reverse: re-credit the cash that was withdrawn
      const refundAmount = (Number(existing.amount) || 0) + (Number(existing.reward) || 0)
      const currency = investment.account?.currency || 'SAR'
      const dueDate = addMonths(new Date(investment.startDate), monthIndex)

      await prisma.$transaction(async (tx: any) => {
        // Find the bucket that the receipt went into and credit it back
        const receivedBucketId = meta.received?.bucketId
        if (receivedBucketId) {
          const bucket = await tx.cashBucket.findUnique({ where: { id: receivedBucketId } })
          if (bucket) {
            await tx.cashBucket.update({
              where: { id: receivedBucketId },
              data: { balance: { increment: refundAmount } },
            })
            await tx.cashBucketMovement.create({
              data: {
                cashBucketId: receivedBucketId,
                investmentId: investment.id,
                amount: refundAmount,
                type: 'CASH_IN',
                date: dueDate,
                notes: `Undo Circlys payback • Month ${monthIndex + 1}`,
              },
            })
          }
        }

        // Update system cash balance
        const setting = await tx.systemSetting.findUnique({ where: { key: CASH_BALANCE_KEY } })
        const currentCash = setting ? Number(setting.value) : 0
        if (setting) {
          await tx.systemSetting.update({
            where: { key: CASH_BALANCE_KEY },
            data: { value: (currentCash + refundAmount).toString() },
          })
        }
      })
    } else {
      // Normal: delete the cash bucket that was created
      await prisma.cashBucket.delete({ where: { id: bucketId } })
    }

    const nextPayments = { ...payments }
    delete nextPayments[String(monthIndex)]

    const totalPaid = Object.values(nextPayments).reduce(
      (sum: number, p: any) => sum + (Number(p.amount) || 0),
      0
    )
    const totalRewardPaid = Object.values(nextPayments).reduce(
      (sum: number, p: any) => sum + (Number(p.reward) || 0),
      0
    )
    const monthsPaid = Object.keys(nextPayments).length

    const updated = await prisma.investment.update({
      where: { id: investment.id },
      data: {
        principalAmount: totalPaid,
        currentValue: totalPaid + totalRewardPaid,
        metadata: JSON.stringify({
          ...meta,
          payments: nextPayments,
          monthsPaid,
          totalPaid,
          totalRewardPaid,
        }),
      },
      include: { account: true },
    })

    await createAuditLog(user.id, 'DELETE', 'CASH_BUCKET', bucketId, {
      type: isPostReceipt ? 'CIRCLYS_PAYBACK_UNDO' : 'CIRCLYS_CONTRIBUTION_UNDO',
      investmentId: investment.id,
      monthIndex,
    })

    return NextResponse.json({ investment: updated })
  } catch (error) {
    console.error('Error undoing savings month payment:', error)
    return NextResponse.json({ error: 'Failed to undo payment' }, { status: 500 })
  }
}
