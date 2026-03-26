import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(['OWNER', 'PARTNER'])
    if (user.role === 'PARTNER' && !user.personId) {
      return NextResponse.json({ error: 'Partner is missing a person profile' }, { status: 400 })
    }

    const scopePersonId = user.role === 'OWNER' ? null : user.personId!

    // Get cash account
    const cashAccount = await prisma.account.findFirst({
      where: { type: 'CASH', isActive: true },
    })

    if (!cashAccount) {
      return NextResponse.json({ history: [] })
    }

    // Get all cash transactions ordered by date
    const transactions = await prisma.transaction.findMany({
      where: {
        accountId: cashAccount.id,
        personId: scopePersonId,
      },
      orderBy: { date: 'asc' },
      select: {
        id: true,
        type: true,
        amount: true,
        date: true,
        description: true,
      },
    })

    // Calculate running balance for each transaction
    let runningBalance = 0
    const history = transactions.map((tx) => {
      runningBalance += tx.amount
      return {
        date: tx.date.toISOString(),
        type: tx.type,
        amount: tx.amount,
        description: tx.description,
        balance: runningBalance,
      }
    })

    return NextResponse.json({ history })
  } catch (error) {
    console.error('Cash history fetch error:', error)
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load cash history' },
      { status: 500 }
    )
  }
}
