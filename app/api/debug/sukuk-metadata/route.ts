import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  try {
    const sukukInvestments = await prisma.investment.findMany({
      where: {
        account: { type: 'SUKUK' },
      },
      select: {
        id: true,
        name: true,
        startDate: true,
        maturityDate: true,
        metadata: true,
      },
    })

    const details = []

    for (const sukuk of sukukInvestments) {
      const allocations = await prisma.investmentBucketAllocation.findMany({
        where: {
          investmentId: sukuk.id,
        },
        include: {
          cashBucket: {
            select: {
              id: true,
              label: true,
              haulStartDate: true,
            },
          },
        },
      })

      details.push({
        sukukId: sukuk.id,
        sukukName: sukuk.name,
        sukukStartDate: sukuk.startDate,
        sukukMaturityDate: sukuk.maturityDate,
        metadata: sukuk.metadata,
        allocations: allocations.map(a => ({
          allocationId: a.id,
          principalAllocated: a.principalAllocated,
          principalRemaining: a.principalRemaining,
          bucket: {
            id: a.cashBucket.id,
            label: a.cashBucket.label,
            haulStartDate: a.cashBucket.haulStartDate,
          },
        })),
      })
    }

    return NextResponse.json({
      success: true,
      count: details.length,
      details,
    })
  } catch (error) {
    console.error('Sukuk metadata error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get Sukuk metadata' },
      { status: 500 }
    )
  }
}
