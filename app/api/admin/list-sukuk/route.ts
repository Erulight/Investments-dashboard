import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await requireAuth(['OWNER'])

    const sukukInvestments = await prisma.investment.findMany({
      where: {
        account: { type: 'SUKUK' },
      },
      select: {
        id: true,
        name: true,
        principalAmount: true,
        startDate: true,
        maturityDate: true,
        metadata: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({
      count: sukukInvestments.length,
      investments: sukukInvestments.map((inv) => {
        const metadata = inv.metadata ? JSON.parse(inv.metadata) : {}
        return {
          id: inv.id,
          name: inv.name,
          principalAmount: inv.principalAmount,
          startDate: inv.startDate,
          maturityDate: inv.maturityDate,
          savingsHaulStartDate: metadata.savingsHaulStartDate,
        }
      }),
    })
  } catch (error) {
    console.error('List sukuk error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
