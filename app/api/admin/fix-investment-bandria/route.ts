import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    await requireAuth(['OWNER'])

    const existing = await prisma.investment.findFirst({
      where: { name: { contains: 'بندرية' } },
      select: {
        id: true,
        principalAmount: true,
        receivableAmount: true,
        totalReceived: true,
        interestRate: true,
        fees: true,
      },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Investment not found' }, { status: 404 })
    }

    const updated = await prisma.investment.update({
      where: { id: existing.id },
      data: {
        receivableAmount: 580.32,
        totalReceived: 0,
      },
      select: {
        id: true,
        principalAmount: true,
        receivableAmount: true,
        totalReceived: true,
        interestRate: true,
        fees: true,
      },
    })

    return NextResponse.json({ before: existing, after: updated })
  } catch (error) {
    console.error('fix-investment-bandria error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fix investment' },
      { status: 500 },
    )
  }
}
