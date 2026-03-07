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

    // Get all transactions for OWNER (personId = null)
    const allTransactions = await prisma.transaction.findMany({
      where: {
        accountId: cashAccount.id,
        personId: null,
      },
      orderBy: { date: 'desc' },
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

    const setting = await prisma.systemSetting.findUnique({
      where: { key: 'CASH_BALANCE' },
    })

    return NextResponse.json({
      cashAccountId: cashAccount.id,
      transactionCount: allTransactions.length,
      transactions: allTransactions,
      cashBalanceSetting: setting ? Number(setting.value) : null,
    })
  } catch (error) {
    console.error('Test ledger error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
