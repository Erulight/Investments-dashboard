import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user || user.role !== 'OWNER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get cash account
    const cashAccount = await prisma.account.findFirst({ 
      where: { type: 'CASH', isActive: true } 
    })

    // Get cash balance setting
    const cashSetting = await prisma.systemSetting.findUnique({
      where: { key: 'CASH_BALANCE' }
    })

    // Get all investments (including CASH type)
    const allInvestments = await prisma.investment.findMany({
      where: {
        account: { isActive: true },
      },
      include: {
        account: { select: { type: true, name: true } },
        dealParticipants: true
      }
    })

    // Get investments excluding CASH type (our fix)
    const nonCashInvestments = await prisma.investment.findMany({
      where: {
        account: { isActive: true, type: { not: 'CASH' } },
      },
      include: {
        account: { select: { type: true, name: true } },
        dealParticipants: true
      }
    })

    return NextResponse.json({
      cashAccount: cashAccount ? {
        id: cashAccount.id,
        name: cashAccount.name,
        type: cashAccount.type
      } : null,
      cashBalance: cashSetting?.value || '0',
      allInvestments: allInvestments.map(inv => ({
        id: inv.id,
        name: inv.name,
        accountType: inv.account.type,
        accountName: inv.account.name,
        principalAmount: inv.principalAmount,
        dealParticipants: inv.dealParticipants.length
      })),
      nonCashInvestments: nonCashInvestments.map(inv => ({
        id: inv.id,
        name: inv.name,
        accountType: inv.account.type,
        accountName: inv.account.name,
        principalAmount: inv.principalAmount,
        dealParticipants: inv.dealParticipants.length
      })),
      counts: {
        allInvestments: allInvestments.length,
        nonCashInvestments: nonCashInvestments.length,
        cashInvestments: allInvestments.filter(inv => inv.account.type === 'CASH').length
      }
    })

  } catch (error) {
    console.error('Debug portfolio error:', error)
    return NextResponse.json(
      { error: 'Failed to debug portfolio' },
      { status: 500 }
    )
  }
}
