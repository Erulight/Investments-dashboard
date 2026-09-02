import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

export const dynamic = 'force-dynamic'

// Diagnostic (read-only): dumps everything relevant to why a partner might
// be hitting "Amount exceeds your remaining profit" on a given Sukuk deal -
// the DealParticipant record (the cap), investment.reopenedAt (which gates
// how far back the "already withdrawn" sum looks), and every
// WITHDRAW_PROFIT/WITHDRAW_PRINCIPAL movement + transaction tied to the deal
// (regardless of scope), so we can see exactly what's counted vs not.
export async function GET(req: NextRequest) {
  try {
    await requireAuth(['OWNER'])

    const url = new URL(req.url)
    const nameOrId = url.searchParams.get('name') || url.searchParams.get('id')
    if (!nameOrId) {
      return NextResponse.json({ error: 'Missing name or id parameter' }, { status: 400 })
    }

    const investment = await prisma.investment.findFirst({
      where: { OR: [{ id: nameOrId }, { name: nameOrId }] },
      include: {
        dealParticipants: { include: { person: true } },
      },
    })

    if (!investment) {
      return NextResponse.json({ error: `Investment not found for "${nameOrId}"` }, { status: 404 })
    }

    const movements = await prisma.cashBucketMovement.findMany({
      where: {
        investmentId: investment.id,
        type: { in: ['WITHDRAW_PROFIT', 'WITHDRAW_PRINCIPAL', 'ROLLBACK_PRINCIPAL'] },
      },
      include: { cashBucket: { select: { id: true, label: true, personId: true } } },
      orderBy: { createdAt: 'asc' },
    })

    const transactions = await prisma.transaction.findMany({
      where: {
        investmentId: investment.id,
        type: { in: ['WITHDRAW_PROFIT', 'WITHDRAW_PRINCIPAL'] },
      },
      orderBy: { createdAt: 'asc' },
    })

    return NextResponse.json({
      investment: {
        id: investment.id,
        name: investment.name,
        principalAmount: investment.principalAmount,
        receivableAmount: investment.receivableAmount,
        totalReceived: investment.totalReceived,
        reopenedAt: investment.reopenedAt,
      },
      dealParticipants: investment.dealParticipants.map((p) => ({
        id: p.id,
        personId: p.personId,
        personName: (p as any).person?.name,
        investedAmount: p.investedAmount,
        currentValue: p.currentValue,
        receivable: p.receivable,
        profit: p.profit,
        commissionFees: p.commissionFees,
        acquiredAt: p.acquiredAt,
      })),
      movements,
      transactions,
    })
  } catch (error) {
    console.error('inspect-partner-profit-limit error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to inspect partner profit limit' },
      { status: 500 },
    )
  }
}
