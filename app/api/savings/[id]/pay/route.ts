import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { requireModuleAccess } from '@/lib/rbac'
import { createAuditLog } from '@/lib/audit'
import { createCashBucket, withdrawFromBuckets } from '@/lib/cashBuckets'
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
    const fundingCutoff = new Date()
    const currency = investment.account?.currency || 'SAR'
    const startAnchorRaw = new Date(investment.startDate)
    const contributionHaulStart = Number.isNaN(startAnchorRaw.getTime()) ? contributionDate : startAnchorRaw

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
      const contributionDeduct = amount
      await prisma.$transaction(async (tx: any) => {
        await withdrawFromBuckets(tx, {
          amount: contributionDeduct,
          currency,
          date: contributionDate,
          type: 'CASH_OUT',
          investmentId: investment.id,
          notes: `Circlys payback • ${investment.name} • Month ${monthIndex + 1}`,
          // Allow funding from currently available cash even when recording past-due months.
          availableOnOrBefore: fundingCutoff,
          // Do not fund paybacks from the Savings Receipt bucket.
          excludeLabelPrefixes: ['Circlys •', 'Savings Receipt •'],
        })

        // Record transaction in Cash Ledger for visibility
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
            type: 'CASH_OUT',
            amount: -contributionDeduct,
            date: contributionDate,
            description: `Circlys payback • ${investment.name} • Month ${monthIndex + 1}`,
          },
        })

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

        return null
      })

      // Use a placeholder bucket ID to mark as paid without a real bucket
      bucketId = `post-receipt-${investment.id}-${monthIndex}`
    } else {
      // Normal pre-receipt: create a new cash bucket with its own haul
      const contributionDeduct = amount

      const result = await prisma.$transaction(async (tx: any) => {
        // Move contribution out of available cash buckets first, so General Cash is reduced.
        await withdrawFromBuckets(tx, {
          amount: contributionDeduct,
          currency,
          date: contributionDate,
          type: 'CASH_OUT',
          investmentId: investment.id,
          notes: `Circlys contribution • ${investment.name} • Month ${monthIndex + 1}`,
          // Allow funding from currently available cash even when recording past-due months.
          availableOnOrBefore: fundingCutoff,
          excludeLabelPrefixes: ['Circlys •'],
        })

        // Record transaction in Cash Ledger for visibility
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
            type: 'CASH_OUT',
            amount: -contributionDeduct,
            date: contributionDate,
            description: `Circlys contribution • ${investment.name} • Month ${monthIndex + 1}`,
          },
        })

        const bucket = await tx.cashBucket.create({
          data: {
            label: `Circlys • ${investment.name} • ${monthLabel}`,
            currency,
            // All savings contributions share one hawl anchor (first contribution/start date).
            haulStartDate: contributionHaulStart,
            excludeFromZakat: true,
            balance: 0, // Start at 0 since money was already withdrawn from existing buckets
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

        return bucket
      })

      bucketId = result.id
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

    await prisma.cashBucket.updateMany({
      where: {
        label: { startsWith: `Circlys Reward • ${investment.name} •` },
        personId: null,
      },
      data: {
        excludeFromZakat: true,
        haulStartDate: contributionHaulStart,
      },
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
    
    let statusCode = 500
    let errorMessage = 'Failed to record payment'
    
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        statusCode = 401
      } else if (error.message === 'Forbidden') {
        statusCode = 403
      } else if (error.message === 'INSUFFICIENT_CASH') {
        statusCode = 400
        errorMessage = 'Insufficient cash balance'
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

    // Snapshot before undoing a savings payment
    await createSnapshot(prisma as any, {
      label: `Before: Savings Unpay ${investment.name} • Month ${monthIndex + 1}`,
      trigger: 'SAVINGS_UNPAY',
      userId: user.id,
      investmentId: investment.id,
      personId: user.personId || undefined,
    })

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
    const contributionAmount = Number(existing?.amount) || 0
    const dueDate = addMonths(new Date(investment.startDate), monthIndex)
    const startAnchorRaw = new Date(investment.startDate)
    const contributionHaulStart = Number.isNaN(startAnchorRaw.getTime()) ? dueDate : startAnchorRaw

    if (isPostReceipt) {
      // Reverse: re-credit the cash that was withdrawn
      await prisma.$transaction(async (tx: any) => {
        // Find the bucket that the receipt went into and credit it back
        const receivedBucketId = meta.received?.bucketId
        let creditedToBucket = false
        if (receivedBucketId) {
          const bucket = await tx.cashBucket.findUnique({ where: { id: receivedBucketId } })
          if (bucket) {
            await tx.cashBucket.update({
              where: { id: receivedBucketId },
              data: { balance: { increment: contributionAmount } },
            })
            await tx.cashBucketMovement.create({
              data: {
                cashBucketId: receivedBucketId,
                investmentId: investment.id,
                amount: contributionAmount,
                type: 'CASH_IN',
                date: dueDate,
                notes: `Undo Circlys payback • Month ${monthIndex + 1}`,
              },
            })
            creditedToBucket = true
          }
        }

        // Fallback: if receipt bucket no longer exists, restore to a normal cash bucket.
        if (!creditedToBucket && contributionAmount > 0) {
          await createCashBucket(tx, {
            amount: contributionAmount,
            haulStartDate: dueDate,
            currency: investment.account?.currency || 'SAR',
            label: 'General Cash',
            date: dueDate,
            notes: `Undo Circlys payback • ${investment.name} • Month ${monthIndex + 1}`,
            investmentId: investment.id,
            type: 'CASH_IN',
          })
        }

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
            value: Math.max(0, cashBucketSum).toString(),
            description: 'Available cash balance for investments',
          },
        })

        // Record transaction in Cash Ledger for visibility
        const cashAccount =
          (await tx.account.findFirst({ where: { type: 'CASH', isActive: true } })) ??
          (await tx.account.create({
            data: { name: 'Cash Balance', type: 'CASH', currency: investment.account?.currency || 'SAR', description: 'Cash ledger account' },
          }))

        if (contributionAmount > 0) {
          await tx.transaction.create({
            data: {
              accountId: cashAccount.id,
              investmentId: investment.id,
              personId: null,
              type: 'CASH_IN',
              amount: contributionAmount,
              date: dueDate,
              description: `Undo Circlys payback • ${investment.name} • Month ${monthIndex + 1}`,
            },
          })
        }

      })
    } else {
      // Normal: delete the contribution bucket and restore available cash
      await prisma.$transaction(async (tx: any) => {
        const contributionBucket = await tx.cashBucket.findUnique({
          where: { id: bucketId },
          select: { haulStartDate: true, currency: true },
        })

        await tx.cashBucket.delete({ where: { id: bucketId } })

        if (contributionAmount > 0) {
          await createCashBucket(tx, {
            amount: contributionAmount,
            haulStartDate: contributionHaulStart,
            currency: contributionBucket?.currency || investment.account?.currency || 'SAR',
            label: 'General Cash',
            date: dueDate,
            notes: `Undo Circlys contribution • ${investment.name} • Month ${monthIndex + 1}`,
            investmentId: investment.id,
            type: 'CASH_IN',
          })
        }

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
            value: Math.max(0, cashBucketSum).toString(),
            description: 'Available cash balance for investments',
          },
        })

        // Record transaction in Cash Ledger for visibility
        const cashAccount =
          (await tx.account.findFirst({ where: { type: 'CASH', isActive: true } })) ??
          (await tx.account.create({
            data: { name: 'Cash Balance', type: 'CASH', currency: contributionBucket?.currency || investment.account?.currency || 'SAR', description: 'Cash ledger account' },
          }))

        if (contributionAmount > 0) {
          await tx.transaction.create({
            data: {
              accountId: cashAccount.id,
              investmentId: investment.id,
              personId: null,
              type: 'CASH_IN',
              amount: contributionAmount,
              date: dueDate,
              description: `Undo Circlys contribution • ${investment.name} • Month ${monthIndex + 1}`,
            },
          })
        }

      })
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
    
    let statusCode = 500
    let errorMessage = 'Failed to undo payment'
    
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        statusCode = 401
      } else if (error.message === 'Forbidden') {
        statusCode = 403
      } else if (error.message === 'INSUFFICIENT_CASH') {
        statusCode = 400
        errorMessage = 'Insufficient cash balance'
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
