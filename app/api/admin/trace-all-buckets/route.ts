import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await requireAuth(['OWNER'])

    // Get ALL buckets (including zero balance)
    const allBuckets = await prisma.cashBucket.findMany({
      include: {
        movements: {
          orderBy: { date: 'asc' },
        },
        allocations: true,
      },
      orderBy: { createdAt: 'asc' },
    })

    // Get all cash transactions
    const cashAccount = await prisma.account.findFirst({
      where: { type: 'CASH', isActive: true },
    })

    const cashTransactions = cashAccount
      ? await prisma.transaction.findMany({
          where: { accountId: cashAccount.id },
          orderBy: { date: 'asc' },
        })
      : []

    // Analyze each bucket
    const bucketAnalysis = allBuckets.map((bucket: any) => {
      const movementSum = bucket.movements.reduce(
        (sum: number, m: any) => sum + m.amount,
        0
      )
      const allocatedSum = bucket.allocations.reduce(
        (sum: number, a: any) => sum + (a.principalAllocated || 0),
        0
      )

      return {
        id: bucket.id,
        label: bucket.label,
        createdAt: bucket.createdAt,
        haulStartDate: bucket.haulStartDate,
        currentBalance: bucket.balance,
        movementSum,
        allocatedSum,
        balanceMatchesMovements: Math.abs(bucket.balance - movementSum) < 0.01,
        movements: bucket.movements.map((m: any) => ({
          type: m.type,
          amount: m.amount,
          date: m.date,
          investmentId: m.investmentId,
        })),
        allocations: bucket.allocations.map((a: any) => ({
          investmentId: a.investmentId,
          principalAllocated: a.principalAllocated,
          principalRemaining: a.principalRemaining,
        })),
      }
    })

    // Find orphan buckets (balance > 0 but no INVEST_OUT movements)
    const orphanBuckets = bucketAnalysis.filter((b: any) => {
      const hasInvestOut = b.movements.some((m: any) => m.type === 'INVEST_OUT')
      return b.currentBalance > 0 && !hasInvestOut
    })

    // Find duplicate patterns (same date, same amount)
    const cashInMovements = allBuckets.flatMap((b: any) =>
      b.movements
        .filter((m: any) => m.type === 'CASH_IN')
        .map((m: any) => ({
          bucketId: b.id,
          bucketLabel: b.label,
          date: m.date,
          amount: m.amount,
        }))
    )

    // Group by date+amount to find duplicates
    const groupedByDateAmount = new Map<string, any[]>()
    for (const m of cashInMovements) {
      const key = `${new Date(m.date).toISOString().split('T')[0]}_${m.amount}`
      const list = groupedByDateAmount.get(key) || []
      list.push(m)
      groupedByDateAmount.set(key, list)
    }

    const duplicates = Array.from(groupedByDateAmount.entries())
      .filter(([_, items]) => items.length > 1)
      .map(([key, items]) => ({ key, items }))

    return NextResponse.json({
      totalBuckets: allBuckets.length,
      bucketsWithBalance: bucketAnalysis.filter((b: any) => b.currentBalance > 0).length,
      orphanBuckets: orphanBuckets.length,
      duplicatePatterns: duplicates.length,
      summary: {
        totalBucketBalance: bucketAnalysis.reduce((sum: number, b: any) => sum + b.currentBalance, 0),
        totalMovementSum: bucketAnalysis.reduce((sum: number, b: any) => sum + b.movementSum, 0),
        totalAllocated: bucketAnalysis.reduce((sum: number, b: any) => sum + b.allocatedSum, 0),
      },
      orphanBucketDetails: orphanBuckets,
      duplicateDetails: duplicates,
      allBuckets: bucketAnalysis,
      cashTransactions: cashTransactions.map((t: any) => ({
        type: t.type,
        amount: t.amount,
        date: t.date,
        description: t.description,
      })),
    })
  } catch (error) {
    console.error('Trace buckets error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
