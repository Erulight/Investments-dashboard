import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

export const dynamic = 'force-dynamic'

// Diagnostic (read-only): finds owner-scoped cash buckets with a positive
// balance whose haulStartDate is in the future relative to a given cutoff
// date. Such buckets are silently excluded from withdrawFromBuckets'
// availability calculation for that date, which can make the displayed
// total cash balance look sufficient while a same-day withdrawal/payment
// still fails as "insufficient".
export async function GET(req: NextRequest) {
  try {
    await requireAuth(['OWNER'])

    const url = new URL(req.url)
    const dateParam = url.searchParams.get('date')
    const cutoff = dateParam ? new Date(dateParam) : new Date()
    if (Number.isNaN(cutoff.getTime())) {
      return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
    }

    const futureBuckets = await prisma.cashBucket.findMany({
      where: {
        personId: null,
        balance: { gt: 0 },
        haulStartDate: { gt: cutoff },
      },
      orderBy: { haulStartDate: 'asc' },
      select: {
        id: true,
        label: true,
        balance: true,
        haulStartDate: true,
        createdAt: true,
        movements: {
          orderBy: { date: 'asc' },
          select: { id: true, type: true, amount: true, date: true, notes: true },
        },
      },
    })

    const totalFutureLocked = futureBuckets.reduce((s, b) => s + Number(b.balance || 0), 0)

    return NextResponse.json({
      cutoff,
      totalFutureLocked,
      futureBuckets,
    })
  } catch (error) {
    console.error('find-future-dated-buckets error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to find future-dated buckets' },
      { status: 500 },
    )
  }
}
