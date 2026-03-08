import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await requireAuth(['OWNER'])

    // Find all buckets with balance > 0
    const bucketsWithBalance = await prisma.cashBucket.findMany({
      where: {
        balance: { gt: 0 },
      },
      include: {
        allocations: {
          include: {
            investment: {
              select: {
                id: true,
                name: true,
                principalAmount: true,
                startDate: true,
                account: { select: { type: true } },
              },
            },
          },
        },
        movements: {
          orderBy: { date: 'asc' },
          select: {
            id: true,
            type: true,
            amount: true,
            date: true,
            investmentId: true,
          },
        },
      },
    })

    // Calculate discrepancies
    const issues = bucketsWithBalance.map((bucket) => {
      const totalAllocated = bucket.allocations.reduce(
        (sum, alloc) => sum + (alloc.principalRemaining || 0),
        0
      )
      const movementSum = bucket.movements.reduce(
        (sum, mov) => sum + mov.amount,
        0
      )

      return {
        bucketId: bucket.id,
        label: bucket.label,
        currentBalance: bucket.balance,
        totalAllocated,
        movementSum,
        discrepancy: bucket.balance - movementSum,
        allocatedButStillHasBalance: totalAllocated > 0 && bucket.balance > 0,
        allocations: bucket.allocations.map((a) => ({
          investmentId: a.investmentId,
          investmentName: a.investment?.name,
          investmentType: a.investment?.account?.type,
          principalAllocated: a.principalAllocated,
          principalRemaining: a.principalRemaining,
        })),
        movements: bucket.movements,
      }
    })

    const problematicBuckets = issues.filter((i) => i.allocatedButStillHasBalance)

    return NextResponse.json({
      totalBucketsWithBalance: bucketsWithBalance.length,
      problematicBuckets: problematicBuckets.length,
      issues,
      summary: {
        totalBalance: bucketsWithBalance.reduce((sum, b) => sum + b.balance, 0),
        totalAllocated: issues.reduce((sum, i) => sum + i.totalAllocated, 0),
      },
    })
  } catch (error) {
    console.error('Bucket diagnosis error:', error)
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    )
  }
}
