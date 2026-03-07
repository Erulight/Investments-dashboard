import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await requireAuth(['OWNER'])

    // Get current CASH_BALANCE setting
    const cashSetting = await prisma.systemSetting.findUnique({
      where: { key: 'CASH_BALANCE' }
    })

    // Get all cash transactions
    const transactions = await prisma.transaction.findMany({
      where: {
        account: { type: 'CASH', isActive: true },
        personId: null // owner scope
      },
      select: {
        id: true,
        type: true,
        amount: true,
        date: true,
        description: true,
        investmentId: true
      },
      orderBy: { date: 'desc' }
    })

    // Calculate sum
    const sum = transactions.reduce((total, tx) => total + tx.amount, 0)

    return NextResponse.json({
      currentSetting: cashSetting?.value || 'NOT_SET',
      calculatedSum: sum,
      discrepancy: sum - Number(cashSetting?.value || 0),
      transactionCount: transactions.length,
      transactions: transactions.slice(0, 10) // show last 10
    })

  } catch (error) {
    console.error('debug-cash-transactions error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
