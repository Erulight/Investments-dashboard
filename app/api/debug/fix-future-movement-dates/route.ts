import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

export const dynamic = 'force-dynamic'

// Diagnostic + repair (scoped to a single investment, on purpose - this is
// NOT a blanket "backdate everything" tool, since some future-dated
// movements are legitimately scheduled and should stay excluded from
// today's availability). Finds cash bucket movements tied to the given
// investment's buckets that are dated after today, and backdates them to
// today so the money they represent becomes immediately withdrawable.
//
// Usage:
//   GET /api/debug/fix-future-movement-dates?name=<investment name or id>
//     -> reports future-dated movements tied to that investment's buckets
//   GET /api/debug/fix-future-movement-dates?name=<investment name or id>&apply=1
//     -> backdates them to today
export async function GET(req: NextRequest) {
  try {
    await requireAuth(['OWNER'])

    const url = new URL(req.url)
    const nameOrId = url.searchParams.get('name') || url.searchParams.get('id')
    const apply = url.searchParams.get('apply') === '1'

    if (!nameOrId) {
      return NextResponse.json({ error: 'Missing name or id parameter' }, { status: 400 })
    }

    const investment = await prisma.investment.findFirst({
      where: { OR: [{ id: nameOrId }, { name: nameOrId }] },
    })

    if (!investment) {
      return NextResponse.json({ error: `Investment not found for "${nameOrId}"` }, { status: 404 })
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const futureMovements = await prisma.cashBucketMovement.findMany({
      where: {
        investmentId: investment.id,
        date: { gt: today },
        cashBucket: { personId: null },
      },
      include: { cashBucket: { select: { id: true, label: true, personId: true } } },
      orderBy: { date: 'asc' },
    })

    if (!apply || futureMovements.length === 0) {
      return NextResponse.json({
        applied: false,
        investment: { id: investment.id, name: investment.name },
        today,
        futureMovements,
      })
    }

    const fixed = await prisma.$transaction(
      futureMovements.map((m) =>
        prisma.cashBucketMovement.update({
          where: { id: m.id },
          data: { date: today },
        }),
      ),
    )

    return NextResponse.json({
      applied: true,
      investment: { id: investment.id, name: investment.name },
      today,
      fixedMovements: fixed,
    })
  } catch (error) {
    console.error('fix-future-movement-dates error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fix future movement dates' },
      { status: 500 },
    )
  }
}
