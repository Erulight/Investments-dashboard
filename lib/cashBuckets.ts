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
    excludeFromZakat,
  }: {
    amount: number
    haulStartDate: Date
    currency?: string
    label?: string | null
    date: Date
    notes?: string | null
    investmentId?: string | null
    type?: MovementType
    excludeFromZakat?: boolean
  }
) => {
  const bucket = await tx.cashBucket.create({
    data: {
      label: label || null,
      currency,
      haulStartDate,
      excludeFromZakat: Boolean(excludeFromZakat),
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

  let availableByBucket: Map<string, number> | null = null
  let maxWithdrawableByBucket: Map<string, number> | null = null
  if (cutoff) {
    const movements = await tx.cashBucketMovement.groupBy({
      by: ['cashBucketId'],
      where: {
        cashBucketId: { in: buckets.map((b: { id: string }) => b.id) },
        date: { lte: cutoff },
      },
      _sum: { amount: true },
    })
    availableByBucket = new Map(
      movements.map((movement: { cashBucketId: string; _sum: { amount: number | null } }) => [
        movement.cashBucketId,
        movement._sum.amount || 0,
      ])
    )

    const futureMovements = await tx.cashBucketMovement.findMany({
      where: {
        cashBucketId: { in: buckets.map((b: { id: string }) => b.id) },
        date: { gt: cutoff },
      },
      orderBy: { date: 'asc' },
    })

    const futureByBucket = new Map<string, typeof futureMovements>()
    for (const movement of futureMovements) {
      const list = futureByBucket.get(movement.cashBucketId) || []
      list.push(movement)
      futureByBucket.set(movement.cashBucketId, list)
    }

    maxWithdrawableByBucket = new Map()
    for (const bucket of buckets) {
      const balanceAtCutoff = availableByBucket.get(bucket.id) ?? 0
      let running = balanceAtCutoff
      let minBalance = balanceAtCutoff
      const future = futureByBucket.get(bucket.id) || []
      for (const movement of future) {
        running += movement.amount
        if (running < minBalance) {
          minBalance = running
        }
      }
      maxWithdrawableByBucket.set(bucket.id, Math.max(0, minBalance))
    }
  }

  for (const bucket of buckets) {
    if (remaining <= 0) break
    const availableBalance = availableByBucket
      ? Math.max(0, maxWithdrawableByBucket?.get(bucket.id) ?? 0)
      : bucket.balance
    const used = Math.min(availableBalance, remaining)
    if (used <= 0) continue

    if (availableByBucket) {
      availableByBucket.set(bucket.id, availableBalance - used)
    }

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
    ? allocations.filter((alloc: { principalRemaining: number }) => alloc.principalRemaining > 0)
    : allocations.filter((alloc: { principalAllocated: number }) => alloc.principalAllocated > 0)

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
    (
      sum: number,
      alloc: { principalRemaining: number; principalAllocated: number }
    ) => sum + (principalFocused ? alloc.principalRemaining : alloc.principalAllocated),
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
