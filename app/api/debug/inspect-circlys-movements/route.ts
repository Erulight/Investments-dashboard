import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

export const dynamic = 'force-dynamic'

// Diagnostic (read-only): shows every CashBucketMovement tied to a Circlys
// contribution/payback/undo (matched by notes), REGARDLESS of personId, so
// we can see which bucket (and whose) actually got debited/credited.
export async function GET(req: NextRequest) {
  try {
    await requireAuth(['OWNER'])

    const url = new URL(req.url)
    const take = Math.min(200, Math.max(1, Number(url.searchParams.get('take')) || 60))
    const nameFilter = url.searchParams.get('name')

    const movements = await prisma.cashBucketMovement.findMany({
      where: {
        OR: [
          { notes: { contains: 'Circlys contribution' } },
          { notes: { contains: 'Circlys payback' } },
          { notes: { contains: 'Undo Circlys' } },
        ],
        ...(nameFilter ? { notes: { contains: nameFilter } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take,
      include: {
        cashBucket: { select: { id: true, label: true, personId: true, balance: true } },
        investment: { select: { id: true, name: true } },
      },
    })

    return NextResponse.json({
      count: movements.length,
      movements: movements.map((m) => ({
        id: m.id,
        type: m.type,
        amount: m.amount,
        date: m.date,
        createdAt: m.createdAt,
        notes: m.notes,
        investment: m.investment?.name || null,
        bucketId: m.cashBucketId,
        bucketLabel: m.cashBucket?.label,
        bucketPersonId: m.cashBucket?.personId,
        bucketBalance: m.cashBucket?.balance,
      })),
    })
  } catch (error) {
    console.error('inspect-circlys-movements error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to inspect circlys movements' },
      { status: 500 },
    )
  }
}
