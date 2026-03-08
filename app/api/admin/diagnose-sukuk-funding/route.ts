import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await requireAuth(['OWNER'])

    // Find all Sukuk investments
    const sukukDeals = await prisma.investment.findMany({
      where: {
        account: { type: 'SUKUK' },
      },
      include: {
        account: { select: { name: true, type: true } },
        bucketAllocations: {
          include: {
            cashBucket: {
              select: {
                id: true,
                label: true,
                balance: true,
                haulStartDate: true,
              },
            },
          },
        },
        transactions: {
          where: { type: 'CASH_INVEST' },
          select: {
            id: true,
            type: true,
            amount: true,
            date: true,
          },
        },
      },
      orderBy: { startDate: 'desc' },
    })

    const analysis = sukukDeals.map((deal) => {
      const totalBucketAllocations = deal.bucketAllocations.reduce(
        (sum, alloc) => sum + (alloc.principalAllocated || 0),
        0
      )
      const cashInvestTx = deal.transactions.find((t) => t.type === 'CASH_INVEST')
      const cashInvestAmount = cashInvestTx ? Math.abs(cashInvestTx.amount) : 0

      return {
        dealId: deal.id,
        dealName: deal.name,
        principalAmount: deal.principalAmount,
        startDate: deal.startDate,
        metadata: deal.metadata,
        fundingAnalysis: {
          principalAmount: deal.principalAmount,
          totalBucketAllocations,
          cashInvestTransaction: cashInvestAmount,
          fundingGap: deal.principalAmount - totalBucketAllocations,
          isFundedByBuckets: totalBucketAllocations > 0,
          bucketDetails: deal.bucketAllocations.map((alloc) => ({
            bucketId: alloc.cashBucketId,
            bucketLabel: alloc.cashBucket?.label,
            bucketBalance: alloc.cashBucket?.balance,
            bucketHaulStart: alloc.cashBucket?.haulStartDate,
            principalAllocated: alloc.principalAllocated,
            principalRemaining: alloc.principalRemaining,
          })),
        },
      }
    })

    return NextResponse.json({
      totalSukukDeals: sukukDeals.length,
      dealsWithBucketFunding: analysis.filter((a) => a.fundingAnalysis.isFundedByBuckets).length,
      dealsWithoutBucketFunding: analysis.filter((a) => !a.fundingAnalysis.isFundedByBuckets).length,
      analysis,
    })
  } catch (error) {
    console.error('Sukuk funding diagnosis error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
