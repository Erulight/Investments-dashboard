import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    await requireAuth(['OWNER'])

    const url = new URL(req.url)
    const idParam = url.searchParams.get('id')
    const q = url.searchParams.get('q') || 'بندرية'

    const where = idParam
      ? { id: idParam }
      : { name: { contains: q, mode: 'insensitive' } } as any

    const inv = await prisma.investment.findFirst({
      where,
      select: {
        id: true,
        name: true,
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
