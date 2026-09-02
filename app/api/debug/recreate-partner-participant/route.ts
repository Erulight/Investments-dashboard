import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

export const dynamic = 'force-dynamic'

// One-off repair: recreates a missing DealParticipant row for a given
// investment + person, using investment.principalAmount/receivableAmount as
// the invested/profit target, minus whatever that person has already
// withdrawn via WITHDRAW_PRINCIPAL/WITHDRAW_PROFIT transactions. Only use
// when diagnostics (inspect-partner-profit-limit) show dealParticipants: []
// for a deal that should still have an active partner participant.
export async function GET(req: NextRequest) {
  try {
    await requireAuth(['OWNER'])

    const url = new URL(req.url)
    const nameOrId = url.searchParams.get('name') || url.searchParams.get('id')
    const personId = url.searchParams.get('personId')
    const apply = url.searchParams.get('apply') === '1'

    if (!nameOrId || !personId) {
      return NextResponse.json({ error: 'Missing name/id or personId parameter' }, { status: 400 })
    }

    const investment = await prisma.investment.findFirst({
      where: { OR: [{ id: nameOrId }, { name: nameOrId }] },
      include: { dealParticipants: true, transactions: true },
    })

    if (!investment) {
      return NextResponse.json({ error: `Investment not found for "${nameOrId}"` }, { status: 404 })
    }

    const existing = investment.dealParticipants.find((p) => p.personId === personId)
    if (existing) {
      return NextResponse.json({ applied: false, message: 'Participant already exists, no action taken', existing })
    }

    const personTx = investment.transactions.filter((t) => t.personId === personId)
    const withdrawnPrincipal = personTx
      .filter((t) => t.type === 'WITHDRAW_PRINCIPAL')
      .reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0)
    const withdrawnProfit = personTx
      .filter((t) => t.type === 'WITHDRAW_PROFIT')
      .reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0)

    const investedAmount = Math.max(0, Number(investment.principalAmount || 0) - withdrawnPrincipal)
    const profitCap = Math.max(0, Number(investment.receivableAmount || 0) - withdrawnProfit)

    const earliestAcquire = personTx
      .map((t) => new Date(t.date))
      .filter((d) => !Number.isNaN(d.getTime()))
      .sort((a, b) => a.getTime() - b.getTime())[0] || investment.startDate

    const plan = {
      investmentId: investment.id,
      personId,
      investedAmount,
      currentValue: investedAmount,
      receivable: profitCap,
      profit: profitCap,
      commissionFees: 0,
      acquiredAt: earliestAcquire,
      sharePercentage: investment.principalAmount > 0 ? (investedAmount / investment.principalAmount) * 100 : 100,
    }

    if (!apply) {
      return NextResponse.json({ applied: false, plan })
    }

    const created = await prisma.dealParticipant.create({ data: plan })

    return NextResponse.json({ applied: true, created })
  } catch (error) {
    console.error('recreate-partner-participant error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to recreate partner participant' },
      { status: 500 },
    )
  }
}
