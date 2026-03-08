import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

export async function GET() {
  try {
    const user = await requireAuth(['OWNER'])

    // Get all cash buckets with their movements and allocations
    const buckets = await prisma.cashBucket.findMany({
      where: {
        OR: [
          { label: { contains: 'Savings Receipt' } },
          { label: { contains: 'Circlys' } },
          { label: 'General Cash' },
          { label: null },
        ],
      },
      include: {
        movements: {
          orderBy: { date: 'desc' },
          take: 20,
          include: {
            investment: {
              select: {
                id: true,
                name: true,
                account: { select: { type: true } },
              },
            },
          },
        },
        allocations: {
          include: {
            investment: {
              select: {
                id: true,
                name: true,
                principalAmount: true,
                account: { select: { type: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    // Calculate totals
    const totalBalance = buckets.reduce((sum, b) => sum + Number(b.balance || 0), 0)
    const totalAllocated = buckets.reduce(
      (sum, b) =>
        sum +
        b.allocations.reduce((s, a) => s + Number(a.principalRemaining || 0), 0),
      0
    )

    // Get ROSCA investments for reference
    const roscaInvestments = await prisma.investment.findMany({
      where: {
        account: { type: 'CIRCLYS' },
      },
      select: {
        id: true,
        name: true,
        startDate: true,
        principalAmount: true,
        totalReceived: true,
        metadata: true,
      },
      orderBy: { startDate: 'desc' },
      take: 10,
    })

    return NextResponse.json({
      summary: {
        totalBuckets: buckets.length,
        totalBalance,
        totalAllocated,
        unallocated: totalBalance - totalAllocated,
      },
      buckets: buckets.map((b) => ({
        id: b.id,
        label: b.label,
        balance: Number(b.balance || 0),
        haulStartDate: b.haulStartDate?.toISOString().split('T')[0],
        excludeFromZakat: b.excludeFromZakat,
        createdAt: b.createdAt.toISOString(),
        movements: b.movements.map((m) => ({
          id: m.id,
          type: m.type,
          amount: Number(m.amount || 0),
          date: m.date.toISOString().split('T')[0],
          investmentId: m.investmentId,
          investmentName: m.investment?.name,
          investmentType: m.investment?.account?.type,
        })),
        allocations: b.allocations.map((a) => ({
          investmentId: a.investmentId,
          investmentName: a.investment?.name,
          investmentType: a.investment?.account?.type,
          principalRemaining: Number(a.principalRemaining || 0),
          investmentPrincipalAmount: Number(a.investment?.principalAmount || 0),
        })),
      })),
      roscaInvestments: roscaInvestments.map((r) => ({
        id: r.id,
        name: r.name,
        startDate: r.startDate?.toISOString().split('T')[0],
        principalAmount: Number(r.principalAmount || 0),
        totalReceived: Number(r.totalReceived || 0),
        metadata: r.metadata,
      })),
    })
  } catch (error) {
    console.error('Debug cash buckets error:', error)

    let statusCode = 500
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') statusCode = 401
      if (error.message === 'Forbidden') statusCode = 403
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to fetch cash buckets',
      },
      { status: statusCode }
    )
  }
}
