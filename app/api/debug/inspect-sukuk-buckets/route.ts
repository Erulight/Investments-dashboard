import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

export const dynamic = 'force-dynamic'

// Diagnostic (read-only): shows every CashBucket + CashBucketMovement tied
// to a given investment, regardless of personId, to see whether a principal
// receipt bucket actually exists, who it belongs to, and its zakat flags.
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
      select: { id: true, name: true },
    })
    if (!investment) {
      return NextResponse.json({ error: `Investment not found for "${nameOrId}"` }, { status: 404 })
    }

    const movements = await prisma.cashBucketMovement.findMany({
      where: { investmentId: investment.id },
      orderBy: { date: 'asc' },
      include: {
        cashBucket: {
          select: {
            id: true,
            label: true,
            personId: true,
            balance: true,
            excludeFromZakat: true,
            haulStartDate: true,
          },
        },
      },
    })

    const bucketIds = Array.from(new Set(movements.map((m) => m.cashBucketId)))
    const allocations = await prisma.investmentBucketAllocation.findMany({
      where: { investmentId: investment.id },
      select: {
        cashBucketId: true,
        principalAllocated: true,
        principalRemaining: true,
        haulStartDate: true,
      },
    })

    return NextResponse.json({
      investment,
      bucketIds,
      movements: movements.map((m) => ({
        id: m.id,
        type: m.type,
        amount: m.amount,
        date: m.date,
        notes: m.notes,
        bucket: m.cashBucket,
      })),
      allocations,
    })
  } catch (error) {
    console.error('inspect-sukuk-buckets error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to inspect sukuk buckets' },
      { status: 500 },
    )
  }
}
