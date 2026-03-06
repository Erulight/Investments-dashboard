import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

export async function GET(req: NextRequest) {
  try {
    await requireAuth(['OWNER'])

    const cashAccount = await prisma.account.findFirst({
      where: { type: 'CASH' }
    })

    if (!cashAccount) {
      return NextResponse.json({ error: 'No cash account found' }, { status: 404 })
    }

    const txs = await prisma.transaction.findMany({
      where: { accountId: cashAccount.id },
      orderBy: { date: 'asc' },
      select: { 
        type: true, 
        amount: true, 
        date: true, 
        description: true,
        createdAt: true 
      }
    })

    let running = 0
    const txDetails = txs.map(t => {
      running += t.amount
      return {
        type: t.type,
        amount: t.amount,
        running: running,
        description: t.description,
        date: t.date.toISOString().split('T')[0],
        createdAt: t.createdAt.toISOString()
      }
    })

    const setting = await prisma.systemSetting.findUnique({ 
      where: { key: 'CASH_BALANCE' }
    })

    const systemBalance = Number(setting?.value || 0)
    const transactionSum = running
    const discrepancy = systemBalance - transactionSum

    return NextResponse.json({
      cashAccount: {
        id: cashAccount.id,
        name: cashAccount.name,
        type: cashAccount.type
      },
      transactions: txDetails,
      summary: {
        systemSetting: setting?.value || 'Not found',
        transactionSum: transactionSum,
        discrepancy: discrepancy,
        totalTransactions: txs.length
      }
    })

  } catch (error) {
    console.error('Cash diagnostic error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to run diagnostic' },
      { status: 500 }
    )
  }
}
