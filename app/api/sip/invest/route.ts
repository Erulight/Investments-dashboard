import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { requireModuleAccess } from '@/lib/rbac'
import { createAuditLog } from '@/lib/audit'
import { withdrawFromBuckets } from '@/lib/cashBuckets'
import { recomputeCashSetting } from '@/lib/cashBalance'

const getCashAccount = async (tx: any, currency = 'SAR') => {
  const existing = await tx.account.findFirst({
    where: { type: 'CASH', isActive: true },
  })
  if (existing) return existing
  return tx.account.create({
    data: {
      name: 'Cash Balance',
      type: 'CASH',
      currency,
      description: 'Cash ledger account',
    },
  })
}

export async function POST(request: Request) {
  try {
    await requireModuleAccess('savings') // We'll reuse savings permissions for SIP
    const user = await getCurrentUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { sipId, amount, date } = await request.json()

    if (!sipId || !amount || amount <= 0) {
      return NextResponse.json({ error: 'Invalid investment amount' }, { status: 400 })
    }

    const investmentDate = date ? new Date(date) : new Date()
    if (Number.isNaN(investmentDate.getTime())) {
      return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
    }

    // Get the SIP investment
    const sip = await prisma.investment.findUnique({
      where: { id: sipId },
      include: { account: true },
    })

    if (!sip) {
      return NextResponse.json({ error: 'SIP plan not found' }, { status: 404 })
    }

    const metadata = JSON.parse(sip.metadata || '{}')
    if (metadata.type !== 'SIP') {
      return NextResponse.json({ error: 'Invalid SIP plan' }, { status: 400 })
    }

    // Check if user has permission (OWNER or participant)
    if (user.role !== 'OWNER') {
      const isParticipant = await prisma.dealParticipant.findFirst({
        where: {
          investmentId: sipId,
          person: { user: { id: user.id } },
        },
      })
      if (!isParticipant) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
    }

    const currentInvested = metadata.investedAmount || sip.principalAmount || 0
    const newInvested = currentInvested + amount
    const newPrincipal = sip.principalAmount + amount
    const prevHistory = Array.isArray(metadata.history) ? metadata.history : []
    const currentValue = metadata.currentValue || sip.currentValue || 0

    const updatedSip = await prisma.$transaction(async (tx: any) => {
      const currency = sip.account?.currency || 'SAR'

      await withdrawFromBuckets(tx, {
        amount,
        currency,
        date: investmentDate,
        type: 'INVEST_OUT',
        investmentId: sipId,
        notes: `SIP Invest • ${sip.name}`,
        availableOnOrBefore: investmentDate,
      })

      await recomputeCashSetting(tx, user.role === 'OWNER' ? null : (user.personId || null))

      const cashAccount = await getCashAccount(tx, currency)
      await tx.transaction.create({
        data: {
          accountId: cashAccount.id,
          investmentId: sipId,
          personId: user.role === 'OWNER' ? null : (user.personId || null),
          type: 'INVEST_OUT',
          amount: -amount,
          date: investmentDate,
          description: `SIP Invest • ${sip.name}`,
        },
      })

      return tx.investment.update({
        where: { id: sipId },
        data: {
          principalAmount: newPrincipal,
          metadata: JSON.stringify({
            ...metadata,
            investedAmount: newInvested,
            lastInvestmentDate: investmentDate.toISOString(),
            history: [
              ...prevHistory,
              {
                at: investmentDate.toISOString(),
                action: 'INVEST',
                amount,
                investedAmount: newInvested,
                currentValue,
              },
            ].slice(-200),
          }),
        },
        include: { account: true },
      })
    })

    // Log the investment action
    await createAuditLog(
      user.id,
      'UPDATE',
      'INVESTMENT',
      sipId,
      {
        amount,
        previousInvested: currentInvested,
        newInvested,
      }
    )

    return NextResponse.json(updatedSip)
  } catch (error) {
    console.error('Error investing in SIP:', error)
    if (error instanceof Error && error.message === 'Module access denied') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }
    if (error instanceof Error && error.message === 'INSUFFICIENT_CASH') {
      return NextResponse.json({ error: 'Insufficient cash balance for selected date' }, { status: 400 })
    }
    return NextResponse.json({ error: 'Failed to invest in SIP plan' }, { status: 500 })
  }
}
