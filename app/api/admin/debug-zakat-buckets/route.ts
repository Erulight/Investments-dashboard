import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await requireAuth(['OWNER'])

    const buckets = await prisma.cashBucket.findMany({
      select: {
        id: true,
        label: true,
        balance: true,
        currency: true,
        haulStartDate: true,
        excludeFromZakat: true,
        personId: true,
        allocations: {
          select: {
            investment: {
              select: {
                id: true,
                name: true,
                account: { select: { type: true } },
              },
            },
          },
        },
      },
      orderBy: { haulStartDate: 'asc' },
    })

    const activeBuckets = buckets.filter((b) => !b.excludeFromZakat)
    const excludedBuckets = buckets.filter((b) => b.excludeFromZakat)

    const sukukBuckets = buckets.filter((b) => {
      const label = typeof b.label === 'string' ? b.label : ''
      const hasSukukAllocation = b.allocations.some(
        (a) => a.investment?.account?.type === 'SUKUK'
      )
      const looksLikeSukukLabel =
        label.startsWith('Sukuk') || label.startsWith('Profit \\u2022 Sukuk')
      return hasSukukAllocation || looksLikeSukukLabel
    })

    return NextResponse.json({
      totalBuckets: buckets.length,
      activeCount: activeBuckets.length,
      excludedCount: excludedBuckets.length,
      sukukBuckets,
    })
  } catch (error) {
    console.error('debug-zakat-buckets error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to debug zakat buckets' },
      { status: 500 },
    )
  }
}
