import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

export const dynamic = 'force-dynamic'

// Diagnostic (read-only): for a given Sukuk deal, traces every cash bucket
// that ever funded it or received a payout from it, and reports each
// bucket's CURRENT balance, haulStartDate, and how many days that haul has
// been running - to answer "why isn't Zakat showing for this closed deal".
// The short answer is usually one of:
//   - the deal's principal/profit is still sitting in a bucket with balance
//     > 0 and a haul that HAS completed (>= 354 days) but Zakat wasn't paid
//     on it yet (this would be a real bug worth investigating further)
//   - the money moved on again into "General Cash" or similar and its haul
//     continuity was (correctly or incorrectly) reset/extended
//   - the bucket balance is genuinely 0 because it was already
//     spent/reinvested elsewhere, in which case there's nothing left in
//     THIS specific bucket to owe Zakat on (the money now lives wherever
//     it was spent/reinvested, and Zakat should be tracked there instead)
export async function GET(req: NextRequest) {
  try {
    await requireAuth(['OWNER'])

    const url = new URL(req.url)
    const nameOrId = url.searchParams.get('name') || url.searchParams.get('id')
    if (!nameOrId) {
      return NextResponse.json({ error: 'Missing name or id parameter' }, { status: 400 })
    }

    const investment = await prisma.investment.findFirst({
      where: { OR: [{ id: nameOrId }, { name: nameOrId }] },
      include: {
        dealParticipants: true,
        transactions: { orderBy: { date: 'asc' } },
      },
    })

    if (!investment) {
      return NextResponse.json({ error: `Investment not found for "${nameOrId}"` }, { status: 404 })
    }

    // Every bucket that ever had a movement tied to this investment
    // (funding it via INVEST_OUT, or receiving a payout via
    // WITHDRAW_PROFIT/WITHDRAW_PRINCIPAL/ROLLBACK_PRINCIPAL/CASH_IN).
    const movements = await prisma.cashBucketMovement.findMany({
      where: { investmentId: investment.id },
      include: {
        cashBucket: {
          select: {
            id: true,
            label: true,
            personId: true,
            balance: true,
            haulStartDate: true,
            excludeFromZakat: true,
            lastZakatPaidDate: true,
          },
        },
      },
      orderBy: { date: 'asc' },
    })

    const bucketIds = Array.from(new Set(movements.map((m) => m.cashBucketId)))
    const now = new Date()

    const buckets = await Promise.all(
      bucketIds.map(async (id) => {
        const bucket = await prisma.cashBucket.findUnique({
          where: { id },
          select: {
            id: true,
            label: true,
            personId: true,
            balance: true,
            haulStartDate: true,
            excludeFromZakat: true,
            lastZakatPaidDate: true,
          },
        })
        if (!bucket) return null
        const haulDays = bucket.haulStartDate
          ? Math.floor((now.getTime() - new Date(bucket.haulStartDate).getTime()) / (1000 * 60 * 60 * 24))
          : null
        const bucketMovements = movements.filter((m) => m.cashBucketId === id)
        return {
          ...bucket,
          haulDaysElapsed: haulDays,
          haulCompleted: haulDays !== null && haulDays >= 354,
          movementsForThisDeal: bucketMovements.map((m) => ({
            type: m.type,
            amount: m.amount,
            date: m.date,
          })),
        }
      }),
    )

    return NextResponse.json({
      investment: {
        id: investment.id,
        name: investment.name,
        principalAmount: investment.principalAmount,
        receivableAmount: investment.receivableAmount,
        totalReceived: investment.totalReceived,
        startDate: investment.startDate,
        maturityDate: investment.maturityDate,
      },
      dealParticipants: investment.dealParticipants,
      buckets: buckets.filter(Boolean),
    })
  } catch (error) {
    console.error('trace-sukuk-zakat error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to trace sukuk zakat' },
      { status: 500 },
    )
  }
}
