import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

export async function GET() {
  try {
    const user = await requireAuth(['OWNER'])

    // Get system cash balance
    const cashSetting = await prisma.systemSetting.findUnique({
      where: { key: 'CASH_BALANCE' },
    })

    const systemCash = cashSetting ? Number(cashSetting.value || 0) : 0

    // Get all cash buckets total
    const bucketAgg = await prisma.cashBucket.aggregate({
      _sum: { balance: true },
    })
    const bucketTotal = Number(bucketAgg._sum.balance || 0)

    // Get recent cash transactions
    const recentTransactions = await prisma.transaction.findMany({
      where: {
        account: { type: 'CASH' },
      },
      include: {
        investment: {
          select: {
            id: true,
            name: true,
            account: { select: { type: true } },
          },
        },
      },
      orderBy: { date: 'desc' },
      take: 30,
    })

    // Get recent cash bucket movements
    const recentMovements = await prisma.cashBucketMovement.findMany({
      include: {
        cashBucket: {
          select: {
            id: true,
            label: true,
            balance: true,
          },
        },
        investment: {
          select: {
            id: true,
            name: true,
            account: { select: { type: true } },
          },
        },
      },
      orderBy: { date: 'desc' },
      take: 30,
    })

    return NextResponse.json({
      summary: {
        systemCashBalance: systemCash,
        bucketsTotal: bucketTotal,
        difference: systemCash - bucketTotal,
      },
      recentTransactions: recentTransactions.map((t) => ({
        id: t.id,
        type: t.type,
        amount: Number(t.amount || 0),
        date: t.date.toISOString().split('T')[0],
        description: t.description,
        investmentId: t.investmentId,
        investmentName: t.investment?.name,
        investmentType: t.investment?.account?.type,
        personId: t.personId,
        metadata: t.metadata,
      })),
      recentMovements: recentMovements.map((m) => ({
        id: m.id,
        type: m.type,
        amount: Number(m.amount || 0),
        date: m.date.toISOString().split('T')[0],
        bucketId: m.cashBucketId,
        bucketLabel: m.cashBucket?.label,
        bucketBalance: Number(m.cashBucket?.balance || 0),
        investmentId: m.investmentId,
        investmentName: m.investment?.name,
        investmentType: m.investment?.account?.type,
      })),
    })
  } catch (error) {
    console.error('Debug cash system error:', error)

    let statusCode = 500
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') statusCode = 401
      if (error.message === 'Forbidden') statusCode = 403
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to fetch cash system',
      },
      { status: statusCode }
    )
  }
}
