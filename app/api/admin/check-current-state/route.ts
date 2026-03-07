import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await requireAuth(['OWNER'])

    const cashAccount = await prisma.account.findFirst({
      where: { type: 'CASH', isActive: true },
    })

    if (!cashAccount) {
      return NextResponse.json({ error: 'No cash account' }, { status: 404 })
    }

    const transactions = await prisma.transaction.findMany({
      where: {
        accountId: cashAccount.id,
        personId: null,
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        type: true,
        amount: true,
        date: true,
        description: true,
        investmentId: true,
        createdAt: true,
      },
    })

    const deal = await prisma.investment.findFirst({
      where: { name: { contains: 'البندرية' } },
      select: {
        id: true,
        name: true,
        principalAmount: true,
        receivableAmount: true,
        totalReceived: true,
      },
    })

    return NextResponse.json({
      transactionCount: transactions.length,
      transactions,
      deal,
      summary: {
        cashIn: transactions.filter(t => t.type === 'CASH_IN').length,
        cashInvest: transactions.filter(t => t.type === 'CASH_INVEST').length,
        withdrawPrincipal: transactions.filter(t => t.type === 'WITHDRAW_PRINCIPAL').length,
        withdrawProfit: transactions.filter(t => t.type === 'WITHDRAW_PROFIT').length,
      }
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
