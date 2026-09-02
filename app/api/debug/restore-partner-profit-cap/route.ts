import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

export const dynamic = 'force-dynamic'

// One-off repair for deals where an OWNER-initiated reopen restored the
// deal-wide investment.receivableAmount but left active partner
// participants' own DealParticipant.profit/receivable stuck at 0 (see
// reopen/route.ts fix). Restores each active partner's cap proportional to
// their share of the deal's principal, mirroring what reopen now does going
// forward.
//
// Usage:
//   GET /api/debug/restore-partner-profit-cap?name=<deal>
//     -> reports what would change, makes no changes
//   GET /api/debug/restore-partner-profit-cap?name=<deal>&apply=1
//     -> applies it
export async function GET(req: NextRequest) {
  try {
    await requireAuth(['OWNER'])

    const url = new URL(req.url)
    const nameOrId = url.searchParams.get('name') || url.searchParams.get('id')
    const apply = url.searchParams.get('apply') === '1'

    if (!nameOrId) {
      return NextResponse.json({ error: 'Missing name or id parameter' }, { status: 400 })
    }

    const investment = await prisma.investment.findFirst({
      where: { OR: [{ id: nameOrId }, { name: nameOrId }] },
      include: { dealParticipants: { include: { person: true } } },
    })

    if (!investment) {
      return NextResponse.json({ error: `Investment not found for "${nameOrId}"` }, { status: 404 })
    }

    const activeParticipants = investment.dealParticipants.filter(
      (p) => Number(p.investedAmount || 0) > 0.01,
    )
    const totalActiveInvested = activeParticipants.reduce(
      (sum, p) => sum + Number(p.investedAmount || 0),
      0,
    )
    const receivableAmountValue = Number(investment.receivableAmount || 0)

    const plan = activeParticipants.map((p) => {
      const share = totalActiveInvested > 0 ? Number(p.investedAmount || 0) / totalActiveInvested : 0
      const restoredProfitCap = Math.max(0, Math.round(receivableAmountValue * share * 100) / 100)
      return {
        participantId: p.id,
        personId: p.personId,
        personName: (p as any).person?.name,
        currentProfit: p.profit,
        currentReceivable: p.receivable,
        restoredProfitCap,
      }
    })

    if (!apply) {
      return NextResponse.json({ applied: false, investment: { id: investment.id, name: investment.name, receivableAmount: receivableAmountValue }, plan })
    }

    const updated = await prisma.$transaction(
      plan.map((p) =>
        prisma.dealParticipant.update({
          where: { id: p.participantId },
          data: { profit: p.restoredProfitCap, receivable: p.restoredProfitCap },
        }),
      ),
    )

    return NextResponse.json({ applied: true, investment: { id: investment.id, name: investment.name, receivableAmount: receivableAmountValue }, updated })
  } catch (error) {
    console.error('restore-partner-profit-cap error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to restore partner profit cap' },
      { status: 500 },
    )
  }
}
