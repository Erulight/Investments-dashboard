import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { requireModuleAccess } from '@/lib/rbac'
import { createAuditLog } from '@/lib/audit'
import { createCashBucket, withdrawFromBuckets } from '@/lib/cashBuckets'
import { recomputeCashSetting } from '@/lib/cashBalance'
import { createSnapshot } from '@/lib/snapshot'

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
    const rewardInput = body.reward !== undefined ? Number(body.reward) : null

    if (!Number.isInteger(monthIndex) || monthIndex < 0) {
      return NextResponse.json({ error: 'Invalid monthIndex' }, { status: 400 })
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })
    }

    if (rewardInput !== null && (!Number.isFinite(rewardInput) || rewardInput < 0)) {
      return NextResponse.json({ error: 'Invalid reward' }, { status: 400 })
    }

    const meta = (() => {
      try {
        return JSON.parse(investment.metadata || '{}')
      } catch {
        return {}
      }
    })()

    const rewardAmountRaw = Number(meta.rewardAmount || 0)
    const configuredRewardAmount = Number.isFinite(rewardAmountRaw) ? Math.max(0, rewardAmountRaw) : 0
    const rewardProgram = String(meta.rewardProgram || 'NONE')
    const monthlyContributionRaw = Number(meta.monthlyContribution || 0)
    const monthlyContribution = Number.isFinite(monthlyContributionRaw)
      ? Math.max(0, monthlyContributionRaw)
      : 0
    const configuredRewardPerMonth = configuredRewardAmount > 0
      ? rewardProgram === 'PERCENTAGE'
        ? monthlyContribution * (configuredRewardAmount / 100)
        : configuredRewardAmount
      : 0

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

    // Prevent payments with dates too far in the future (allow up to 30 days for flexibility)
    const maxFutureDays = 30
    const maxAllowedDate = new Date()
    maxAllowedDate.setDate(maxAllowedDate.getDate() + maxFutureDays)
    if (dueDate.getTime() > maxAllowedDate.getTime()) {
      const dueDateStr = dueDate.toISOString().split('T')[0]
      return NextResponse.json(
        { 
          error: `Payment date (${dueDateStr}) is too far in the future. Maximum allowed is ${maxFutureDays} days from today.`
        },
        { status: 400 }
      )
    }
    const startAnchorRaw = new Date(investment.startDate)
    const contributionHaulStart = Number.isNaN(startAnchorRaw.getTime()) ? contributionDate : startAnchorRaw

    // Determine if this is a post-receipt month (deducts from cash instead of creating a new bucket)
    const isPostReceipt = hasReceived && receiptMonth > 0 && (monthIndex + 1) > receiptMonth
    const rewardForPayment = rewardInput !== null ? rewardInput : configuredRewardPerMonth

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

    if (isPostReceipt) {
      // Post-receipt: withdraw contribution from existing cash balance
      const contributionDeduct = amount
      const postReceiptResult = await prisma.$transaction(async (tx: any) => {
        const paybackNote = `Circlys payback • ${investment.name} • Month ${monthIndex + 1}`

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
          // Circlys plans are owner-administered - never draw from a partner's cash bucket.
          personId: null,
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

        await recomputeCashSetting(tx, null)

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
        }
      })

      postReceiptFundingSources = postReceiptResult.fundingSources

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
          // Circlys plans are owner-administered - never draw from a partner's cash bucket.
          personId: null,
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
                ...(rewardForPayment > 0
                  ? [
                      {
                        investmentId: investment.id,
                        amount: rewardForPayment,
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

        await recomputeCashSetting(tx, null)

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
      },
    }

    const totalPaid = Object.values(nextPayments).reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0)
    const totalRewardPaid = Object.values(nextPayments).reduce((sum: number, p: any) => sum + (Number(p.reward) || 0), 0)
    const monthsPaid = Object.keys(nextPayments).length
    const normalizedTotalMonths = Math.max(0, Math.floor(Number(meta.totalMonths || 0)))
    const rewardMaturedNow = hasReceived && (
      normalizedTotalMonths > 0
        ? monthsPaid >= normalizedTotalMonths
        : monthsPaid > 0
    )
    const nextPaymentEntries = Object.values(nextPayments) as any[]
    const firstContributionDate = nextPaymentEntries
      .map((p: any) => {
        const d = new Date(p?.paidDate || p?.dueDate)
        return Number.isNaN(d.getTime()) ? null : d
      })
      .filter((d: Date | null): d is Date => Boolean(d))
      .sort((a: Date, b: Date) => a.getTime() - b.getTime())[0]
      || contributionHaulStart
    const rewardReceiptDateRaw = normalizedTotalMonths > 0
      ? addMonths(firstContributionDate, normalizedTotalMonths - 1)
      : contributionDate
    const rewardReceiptDate = new Date(
      rewardReceiptDateRaw.getFullYear(),
      rewardReceiptDateRaw.getMonth(),
      rewardReceiptDateRaw.getDate(),
    )
    // Reward receipt keeps Hawl 1 continuity from the first contribution date.
    const rewardHawlAnchor = new Date(
      firstContributionDate.getFullYear(),
      firstContributionDate.getMonth(),
      firstContributionDate.getDate(),
    )

    const nextMeta: any = {
      ...meta,
      payments: nextPayments,
      monthsPaid,
      totalPaid,
      totalRewardPaid,
    }

    let resolvedRewardBucketId =
      typeof meta?.received?.rewardBucketId === 'string' ? meta.received.rewardBucketId : null

    if (rewardMaturedNow && totalRewardPaid > 0.0001) {
      const settledRewardBucketId = await prisma.$transaction(async (tx: any) => {
        const byId = resolvedRewardBucketId
          ? await tx.cashBucket.findUnique({
              where: { id: resolvedRewardBucketId },
              select: { id: true },
            })
          : null

        const existingRewardBucket = byId ?? await tx.cashBucket.findFirst({
          where: {
            personId: null,
            label: `Circlys Reward Receipt • ${investment.name}`,
            movements: {
              some: {
                investmentId: investment.id,
                type: 'CASH_IN',
              },
            },
          },
          select: { id: true, metadata: true },
        })

        const rewardBucketMetadataObject = (() => {
          const raw = existingRewardBucket?.metadata
          if (!raw || typeof raw !== 'string') {
            return {}
          }
          try {
            const parsed = JSON.parse(raw)
            return parsed && typeof parsed === 'object' ? parsed : {}
          } catch {
            return {}
          }
        })()
        const rewardBucketMetadata = JSON.stringify({
          ...rewardBucketMetadataObject,
          firstContributionDate: firstContributionDate.toISOString().split('T')[0],
          isRoscaReward: true,
        })

        const rewardBucket = existingRewardBucket ?? await tx.cashBucket.create({
          data: {
            label: `Circlys Reward Receipt • ${investment.name}`,
            currency,
            balance: 0,
            haulStartDate: rewardHawlAnchor,
            excludeFromZakat: false,
            metadata: rewardBucketMetadata,
          },
          select: { id: true, metadata: true },
        })

        await tx.cashBucket.update({
          where: { id: rewardBucket.id },
          data: {
            haulStartDate: rewardHawlAnchor,
            excludeFromZakat: false,
            metadata: rewardBucketMetadata,
          },
        })

        const credited = await tx.cashBucketMovement.aggregate({
          where: {
            cashBucketId: rewardBucket.id,
            investmentId: investment.id,
            type: 'CASH_IN',
          },
          _sum: { amount: true },
        })

        const creditedReward = Math.max(0, Number(credited?._sum?.amount || 0))
        const rewardShortfall = Math.max(0, totalRewardPaid - creditedReward)

        if (rewardShortfall > 0.0001) {
          await tx.cashBucket.update({
            where: { id: rewardBucket.id },
            data: { balance: { increment: rewardShortfall } },
          })

          await tx.cashBucketMovement.create({
            data: {
              cashBucketId: rewardBucket.id,
              investmentId: investment.id,
              amount: rewardShortfall,
              type: 'CASH_IN',
              date: rewardReceiptDate,
              notes: `Circlys reward receipt • ${investment.name}`,
            },
          })

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
              amount: rewardShortfall,
              date: rewardReceiptDate,
              description: `Circlys reward receipt • ${investment.name}`,
            },
          })

          await recomputeCashSetting(tx, null)
        }

        return rewardBucket.id
      })

      resolvedRewardBucketId = settledRewardBucketId
    }

    if (hasReceived) {
      const previousReceived = meta?.received && typeof meta.received === 'object' ? meta.received : {}
      const previousRewardBucketId =
        typeof previousReceived?.rewardBucketId === 'string' ? previousReceived.rewardBucketId : null
      nextMeta.received = {
        ...previousReceived,
        rewardAmount: rewardMaturedNow ? Math.max(0, totalRewardPaid) : 0,
        rewardBucketId: rewardMaturedNow ? (resolvedRewardBucketId || previousRewardBucketId) : previousRewardBucketId,
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
    const normalizedTotalMonths = Math.max(0, Math.floor(Number(meta.totalMonths || 0)))
    const monthsPaidBeforeUndo = Object.keys(payments).length
    const rewardWasMatureBeforeUndo = hasReceived && (
      normalizedTotalMonths > 0
        ? monthsPaidBeforeUndo >= normalizedTotalMonths
        : monthsPaidBeforeUndo > 0
    )

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
          // Use today's date for haulStartDate to prevent future-dated buckets
          const today = new Date()
          const safeHaulStartDate = dueDate <= today ? dueDate : today
          
          await createCashBucket(tx, {
            amount: remainingToRestore,
            haulStartDate: safeHaulStartDate,
            currency: investment.account?.currency || 'SAR',
            label: 'General Cash',
            date: dueDate,
            notes: paybackUndoNote,
            investmentId: investment.id,
            type: 'CASH_IN',
          })
        }

        const shouldReverseReward = rewardForUndo > 0.0001 && rewardWasMatureBeforeUndo && Boolean(rewardBucketIdForUndo)
        if (shouldReverseReward) {
          const rewardBucket = await tx.cashBucket.findUnique({
            where: { id: rewardBucketIdForUndo as string },
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
            where: { id: rewardBucketIdForUndo as string },
            data: { balance: { decrement: rewardForUndo } },
          })

          await tx.cashBucketMovement.create({
            data: {
              cashBucketId: rewardBucketIdForUndo as string,
              investmentId: investment.id,
              amount: -rewardForUndo,
              type: 'CASH_OUT',
              date: dueDate,
              notes: rewardUndoNote,
            },
          })
        }

        await recomputeCashSetting(tx, null)

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

        if (rewardForUndo > 0.0001 && rewardWasMatureBeforeUndo && rewardBucketIdForUndo) {
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

        await recomputeCashSetting(tx, null)

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
    const rewardMaturedAfterUndo = hasReceived && (
      normalizedTotalMonths > 0
        ? monthsPaid >= normalizedTotalMonths
        : monthsPaid > 0
    )

    const nextMeta: any = {
      ...meta,
      payments: nextPayments,
      monthsPaid,
      totalPaid,
      totalRewardPaid,
    }

    if (hasReceived) {
      const previousReceived = meta?.received && typeof meta.received === 'object' ? meta.received : {}
      const previousRewardBucketId =
        typeof previousReceived?.rewardBucketId === 'string' ? previousReceived.rewardBucketId : null
      nextMeta.received = {
        ...previousReceived,
        rewardAmount: rewardMaturedAfterUndo ? Math.max(0, totalRewardPaid) : 0,
        rewardBucketId: rewardMaturedAfterUndo
          ? (rewardBucketIdForUndo || previousRewardBucketId)
          : previousRewardBucketId,
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
