import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'
import { CASH_BALANCE_KEY, getBucketCashBalance } from '@/lib/cashBalance'

export const dynamic = 'force-dynamic'

// Diagnostic (read-only) for "Insufficient cash balance" errors when
// withdrawing from the Cash Balance card. Mirrors the exact filtering /
// future-movement logic that lib/cashBuckets.ts withdrawFromBuckets() uses,
// so we can see per-bucket why the withdrawable total is lower than the
// displayed cash balance.
//
// Usage: GET /api/debug/cash-liquidity-check?date=YYYY-MM-DD
// (date defaults to today; this is the "availableOnOrBefore" cutoff used by
// the withdraw form)
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(['OWNER', 'PARTNER'])
    const personId = user.role === 'OWNER' ? null : (user.personId || null)

    const url = new URL(req.url)
    const dateParam = url.searchParams.get('date')
    const cutoff = dateParam ? new Date(dateParam) : new Date()
    if (Number.isNaN(cutoff.getTime())) {
      return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
    }

    const setting = await prisma.systemSetting.findUnique({ where: { key: CASH_BALANCE_KEY } })
    const settingValue = Number(setting?.value || 0)
    const bucketSum = await getBucketCashBalance(prisma, personId)

    const buckets = await prisma.cashBucket.findMany({
      where: {
        currency: 'SAR',
        balance: { gt: 0 },
        personId,
        haulStartDate: { lte: cutoff },
      },
      orderBy: [{ haulStartDate: 'asc' }, { createdAt: 'asc' }],
    })

    const movements = await prisma.cashBucketMovement.groupBy({
      by: ['cashBucketId'],
      where: {
        cashBucketId: { in: buckets.map((b) => b.id) },
        date: { lte: cutoff },
      },
      _sum: { amount: true },
    })
    const availableByBucket = new Map(movements.map((m) => [m.cashBucketId, m._sum.amount || 0]))

    const futureMovements = await prisma.cashBucketMovement.findMany({
      where: {
        cashBucketId: { in: buckets.map((b) => b.id) },
        date: { gt: cutoff },
      },
      orderBy: { date: 'asc' },
    })
    const futureByBucket = new Map<string, typeof futureMovements>()
    for (const m of futureMovements) {
      const list = futureByBucket.get(m.cashBucketId) || []
      list.push(m)
      futureByBucket.set(m.cashBucketId, list)
    }

    const details = buckets.map((bucket) => {
      const balanceAtCutoff = availableByBucket.get(bucket.id) ?? 0
      let running = balanceAtCutoff
      let minBalance = balanceAtCutoff
      const future = futureByBucket.get(bucket.id) || []
      for (const m of future) {
        running += m.amount
        if (running < minBalance) minBalance = running
      }
      const maxWithdrawable = Math.max(0, minBalance)
      return {
        bucketId: bucket.id,
        label: bucket.label,
        currentBalance: bucket.balance,
        haulStartDate: bucket.haulStartDate,
        balanceAtCutoff,
        maxWithdrawable,
        limitedByFutureMovements: maxWithdrawable < bucket.balance - 0.01,
        futureMovements: future.map((m) => ({ id: m.id, amount: m.amount, type: m.type, date: m.date })),
      }
    })

    const totalMaxWithdrawable = details.reduce((sum, d) => sum + d.maxWithdrawable, 0)
    const excludedBuckets = await prisma.cashBucket.findMany({
      where: {
        OR: [
          { personId, balance: { lte: 0 } },
          { personId, currency: { not: 'SAR' } },
          { personId, haulStartDate: { gt: cutoff } },
        ],
      },
      select: { id: true, label: true, balance: true, currency: true, haulStartDate: true },
    })

    return NextResponse.json({
      cutoff,
      settingValue,
      bucketSum,
      totalMaxWithdrawable,
      shortfall: bucketSum - totalMaxWithdrawable,
      buckets: details,
      excludedBuckets,
    })
  } catch (error) {
    console.error('cash-liquidity-check error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to check cash liquidity' },
      { status: 500 },
    )
  }
}
