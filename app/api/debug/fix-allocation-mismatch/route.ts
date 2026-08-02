import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

export const dynamic = 'force-dynamic'

// One-off diagnostic + repair tool for the "Cannot withdraw principal because
// allocation state is inconsistent" error. This happens when an Investment's
// principalAmount is not fully backed by InvestmentBucketAllocation rows
// (e.g. legacy deals created before allocation tracking existed).
//
// Usage:
//   GET /api/debug/fix-allocation-mismatch?name=<investment name or id>
//     -> reports the mismatch, makes no changes
//   GET /api/debug/fix-allocation-mismatch?name=<investment name or id>&apply=1
//     -> reconstructs missing InvestmentBucketAllocation rows from INVEST_OUT
//        history (or, if none exists, from a synthetic legacy bucket) so the
//        allocated total matches principalAmount, then reports the result.
export async function GET(req: NextRequest) {
  try {
    await requireAuth(['OWNER'])

    const url = new URL(req.url)
    const nameOrId = url.searchParams.get('name') || url.searchParams.get('id')
    const apply = url.searchParams.get('apply') === '1'

    if (!nameOrId) {
      return NextResponse.json({ error: 'Missing name or id parameter' }, { status: 400 })
    }

    const investment = await prisma.investment.findFirst({
      where: {
        OR: [{ id: nameOrId }, { name: nameOrId }],
      },
    })

    if (!investment) {
      return NextResponse.json({ error: `Investment not found for "${nameOrId}"` }, { status: 404 })
    }

    const diagnose = async () => {
      const allocations = await prisma.investmentBucketAllocation.findMany({
        where: { investmentId: investment.id },
        include: { cashBucket: { select: { id: true, label: true, haulStartDate: true } } },
      })
      const investOutMovements = await prisma.cashBucketMovement.findMany({
        where: { investmentId: investment.id, type: 'INVEST_OUT' },
        include: { cashBucket: { select: { id: true, label: true, haulStartDate: true } } },
        orderBy: { date: 'asc' },
      })

      const totalAllocatedRemaining = allocations.reduce((sum, a) => sum + Number(a.principalRemaining || 0), 0)
      const totalInvestOut = investOutMovements.reduce((sum, m) => sum + Math.abs(Number(m.amount) || 0), 0)
      const mismatch = Number(investment.principalAmount || 0) - totalAllocatedRemaining

      return { allocations, investOutMovements, totalAllocatedRemaining, totalInvestOut, mismatch }
    }

    const before = await diagnose()

    if (!apply || before.mismatch <= 0.01) {
      return NextResponse.json({
        applied: false,
        investment: { id: investment.id, name: investment.name, principalAmount: investment.principalAmount },
        ...before,
      })
    }

    // Reconstruct: for each INVEST_OUT bucket without an existing allocation row,
    // create one covering that bucket's contribution.
    const existingBucketIds = new Set(before.allocations.map((a) => a.cashBucketId))
    const investOutByBucket = new Map<string, { amount: number; haulStartDate: Date; label: string | null }>()
    for (const m of before.investOutMovements) {
      const bucketId = m.cashBucketId
      const amt = Math.abs(Number(m.amount) || 0)
      const entry = investOutByBucket.get(bucketId)
      if (entry) {
        entry.amount += amt
      } else {
        investOutByBucket.set(bucketId, {
          amount: amt,
          haulStartDate: m.cashBucket?.haulStartDate || investment.startDate,
          label: m.cashBucket?.label || null,
        })
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const created: any[] = []
      let remainingShortfall = before.mismatch

      for (const [bucketId, entry] of investOutByBucket) {
        if (remainingShortfall <= 0.01) break
        if (existingBucketIds.has(bucketId)) continue // already tracked, leave alone

        const amount = Math.min(entry.amount, remainingShortfall)
        if (amount <= 0) continue

        const allocation = await tx.investmentBucketAllocation.create({
          data: {
            investmentId: investment.id,
            cashBucketId: bucketId,
            principalAllocated: amount,
            principalRemaining: amount,
            haulStartDate: entry.haulStartDate,
          },
        })
        created.push(allocation)
        remainingShortfall = Math.max(0, remainingShortfall - amount)
      }

      // Fallback: no (unmatched) INVEST_OUT history to reconstruct from.
      // Create a synthetic legacy cash bucket anchored to the investment's
      // start date so the allocation math has something to point at.
      if (remainingShortfall > 0.01) {
        const legacyBucket = await tx.cashBucket.create({
          data: {
            label: `${investment.name} Legacy Principal`,
            currency: 'SAR',
            haulStartDate: investment.startDate,
            balance: 0,
            excludeFromZakat: false,
          },
        })

        const allocation = await tx.investmentBucketAllocation.create({
          data: {
            investmentId: investment.id,
            cashBucketId: legacyBucket.id,
            principalAllocated: remainingShortfall,
            principalRemaining: remainingShortfall,
            haulStartDate: investment.startDate,
          },
        })
        created.push(allocation)
        remainingShortfall = 0
      }

      return created
    })

    const after = await diagnose()

    return NextResponse.json({
      applied: true,
      investment: { id: investment.id, name: investment.name, principalAmount: investment.principalAmount },
      createdAllocations: result,
      before,
      after,
    })
  } catch (error) {
    console.error('fix-allocation-mismatch error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to diagnose/fix allocation mismatch' },
      { status: 500 },
    )
  }
}
