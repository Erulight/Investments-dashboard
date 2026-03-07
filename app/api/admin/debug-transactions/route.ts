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
      return NextResponse.json({ error: 'No cash account found' }, { status: 404 })
    }

    const transactions = await prisma.transaction.findMany({
      where: {
        accountId: cashAccount.id,
        personId: null, // OWNER scope
      },
      orderBy: { date: 'desc' },
      take: 20,
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

    const investments = await prisma.investment.findMany({
      select: {
        id: true,
        name: true,
        principalAmount: true,
        receivableAmount: true,
        totalReceived: true,
      },
      take: 10,
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({
      cashAccountId: cashAccount.id,
      transactionCount: transactions.length,
      transactions,
      investments,
    })
  } catch (error) {
    console.error('Debug transactions error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
