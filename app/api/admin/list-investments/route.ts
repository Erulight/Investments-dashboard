import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    await requireAuth(['OWNER'])

    const url = new URL(req.url)
    const q = url.searchParams.get('q') // optional search text
    const takeRaw = url.searchParams.get('take')
    const take = takeRaw ? Math.min(100, Math.max(1, Number(takeRaw))) : 30

    const where = q
      ? { name: { contains: q, mode: 'insensitive' } } as any
      : {}

    const investments = await prisma.investment.findMany({
      where,
      select: { id: true, name: true },
      orderBy: { createdAt: 'desc' },
      take,
    })

    return NextResponse.json({ count: investments.length, investments })
  } catch (error) {
    console.error('list-investments error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
