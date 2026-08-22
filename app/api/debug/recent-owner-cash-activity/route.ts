import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'
import { CASH_BALANCE_KEY, getBucketCashBalance } from '@/lib/cashBalance'

export const dynamic = 'force-dynamic'

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

// Diagnostic (read-only): shows the owner's (personId = null) most recent
// cash-affecting activity, to trace unexpected jumps in the Cash Balance
// tile. Includes both ledger Transactions and raw CashBucketMovements on
// owner-scoped buckets, plus current setting vs bucket-sum for sanity.
export async function GET(req: NextRequest) {
  try {
    await requireAuth(['OWNER'])

    const url = new URL(req.url)
    const take = Math.min(200, Math.max(1, Number(url.searchParams.get('take')) || 40))

    const setting = await prisma.systemSetting.findUnique({ where: { key: CASH_BALANCE_KEY } })
    const settingValue = Number(setting?.value || 0)
    const bucketSum = await getBucketCashBalance(prisma, null)

    const cashAccount = await prisma.account.findFirst({ where: { type: 'CASH', isActive: true } })

    const transactions = cashAccount
      ? await prisma.transaction.findMany({
          where: { accountId: cashAccount.id, personId: null },
          orderBy: { createdAt: 'desc' },
          take,
          include: { investment: { select: { id: true, name: true } } },
        })
      : []

    const movements = await prisma.cashBucketMovement.findMany({
      where: { cashBucket: { personId: null } },
      orderBy: { createdAt: 'desc' },
      take,
      include: {
        cashBucket: { select: { id: true, label: true, personId: true } },
        investment: { select: { id: true, name: true } },
      },
    })

    return NextResponse.json({
      settingValue,
      bucketSum,
      drift: settingValue - bucketSum,
      recentTransactions: transactions.map((t: any) => ({
        id: t.id,
        type: t.type,
        amount: t.amount,
        date: t.date,
        createdAt: t.createdAt,
        description: t.description,
        investment: t.investment?.name || null,
        metadata: parseMetadata(t.metadata),
      })),
      recentMovements: movements.map((m: any) => ({
        id: m.id,
        type: m.type,
        amount: m.amount,
        date: m.date,
        createdAt: m.createdAt,
        notes: m.notes,
        bucketId: m.cashBucketId,
        bucketLabel: m.cashBucket?.label,
        investment: m.investment?.name || null,
      })),
    })
  } catch (error) {
    console.error('recent-owner-cash-activity error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load recent owner cash activity' },
      { status: 500 },
    )
  }
}
