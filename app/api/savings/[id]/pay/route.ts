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

type FundingSource = {
  cashBucketId: string
  amount: number
}

const addMonths = (date: Date, months: number) => {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d
}

const getReceiptMonth = (meta: any) => Math.max(0, Math.floor(Number(meta?.receiptMonth || 0)))

const isPreReceiptMonthIndex = (receiptMonth: number, monthIndex: number) => {
  if (receiptMonth <= 0) return true
  return (monthIndex + 1) <= receiptMonth
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

    const receiptMonth = getReceiptMonth(meta)
    const hasReceived = Boolean(meta?.received?.date)

    const totalMonths = Number(meta.totalMonths || 0)
    if (totalMonths > 0 && monthIndex >= totalMonths) {
      return NextResponse.json({ error: 'monthIndex exceeds plan totalMonths' }, { status: 400 })
    }

    const payments: Record<string, any> = meta.payments && typeof meta.payments === 'object' ? meta.payments : {}
    if (payments[String(monthIndex)]?.bucketId) {
      return NextResponse.json({ error: 'This month is already paid' }, { status: 400 })
    }

    if (hasReceived && receiptMonth <= 0) {
      return NextResponse.json(
        { error: 'Invalid receipt configuration. Undo receive and configure receipt month first.' },
        { status: 409 },
      )
    }

    if (hasReceived && isPreReceiptMonthIndex(receiptMonth, monthIndex)) {
      return NextResponse.json(
        { error: 'Cannot modify months at or before receipt month after receive. Undo receive first.' },
        { status: 409 },
      )
    }

    const dueDate = addMonths(new Date(investment.startDate), monthIndex)
    const monthLabel = `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, '0')}`
    const contributionDate = dueDate
    const fundingCutoff = new Date()
    const currency = investment.account?.currency || 'SAR'
    const startAnchorRaw = new Date(investment.startDate)
    const contributionHaulStart = Number.isNaN(startAnchorRaw.getTime()) ? contributionDate : startAnchorRaw

    // Determine if this is a post-receipt month (deducts from cash instead of creating a new bucket)
    const isPostReceipt = hasReceived && receiptMonth > 0 && (monthIndex + 1) > receiptMonth
    const rewardForPayment = reward

    // Snapshot before making changes to savings plan
    await createSnapshot(prisma as any, {
      label: `Before: Savings Pay ${investment.name}  Month ${monthIndex + 1}`,
      trigger: 'SAVINGS_PAY',
      userId: user.id,
      investmentId: investment.id,
      personId: user.personId || undefined,
    })

    let bucketId: string
    let postReceiptFundingSources: FundingSource[] = []
    let postReceiptRewardBucketId: string | null = null

    if (isPostReceipt) {
      // Post-receipt: withdraw contribution from existing cash balance
      const contributionDeduct = amount
      const postReceiptResult = await prisma.$transaction(async (tx: any) => {
        const paybackNote = `Circlys payback • ${investment.name} • Month ${monthIndex + 1}`
        const postReceiptRewardNote = `Circlys post-receipt reward • ${investment.name} • Month ${monthIndex + 1}`
        let rewardBucketId: string | null = null

        const fundingSources = await withdrawFromBuckets(tx, {
          amount: contributionDeduct,
          currency,
          date: contributionDate,
          type: 'CASH_OUT',
          investmentId: investment.id,
          notes: paybackNote,
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
            description: paybackNote,
          },
        })

        if (rewardForPayment > 0.0001) {
          const rewardBucketIdFromMeta =
            typeof meta?.received?.rewardBucketId === 'string' ? meta.received.rewardBucketId : null
          const existingRewardBucket = rewardBucketIdFromMeta
            ? await tx.cashBucket.findUnique({ where: { id: rewardBucketIdFromMeta }, select: { id: true } })
            : null

          const rewardBucket = existingRewardBucket ?? await tx.cashBucket.create({
            data: {
              label: `Circlys Reward Receipt • ${investment.name}`,
              currency,
              balance: 0,
              haulStartDate: contributionHaulStart,
              excludeFromZakat: false,
              personId: null,
            },
            select: { id: true },
          })

          rewardBucketId = rewardBucket.id

          await tx.cashBucket.update({
            where: { id: rewardBucketId },
            data: {
              balance: { increment: rewardForPayment },
              haulStartDate: contributionHaulStart,
              excludeFromZakat: false,
              personId: null,
            },
          })

          await tx.cashBucketMovement.create({
            data: {
              cashBucketId: rewardBucketId,
              investmentId: investment.id,
              amount: rewardForPayment,
              type: 'CASH_IN',
              date: contributionDate,
              notes: postReceiptRewardNote,
            },
          })

          await tx.transaction.create({
            data: {
              accountId: cashAccount.id,
              investmentId: investment.id,
              personId: null,
              type: 'CASH_IN',
              amount: rewardForPayment,
              date: contributionDate,
              description: postReceiptRewardNote,
            },
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
            value: cashBucketSum.toString(),
            description: 'Available cash balance for investments',
          },
        })

        return {
          fundingSources: (Array.isArray(fundingSources) ? fundingSources : [])
            .map((f: any) => {
              const cashBucketId = typeof f?.cashBucketId === 'string' ? f.cashBucketId : null
              const amountRaw = Number(f?.amount || 0)
              const amount = Number.isFinite(amountRaw) ? Math.max(0, amountRaw) : 0
              if (!cashBucketId || amount <= 0) return null
              return { cashBucketId, amount }
            })
            .filter((x: FundingSource | null): x is FundingSource => Boolean(x)),
          rewardBucketId,
        }
      })

      postReceiptFundingSources = postReceiptResult.fundingSources
      postReceiptRewardBucketId = postReceiptResult.rewardBucketId || null

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
        reward: rewardForPayment,
        bucketId,
        postReceipt: isPostReceipt || false,
        ...(isPostReceipt ? { fundingSources: postReceiptFundingSources } : {}),
        ...(isPostReceipt && postReceiptRewardBucketId ? { rewardBucketId: postReceiptRewardBucketId } : {}),
      },
    }

    const totalPaid = Object.values(nextPayments).reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0)
    const totalRewardPaid = Object.values(nextPayments).reduce((sum: number, p: any) => sum + (Number(p.reward) || 0), 0)
    const monthsPaid = Object.keys(nextPayments).length

    const nextMeta: any = {
      ...meta,
      payments: nextPayments,
      monthsPaid,
      totalPaid,
      totalRewardPaid,
    }

    if (hasReceived && isPostReceipt && rewardForPayment > 0.0001) {
      const previousReceived = meta?.received && typeof meta.received === 'object' ? meta.received : {}
      const previousReceivedReward = Number(previousReceived?.rewardAmount || 0)
      nextMeta.received = {
        ...previousReceived,
        rewardAmount: Math.max(0, previousReceivedReward + rewardForPayment),
        ...(postReceiptRewardBucketId ? { rewardBucketId: postReceiptRewardBucketId } : {}),
      }
    }

    const updated = await prisma.investment.update({
      where: { id: investment.id },
      data: {
        principalAmount: totalPaid,
        currentValue: totalPaid + totalRewardPaid,
        metadata: JSON.stringify(nextMeta),
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
      reward: rewardForPayment,
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
      } else if (error.message === 'POST_RECEIPT_REWARD_BUCKET_MISSING') {
        statusCode = 409
        errorMessage = 'Reward receipt bucket is missing. Refresh and try again.'
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
    const rewardForUndo = Math.max(0, Number(existing?.reward) || 0)
    const dueDate = addMonths(new Date(investment.startDate), monthIndex)
    const startAnchorRaw = new Date(investment.startDate)
    const contributionHaulStart = Number.isNaN(startAnchorRaw.getTime()) ? dueDate : startAnchorRaw
    const receiptMonth = getReceiptMonth(meta)
    const hasReceived = Boolean(meta?.received?.date)
    const isPreReceiptMonth = isPreReceiptMonthIndex(receiptMonth, monthIndex)
    const paymentRewardBucketId = typeof existing?.rewardBucketId === 'string' ? existing.rewardBucketId : null
    const receivedRewardBucketId = typeof meta?.received?.rewardBucketId === 'string' ? meta.received.rewardBucketId : null
    const rewardBucketIdForUndo = paymentRewardBucketId || receivedRewardBucketId

    if (hasReceived && receiptMonth <= 0) {
      return NextResponse.json(
        { error: 'Invalid receipt configuration. Undo receive and configure receipt month first.' },
        { status: 409 },
      )
    }

    if (hasReceived && isPreReceiptMonth) {
      return NextResponse.json(
        { error: 'Cannot undo months at or before receipt month after receive. Undo receive first.' },
        { status: 409 },
      )
    }

    if (isPostReceipt && !hasReceived) {
      return NextResponse.json(
        { error: 'Invalid month state. Cannot undo post-receipt payment before receive.' },
        { status: 409 },
      )
    }

    if (isPostReceipt) {
      // Reverse: re-credit the exact funding buckets when available.
      await prisma.$transaction(async (tx: any) => {
        const paybackUndoNote = `Undo Circlys payback • ${investment.name} • Month ${monthIndex + 1}`
        const rewardUndoNote = `Undo Circlys post-receipt reward • ${investment.name} • Month ${monthIndex + 1}`
        const fundingSources = Array.isArray(existing?.fundingSources) ? existing.fundingSources : []
        let remainingToRestore = Math.max(0, contributionAmount)

        for (const source of fundingSources) {
          const sourceBucketId = typeof source?.cashBucketId === 'string' ? source.cashBucketId : null
          const sourceAmountRaw = Number(source?.amount || 0)
          const sourceAmount = Number.isFinite(sourceAmountRaw) ? Math.max(0, sourceAmountRaw) : 0
          if (!sourceBucketId || sourceAmount <= 0 || remainingToRestore <= 0) continue

          const restoreAmount = Math.min(remainingToRestore, sourceAmount)
          const bucket = await tx.cashBucket.findUnique({ where: { id: sourceBucketId } })
          if (!bucket) continue

          if (restoreAmount > 0) {
            await tx.cashBucket.update({
              where: { id: sourceBucketId },
              data: { balance: { increment: restoreAmount } },
            })
            await tx.cashBucketMovement.create({
              data: {
                cashBucketId: sourceBucketId,
                investmentId: investment.id,
                amount: restoreAmount,
                type: 'CASH_IN',
                date: dueDate,
                notes: paybackUndoNote,
              },
            })
            remainingToRestore -= restoreAmount
          }
        }

        // Fallback for legacy payments (without fundingSources) or deleted source buckets.
        if (remainingToRestore > 0.0001) {
          await createCashBucket(tx, {
            amount: remainingToRestore,
            haulStartDate: dueDate,
            currency: investment.account?.currency || 'SAR',
            label: 'General Cash',
            date: dueDate,
            notes: paybackUndoNote,
            investmentId: investment.id,
            type: 'CASH_IN',
          })
        }

        if (rewardForUndo > 0.0001) {
          if (!rewardBucketIdForUndo) {
            throw new Error('POST_RECEIPT_REWARD_BUCKET_MISSING')
          }

          const rewardBucket = await tx.cashBucket.findUnique({
            where: { id: rewardBucketIdForUndo },
            select: { id: true, balance: true },
          })

          if (!rewardBucket) {
            throw new Error('POST_RECEIPT_REWARD_BUCKET_MISSING')
          }

          const rewardBucketBalance = Number(rewardBucket.balance || 0)
          if (rewardBucketBalance < rewardForUndo - 0.0001) {
            throw new Error('POST_RECEIPT_REWARD_ALREADY_USED')
          }

          await tx.cashBucket.update({
            where: { id: rewardBucketIdForUndo },
            data: { balance: { decrement: rewardForUndo } },
          })

          await tx.cashBucketMovement.create({
            data: {
              cashBucketId: rewardBucketIdForUndo,
              investmentId: investment.id,
              amount: -rewardForUndo,
              type: 'CASH_OUT',
              date: dueDate,
              notes: rewardUndoNote,
            },
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
              description: paybackUndoNote,
            },
          })
        }

        if (rewardForUndo > 0.0001) {
          await tx.transaction.create({
            data: {
              accountId: cashAccount.id,
              investmentId: investment.id,
              personId: null,
              type: 'CASH_OUT',
              amount: -rewardForUndo,
              date: dueDate,
              description: rewardUndoNote,
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

    const nextMeta: any = {
      ...meta,
      payments: nextPayments,
      monthsPaid,
      totalPaid,
      totalRewardPaid,
    }

    if (hasReceived && isPostReceipt && rewardForUndo > 0.0001) {
      const previousReceived = meta?.received && typeof meta.received === 'object' ? meta.received : {}
      const previousReceivedReward = Number(previousReceived?.rewardAmount || 0)
      nextMeta.received = {
        ...previousReceived,
        rewardAmount: Math.max(0, previousReceivedReward - rewardForUndo),
        ...(rewardBucketIdForUndo ? { rewardBucketId: rewardBucketIdForUndo } : {}),
      }
    }

    const updated = await prisma.investment.update({
      where: { id: investment.id },
      data: {
        principalAmount: totalPaid,
        currentValue: totalPaid + totalRewardPaid,
        metadata: JSON.stringify(nextMeta),
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
      } else if (error.message === 'POST_RECEIPT_REWARD_BUCKET_MISSING') {
        statusCode = 409
        errorMessage = 'Reward receipt bucket is missing. Refresh and try again.'
      } else if (error.message === 'POST_RECEIPT_REWARD_ALREADY_USED') {
        statusCode = 409
        errorMessage = 'Cannot undo this month because its reward cash has already been used.'
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
