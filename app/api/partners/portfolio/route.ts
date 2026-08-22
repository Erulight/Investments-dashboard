import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'
import { getBucketCashBalance } from '@/lib/cashBalance'

export const dynamic = 'force-dynamic'

// Owner-only summary of each partner's total portfolio (cash + their share
// of every deal they participate in), for the dashboard's "Partner
// Portfolios" tile.
export async function GET() {
  try {
    await requireAuth(['OWNER'])

    const partnerUsers = await prisma.user.findMany({
      where: { OR: [{ role: 'PARTNER' }, { canEditAsPartner: true }] },
      select: {
        id: true,
        name: true,
        email: true,
        personId: true,
        person: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    })

    const seen = new Set<string>()
    const partners = partnerUsers
      .map((u) => ({
        personId: u.personId || u.person?.id || null,
        name: u.person?.name || u.name || u.email,
      }))
      .filter((p): p is { personId: string; name: string } => {
        if (!p.personId || seen.has(p.personId)) return false
        seen.add(p.personId)
        return true
      })

    if (partners.length === 0) {
      return NextResponse.json({ partners: [] })
    }

    const personIds = partners.map((p) => p.personId)

    const investedByPerson = await prisma.dealParticipant.groupBy({
      by: ['personId'],
      where: { personId: { in: personIds } },
      _sum: { currentValue: true },
    })
    const investedMap = new Map(
      investedByPerson.map((d) => [d.personId, Number(d._sum.currentValue || 0)]),
    )

    const results = await Promise.all(
      partners.map(async (p) => {
        const cash = await getBucketCashBalance(prisma, p.personId)
        const invested = Math.max(0, investedMap.get(p.personId) || 0)
        return {
          personId: p.personId,
          name: p.name,
          cash: Math.max(0, cash),
          invested,
          totalPortfolio: Math.max(0, cash) + invested,
        }
      }),
    )

    results.sort((a, b) => b.totalPortfolio - a.totalPortfolio)

    return NextResponse.json({ partners: results })
  } catch (error) {
    console.error('Partner portfolio fetch error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load partner portfolios' },
      { status: 500 },
    )
  }
}
