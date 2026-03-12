import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await requireAuth(['OWNER'])

    const buckets = await prisma.cashBucket.findMany({
      where: { label: { startsWith: 'Profit •' } },
      select: {
        id: true,
        label: true,
        haulStartDate: true,
        movements: {
          where: { type: 'CASH_IN' },
          select: {
            date: true,
            investment: {
              select: { name: true, startDate: true },
            },
          },
        },
      },
    })

    console.log(JSON.stringify(buckets, null, 2))
    return NextResponse.json(buckets, { status: 200 })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Unauthorized' }, { status: err?.status ?? 500 })
  }
}
