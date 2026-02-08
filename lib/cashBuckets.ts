import type { Prisma } from '@prisma/client'

type MovementType =
  | 'CASH_IN'
  | 'CASH_OUT'
  | 'INVEST_OUT'
  | 'WITHDRAW_PROFIT'
  | 'WITHDRAW_PRINCIPAL'
  | 'ROLLBACK_PRINCIPAL'
  | 'SELL_RECEIPT'
  | 'ZAKAT_PAID'

const DEFAULT_CURRENCY = 'SAR'

export const createCashBucket = async (
  tx: Prisma.TransactionClient,
  {
    amount,
    haulStartDate,
    currency = DEFAULT_CURRENCY,
    label,
    date,
    notes,
    investmentId,
    type = 'CASH_IN',
  }: {
    amount: number
    haulStartDate: Date
    currency?: string
    label?: string | null
    date: Date
    notes?: string | null
    investmentId?: string | null
    type?: MovementType
  }
) => {
  const bucket = await tx.cashBucket.create({
    data: {
      label: label || null,
      currency,
      haulStartDate,
      balance: amount,
    },
  })

  await tx.cashBucketMovement.create({
    data: {
      cashBucketId: bucket.id,
      investmentId: investmentId || null,
      amount,
      type,
      date,
      notes: notes || null,
    },
  })

  return bucket
}

export const withdrawFromBuckets = async (
  tx: Prisma.TransactionClient,
  {
    amount,
    currency = DEFAULT_CURRENCY,
    date,
    type,
    investmentId,
    notes,
    allocateToInvestment,
    availableOnOrBefore,
  }: {
    amount: number
    currency?: string
    date: Date
    type: MovementType
    investmentId?: string | null
    notes?: string | null
    allocateToInvestment?: boolean
    availableOnOrBefore?: Date
  }
) => {
  let remaining = amount
  const cutoff = availableOnOrBefore ?? date

  const buckets = await tx.cashBucket.findMany({
    where: {
      currency,
      balance: { gt: 0 },
      ...(cutoff ? { haulStartDate: { lte: cutoff } } : {}),
    },
    orderBy: [{ haulStartDate: 'asc' }, { createdAt: 'asc' }],
  })

  for (const bucket of buckets) {
    if (remaining <= 0) break
    const used = Math.min(bucket.balance, remaining)
    if (used <= 0) continue

    await tx.cashBucket.update({
      where: { id: bucket.id },
      data: { balance: { decrement: used } },
    })

    await tx.cashBucketMovement.create({
      data: {
        cashBucketId: bucket.id,
        investmentId: investmentId || null,
        amount: -used,
        type,
        date,
        notes: notes || null,
      },
    })

    if (allocateToInvestment && investmentId) {
      const existing = await tx.investmentBucketAllocation.findUnique({
        where: {
          investmentId_cashBucketId: {
            investmentId,
            cashBucketId: bucket.id,
          },
        },
      })

      if (existing) {
        await tx.investmentBucketAllocation.update({
          where: { id: existing.id },
          data: {
            principalAllocated: existing.principalAllocated + used,
            principalRemaining: existing.principalRemaining + used,
          },
        })
      } else {
        await tx.investmentBucketAllocation.create({
          data: {
            investmentId,
            cashBucketId: bucket.id,
            principalAllocated: used,
            principalRemaining: used,
          },
        })
      }
    }

    remaining -= used
  }

  if (remaining > 0.0001) {
    throw new Error('INSUFFICIENT_CASH')
  }
}

export const creditBucketsForReceipt = async (
  tx: Prisma.TransactionClient,
  {
    investmentId,
    amount,
    principalReduction = 0,
    date,
    type,
    notes,
  }: {
    investmentId: string
    amount: number
    principalReduction?: number
    date: Date
    type: MovementType
    notes?: string | null
  }
) => {
  const allocations = await tx.investmentBucketAllocation.findMany({
    where: {
      investmentId,
    },
  })

  const principalFocused = principalReduction > 0
  const usableAllocations = principalFocused
    ? allocations.filter((alloc) => alloc.principalRemaining > 0)
    : allocations.filter((alloc) => alloc.principalAllocated > 0)

  if (usableAllocations.length === 0) {
    await createCashBucket(tx, {
      amount,
      haulStartDate: date,
      date,
      notes,
      type,
      investmentId,
    })
    return
  }

  const totalRemaining = usableAllocations.reduce(
    (sum, alloc) => sum + (principalFocused ? alloc.principalRemaining : alloc.principalAllocated),
    0
  )
  const cappedReduction = principalFocused ? Math.min(principalReduction, totalRemaining) : 0

  for (const alloc of usableAllocations) {
    const ratioBasis = principalFocused ? alloc.principalRemaining : alloc.principalAllocated
    const ratio = totalRemaining > 0 ? ratioBasis / totalRemaining : 0
    const cashShare = amount * ratio
    const principalShare = cappedReduction * ratio

    await tx.cashBucket.update({
      where: { id: alloc.cashBucketId },
      data: { balance: { increment: cashShare } },
    })

    await tx.cashBucketMovement.create({
      data: {
        cashBucketId: alloc.cashBucketId,
        investmentId,
        amount: cashShare,
        type,
        date,
        notes: notes || null,
      },
    })

    if (principalShare > 0) {
      await tx.investmentBucketAllocation.update({
        where: { id: alloc.id },
        data: {
          principalRemaining: Math.max(0, alloc.principalRemaining - principalShare),
        },
      })
    }
  }
}
