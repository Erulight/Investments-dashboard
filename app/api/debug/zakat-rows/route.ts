import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

export async function GET() {
  try {
    const user = await requireAuth(['OWNER'])

    // Get all cash buckets with movements and allocations
    const buckets = await prisma.cashBucket.findMany({
      where: {
        OR: [
          { label: { contains: 'Savings Receipt' } },
          { label: { contains: 'Sukuk Principal' } },
          { label: { contains: 'Profit' } },
        ],
      },
      include: {
        movements: {
          orderBy: { date: 'asc' },
          include: {
            investment: {
              select: {
                id: true,
                name: true,
                startDate: true,
                maturityDate: true,
                principalAmount: true,
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
                startDate: true,
                maturityDate: true,
                principalAmount: true,
                account: { select: { type: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    // Get Sukuk investments
    const sukukInvestments = await prisma.investment.findMany({
      where: {
        account: { type: 'SUKUK' },
      },
      select: {
        id: true,
        name: true,
        startDate: true,
        maturityDate: true,
        principalAmount: true,
        metadata: true,
      },
      orderBy: { startDate: 'desc' },
    })

    return NextResponse.json({
      buckets: buckets.map((b) => ({
        id: b.id,
        label: b.label,
        balance: Number(b.balance || 0),
        haulStartDate: b.haulStartDate?.toISOString().split('T')[0],
        excludeFromZakat: b.excludeFromZakat,
        movements: b.movements.map((m) => ({
          id: m.id,
          type: m.type,
          amount: Number(m.amount || 0),
          date: m.date.toISOString().split('T')[0],
          investmentId: m.investmentId,
          investmentName: m.investment?.name,
          investmentStartDate: m.investment?.startDate?.toISOString().split('T')[0],
          investmentMaturityDate: m.investment?.maturityDate?.toISOString().split('T')[0],
          investmentPrincipalAmount: Number(m.investment?.principalAmount || 0),
        })),
        allocations: b.allocations.map((a) => ({
          investmentId: a.investmentId,
          investmentName: a.investment?.name,
          principalRemaining: Number(a.principalRemaining || 0),
          investmentStartDate: a.investment?.startDate?.toISOString().split('T')[0],
          investmentMaturityDate: a.investment?.maturityDate?.toISOString().split('T')[0],
          investmentPrincipalAmount: Number(a.investment?.principalAmount || 0),
        })),
      })),
      sukukInvestments: sukukInvestments.map((s) => ({
        id: s.id,
        name: s.name,
        startDate: s.startDate?.toISOString().split('T')[0],
        maturityDate: s.maturityDate?.toISOString().split('T')[0],
        principalAmount: Number(s.principalAmount || 0),
        metadata: s.metadata,
      })),
    })
  } catch (error) {
    console.error('Debug zakat rows error:', error)

    let statusCode = 500
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') statusCode = 401
      if (error.message === 'Forbidden') statusCode = 403
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to fetch zakat rows',
      },
      { status: statusCode }
    )
  }
}
