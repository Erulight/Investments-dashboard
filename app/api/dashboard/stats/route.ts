import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth()

    let totalInvested = 0
    let totalValue = 0
    let totalProfit = 0
    let activeInvestments = 0

    if (user.role === 'OWNER') {
      const investments = await prisma.investment.findMany({
        where: { account: { isActive: true } },
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
        where: { personId: user.personId },
        include: { investment: true },
      })

      totalInvested = participants.reduce((sum, p) => sum + p.investedAmount, 0)
      totalValue = participants.reduce((sum, p) => sum + p.currentValue, 0)
      totalProfit = participants.reduce((sum, p) => sum + p.profit, 0)
      activeInvestments = participants.length
    }

    const recentTransactions = await prisma.transaction.findMany({
      where:
        user.role === 'PARTNER' && user.personId
          ? { personId: user.personId }
          : {},
      take: 10,
      orderBy: { date: 'desc' },
      include: {
        investment: true,
        account: true,
      },
    })

    return NextResponse.json({
      totalInvested,
      totalValue,
      totalProfit,
      activeInvestments,
      recentTransactions,
    })
  } catch (error) {
    console.error('Stats error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: error instanceof Error && error.message === 'Unauthorized' ? 401 : 500 }
    )
  }
}
