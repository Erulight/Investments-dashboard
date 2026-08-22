import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

export const dynamic = 'force-dynamic'

const parseMetadata = (value: unknown) => {
  if (!value) return null
  if (typeof value === 'object') return value as any
  if (typeof value !== 'string') return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

// Diagnostic (read-only): full dump of a sukuk investment - its
// principalAmount, receivableAmount, dealParticipants, and every
// transaction/metadata field relevant to owner vs partner value
// calculations, so we can trace unexpected portfolio-value jumps.
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(['OWNER'])

    const url = new URL(req.url)
    const nameOrId = url.searchParams.get('name') || url.searchParams.get('id')
    if (!nameOrId) {
      return NextResponse.json({ error: 'Missing name or id parameter' }, { status: 400 })
    }

    const investment = await prisma.investment.findFirst({
      where: { OR: [{ id: nameOrId }, { name: nameOrId }] },
      include: {
        dealParticipants: true,
        transactions: {
          orderBy: { date: 'asc' },
        },
        account: { select: { type: true } },
      },
    })

    if (!investment) {
      return NextResponse.json({ error: `Investment not found for "${nameOrId}"` }, { status: 404 })
    }

    const ownerPersonId = user.personId || null

    return NextResponse.json({
      id: investment.id,
      name: investment.name,
      accountType: investment.account?.type,
      principalAmount: investment.principalAmount,
      currentValue: investment.currentValue,
      receivableAmount: investment.receivableAmount,
      totalReceived: investment.totalReceived,
      interestRate: investment.interestRate,
      fees: investment.fees,
      startDate: investment.startDate,
      maturityDate: investment.maturityDate,
      reopenedAt: investment.reopenedAt,
      metadata: parseMetadata(investment.metadata),
      ownerPersonId,
      dealParticipants: investment.dealParticipants.map((p: any) => ({
        id: p.id,
        personId: p.personId,
        isOwner: p.personId === ownerPersonId,
        investedAmount: p.investedAmount,
        currentValue: p.currentValue,
        receivable: p.receivable,
        profit: p.profit,
      })),
      sumOfParticipantInvestedAmount: investment.dealParticipants.reduce(
        (s: number, p: any) => s + Number(p.investedAmount || 0),
        0,
      ),
      transactions: investment.transactions.map((t: any) => ({
        id: t.id,
        type: t.type,
        amount: t.amount,
        date: t.date,
        personId: t.personId,
        metadata: parseMetadata(t.metadata),
      })),
    })
  } catch (error) {
    console.error('inspect-sukuk-full error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to inspect sukuk' },
      { status: 500 },
    )
  }
}
