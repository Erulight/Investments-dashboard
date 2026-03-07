import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await requireAuth(['OWNER'])

    const inv = await prisma.investment.findFirst({
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

    return NextResponse.json({ inv })
  } catch (error) {
    console.error('debug-investment-bandria error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to debug investment' },
      { status: 500 },
    )
  }
}
