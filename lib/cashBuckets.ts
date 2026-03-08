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

const parseMetadata = (value: unknown) => {
  if (!value) return null
  if (typeof value === 'object') return value as any
  if (typeof value !== 'string') return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

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
    personId,
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
    personId?: string | null
  }
) => {
  const bucket = await tx.cashBucket.create({
    data: {
      label: label || null,
      currency,
      haulStartDate,
      excludeFromZakat: Boolean(excludeFromZakat),
      personId: personId || null,
      balance: amount,
    } as any,
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
    personId,
    excludeLabelPrefixes,
  }: {
    amount: number
    currency?: string
    date: Date
    type: MovementType
    investmentId?: string | null
    notes?: string | null
    allocateToInvestment?: boolean
    availableOnOrBefore?: Date
    personId?: string | null
    excludeLabelPrefixes?: string[]
  }
) => {
  let remaining = amount
  const cutoff = availableOnOrBefore ?? date

  const buckets = await tx.cashBucket.findMany({
    where: {
      currency,
      balance: { gt: 0 },
      ...(personId === undefined ? {} : { personId: personId || null }),
      ...(cutoff ? { haulStartDate: { lte: cutoff } } : {}),
      ...(Array.isArray(excludeLabelPrefixes) && excludeLabelPrefixes.length > 0
        ? {
            OR: [
              { label: null },
              {
                NOT: {
                  OR: excludeLabelPrefixes.map((prefix) => ({
                    label: { startsWith: prefix },
                  })),
                },
              },
            ],
          }
        : {}),
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
    personId,
    profitHaulStartDate,
  }: {
    investmentId: string
    amount: number
    principalReduction?: number
    date: Date
    type: MovementType
    notes?: string | null
    personId?: string | null
    profitHaulStartDate?: Date
  }
) => {
  const isProfitOnly = type === 'WITHDRAW_PROFIT'
  const isPrincipalOnly = type === 'WITHDRAW_PRINCIPAL' || type === 'ROLLBACK_PRINCIPAL'
  const isSellReceipt = type === 'SELL_RECEIPT'

  const principalAmount = isPrincipalOnly
    ? Math.max(0, amount)
    : isSellReceipt
      ? Math.max(0, principalReduction)
      : 0

  const profitAmount = isProfitOnly
    ? Math.max(0, amount)
    : isSellReceipt
      ? Math.max(0, amount - Math.max(0, principalReduction))
      : 0

  const creditToAllocatedBuckets = async (creditAmount: number, reductionAmount: number) => {
    if (creditAmount <= 0) return

    // For principal withdrawals from ROSCA-funded Sukuk, use savingsHaulStartDate
    // For profit withdrawals, use investment startDate
    // Otherwise trace back via INVEST_OUT movements
    let originalHaulDate: Date | null = null

    const invMeta = await tx.investment.findUnique({
      where: { id: investmentId },
      select: { metadata: true, startDate: true },
    })

    const isPrincipalReceipt = type === 'WITHDRAW_PRINCIPAL' || type === 'ROLLBACK_PRINCIPAL'

    if (isPrincipalReceipt) {
      // Principal: use ROSCA first contribution date if available
      const meta = parseMetadata(invMeta?.metadata)
      const savingsDate = meta?.savingsHaulStartDate ? new Date(meta.savingsHaulStartDate) : null
      if (savingsDate && !Number.isNaN(savingsDate.getTime())) {
        originalHaulDate = new Date(savingsDate.getFullYear(), savingsDate.getMonth(), savingsDate.getDate())
      }
    }

    if (!originalHaulDate) {
      // Fallback: trace back via INVEST_OUT movements
      const allInvestMovements = await tx.cashBucketMovement.findMany({
        where: {
          investmentId,
          type: 'INVEST_OUT',
        },
        select: {
          cashBucketId: true,
          date: true,
        },
        orderBy: { date: 'asc' },
      })

      if (allInvestMovements.length > 0) {
        const earliestBucketId = allInvestMovements[0].cashBucketId
        const originalBucket = await tx.cashBucket.findUnique({
          where: { id: earliestBucketId },
          select: { haulStartDate: true },
        })

        if (originalBucket) {
          originalHaulDate = originalBucket.haulStartDate
        } else {
          const cashInMovement = await tx.cashBucketMovement.findFirst({
            where: { cashBucketId: earliestBucketId, type: 'CASH_IN' },
            select: { date: true },
            orderBy: { date: 'asc' },
          })
          if (cashInMovement) {
            originalHaulDate = cashInMovement.date
          }
        }
      }
    }

    const allocations = await tx.investmentBucketAllocation.findMany({
      where: {
        investmentId,
        ...(personId === undefined
          ? {}
          : {
              cashBucket: {
                personId: personId,
              },
            }),
      } as any,
      include: {
        cashBucket: {
          select: {
            id: true,
            haulStartDate: true,
          },
        },
      },
    })

    const principalFocused = reductionAmount > 0
    const usableAllocations = principalFocused
      ? allocations.filter((alloc: { principalRemaining: number }) => alloc.principalRemaining > 0)
      : allocations.filter((alloc: { principalAllocated: number }) => alloc.principalAllocated > 0)

    if (usableAllocations.length === 0) {
      // No allocations found - create new bucket with original haul date
      let haulStartDate = originalHaulDate || date

      if (!originalHaulDate && personId) {
        // Fallback: check deal participant acquired date
        const participation = await tx.dealParticipant.findFirst({
          where: {
            investmentId,
            personId,
          },
          select: {
            acquiredAt: true,
            investment: { select: { startDate: true } },
          },
        })

        const acquiredAt = participation?.acquiredAt || participation?.investment?.startDate
        if (acquiredAt instanceof Date && !Number.isNaN(acquiredAt.getTime())) {
          haulStartDate = new Date(acquiredAt.getFullYear(), acquiredAt.getMonth(), acquiredAt.getDate())
        }
      }

      // Check if there's an existing bucket we can credit to
      if (type === 'WITHDRAW_PRINCIPAL' && personId) {
        const inv = await tx.investment.findUnique({
          where: { id: investmentId },
          select: { name: true },
        })
        const label = `Sukuk Principal • ${inv?.name || investmentId}`
        const existing = await tx.cashBucket.findFirst({
          where: {
            label,
            personId: personId,
          },
          select: { id: true },
        })

        if (existing) {
          await tx.cashBucket.update({
            where: { id: existing.id },
            data: { balance: { increment: creditAmount } },
          })

          await tx.cashBucketMovement.create({
            data: {
              cashBucketId: existing.id,
              investmentId,
              amount: creditAmount,
              type,
              date,
              notes: notes || null,
            },
          })
          return
        }
      }

      await createCashBucket(tx, {
        amount: creditAmount,
        haulStartDate,
        date,
        notes: notes || null,
        investmentId,
        type,
        personId: personId === undefined ? undefined : personId,
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
    const cappedReduction = principalFocused ? Math.min(reductionAmount, totalRemaining) : 0

    for (const alloc of usableAllocations) {
      const ratioBasis = principalFocused ? alloc.principalRemaining : alloc.principalAllocated
      const ratio = totalRemaining > 0 ? ratioBasis / totalRemaining : 0
      const cashShare = creditAmount * ratio
      const principalShare = cappedReduction * ratio

      // Check if the original bucket still exists
      const originalBucket = await tx.cashBucket.findUnique({
        where: { id: alloc.cashBucketId },
        select: { id: true, haulStartDate: true, excludeFromZakat: true },
      })

      if (originalBucket) {
        // If original bucket is excluded from Zakat (e.g., Savings Receipt bucket),
        // don't credit back to it for principal withdrawals - create a new bucket instead
        // so the withdrawn principal is subject to Zakat
        const shouldCreateNewBucket = 
          originalBucket.excludeFromZakat && 
          (type === 'WITHDRAW_PRINCIPAL' || type === 'ROLLBACK_PRINCIPAL')

        if (shouldCreateNewBucket) {
          // Create new bucket for principal withdrawal (not excluded from Zakat)
          const haulStartDate = originalHaulDate || originalBucket.haulStartDate || date
          const newBucket = await createCashBucket(tx, {
            amount: cashShare,
            haulStartDate,
            date,
            notes: notes || null,
            investmentId,
            type,
            personId: personId === undefined ? undefined : personId,
            excludeFromZakat: false, // Principal withdrawals should be subject to Zakat
          })

          await tx.investmentBucketAllocation.update({
            where: { id: alloc.id },
            data: { cashBucketId: newBucket.id },
          })
        } else {
          // Credit back to the original bucket to preserve haul date
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
        }
      } else {
        // Original bucket was deleted, create new one with preserved haul date
        // Use originalHaulDate from INVEST_OUT movements if available
        const haulStartDate = originalHaulDate || (alloc as any).cashBucket?.haulStartDate || date
        const newBucket = await createCashBucket(tx, {
          amount: cashShare,
          haulStartDate,
          date,
          notes: notes || null,
          investmentId,
          type,
          personId: personId === undefined ? undefined : personId,
        })

        await tx.investmentBucketAllocation.update({
          where: { id: alloc.id },
          data: { cashBucketId: newBucket.id },
        })
      }

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

  const creditProfitToNewBucket = async (profit: number) => {
    if (profit <= 0) return

    const inv = await tx.investment.findUnique({
      where: { id: investmentId },
      select: { name: true, startDate: true, metadata: true, account: { select: { type: true } } },
    })

    const investmentName = inv?.name || investmentId
    const bucketLabel = `Profit • ${investmentName}`

    const existingProfitBucket = await tx.cashBucket.findFirst({
      where: {
        label: bucketLabel,
        personId: personId ?? null,
      },
      select: { id: true },
    })

    if (existingProfitBucket) {
      await tx.cashBucket.update({
        where: { id: existingProfitBucket.id },
        data: { balance: { increment: profit } },
      })

      await tx.cashBucketMovement.create({
        data: {
          cashBucketId: existingProfitBucket.id,
          investmentId,
          amount: profit,
          type: 'CASH_IN',
          date,
          notes: 'Profit receipt',
        },
      })
      return existingProfitBucket
    }

    // Determine haul start date for profit bucket
    // Priority: 1) Explicit param, 2) Original cash bucket haul date, 3) Receipt date
    let haulStartDate = date

    const explicit = profitHaulStartDate instanceof Date ? profitHaulStartDate : profitHaulStartDate ? new Date(profitHaulStartDate as any) : null
    const explicitHaulStart = explicit && !Number.isNaN(explicit.getTime())
      ? new Date(explicit.getFullYear(), explicit.getMonth(), explicit.getDate())
      : null

    if (explicitHaulStart) {
      haulStartDate = explicitHaulStart
    } else {
      // Check if investment was funded from ROSCA savings
      const meta = inv?.metadata ? JSON.parse(inv.metadata as string) : null
      const haulStart = meta?.savingsHaulStartDate
        ? new Date(meta.savingsHaulStartDate)
        : inv?.startDate

      if (haulStart) {
        const startDate = haulStart instanceof Date
          ? haulStart
          : new Date(haulStart as any)

        if (!Number.isNaN(startDate.getTime())) {
          haulStartDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate())
        }
      }
      // Otherwise use receipt date (already set above)
    }

    await createCashBucket(tx, {
      amount: profit,
      haulStartDate,
      date,
      notes: notes || null,
      investmentId,
      type: 'CASH_IN',
      excludeFromZakat: false,
      personId: personId ?? null,
      label: bucketLabel,
    })
  }

  if (principalAmount > 0) {
    await creditToAllocatedBuckets(principalAmount, principalAmount)
  }

  if (profitAmount > 0) {
    await creditProfitToNewBucket(profitAmount)
  }

  if (!isProfitOnly && !isPrincipalOnly && !isSellReceipt) {
    await creditToAllocatedBuckets(Math.max(0, amount), Math.max(0, principalReduction))
  }
}
