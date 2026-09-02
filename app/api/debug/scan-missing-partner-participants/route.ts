import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

export const dynamic = 'force-dynamic'

// Scans every Sukuk deal for a partner who clearly has history on it
// (a WITHDRAW_PROFIT/WITHDRAW_PRINCIPAL/SELL_TO_PARTNER transaction, or a
// partner-owned cash bucket allocation) but has NO matching DealParticipant
// row - the exact symptom of the "edit request wipes participants" bug
// fixed in app/api/sukuk/[id]/route.ts. Read-only: for each hit, use
// /api/debug/recreate-partner-participant?name=<deal>&personId=<id>&apply=1
// to rebuild it.
export async function GET() {
  try {
    await requireAuth(['OWNER'])

    const investments = await prisma.investment.findMany({
      where: { account: { type: 'SUKUK' } },
      include: {
        dealParticipants: true,
        transactions: {
          where: {
            type: { in: ['WITHDRAW_PROFIT', 'WITHDRAW_PRINCIPAL', 'SELL_TO_PARTNER', 'BUY_FROM_PARTNER'] },
            personId: { not: null },
          },
          select: { personId: true, type: true, amount: true, date: true },
        },
      },
    })

    const results: any[] = []

    for (const inv of investments) {
      const participantPersonIds = new Set(inv.dealParticipants.map((p) => p.personId))
      const txPersonIds = new Set(
        inv.transactions.map((t) => t.personId).filter((id): id is string => Boolean(id)),
      )

      const missingPersonIds = Array.from(txPersonIds).filter((id) => !participantPersonIds.has(id))
      if (missingPersonIds.length === 0) continue

      results.push({
        investmentId: inv.id,
        investmentName: inv.name,
        missingPersonIds,
        transactionsForMissing: inv.transactions.filter((t) => t.personId && missingPersonIds.includes(t.personId)),
      })
    }

    return NextResponse.json({ scannedDeals: investments.length, affectedCount: results.length, affected: results })
  } catch (error) {
    console.error('scan-missing-partner-participants error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to scan missing partner participants' },
      { status: 500 },
    )
  }
}
