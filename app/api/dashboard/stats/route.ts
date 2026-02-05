import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'
import { DEMO_INVESTMENT_NAMES } from '@/lib/demo'

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth()
    const { searchParams } = new URL(req.url)
    const yearParam = searchParams.get('year')
    const selectedYear = yearParam ? Number(yearParam) : new Date().getFullYear()
    const yearStart = new Date(selectedYear, 0, 1)
    const yearEnd = new Date(selectedYear + 1, 0, 1)

    let totalInvested = 0
    let totalValue = 0
    let totalProfit = 0
    let activeInvestments = 0

    if (user.role === 'OWNER') {
      const investments = await prisma.investment.findMany({
        where: {
          account: { isActive: true },
          name: { notIn: DEMO_INVESTMENT_NAMES },
        },
      })

      totalInvested = investments.reduce((sum, inv) => sum + inv.principalAmount, 0)
      totalValue = investments.reduce((sum, inv) => sum + inv.currentValue, 0)
      totalProfit = investments.reduce(
        (sum, inv) => sum + inv.realizedProfit + inv.unrealizedProfit,
        0
      )
      activeInvestments = investments.length
    } else if (user.role === 'PARTNER' && user.personId) {
      const participants = await prisma.dealParticipant.findMany({
        where: {
          personId: user.personId,
          investment: {
            name: { notIn: DEMO_INVESTMENT_NAMES },
          },
        },
        include: { investment: true },
      })

      totalInvested = participants.reduce((sum, p) => sum + p.investedAmount, 0)
      totalValue = participants.reduce((sum, p) => sum + p.currentValue, 0)
      totalProfit = participants.reduce((sum, p) => sum + p.profit, 0)
      activeInvestments = participants.length
    }

    const transactionWhere =
      user.role === 'PARTNER' && user.personId
        ? {
            personId: user.personId,
            OR: [
              { investment: { name: { notIn: DEMO_INVESTMENT_NAMES } } },
              { investmentId: null },
            ],
          }
        : {
            OR: [
              { investment: { name: { notIn: DEMO_INVESTMENT_NAMES } } },
              { investmentId: null },
            ],
          }

    const recentTransactions = await prisma.transaction.findMany({
      where: {
        ...transactionWhere,
        date: { gte: yearStart, lt: yearEnd },
      },
      take: 10,
      orderBy: { date: 'desc' },
      include: {
        investment: true,
        account: true,
      },
    })

    const yearlyProfit = await prisma.transaction.aggregate({
      where: {
        ...transactionWhere,
        type: 'WITHDRAW_PROFIT',
        date: { gte: yearStart, lt: yearEnd },
      },
      _sum: { amount: true },
    })

    return NextResponse.json({
      totalInvested,
      totalValue,
      totalProfit,
      activeInvestments,
      recentTransactions,
      yearlyProfit: Math.abs(yearlyProfit._sum.amount || 0),
      selectedYear,
    })
  } catch (error) {
    console.error('Stats error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: error instanceof Error && error.message === 'Unauthorized' ? 401 : 500 }
    )
  }
}
