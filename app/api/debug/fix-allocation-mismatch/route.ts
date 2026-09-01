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
      const principalWithdrawalMovements = await prisma.cashBucketMovement.findMany({
        where: { investmentId: investment.id, type: { in: ['WITHDRAW_PRINCIPAL', 'ROLLBACK_PRINCIPAL'] } },
        orderBy: { date: 'asc' },
      })

      const totalAllocatedRemaining = allocations.reduce((sum, a) => sum + Number(a.principalRemaining || 0), 0)
      const totalInvestOut = investOutMovements.reduce((sum, m) => sum + Math.abs(Number(m.amount) || 0), 0)
      const totalWithdrawn = principalWithdrawalMovements.reduce((sum, m) => sum + Math.abs(Number(m.amount) || 0), 0)
      // Ground truth: what should actually remain, based on real cash movements
      // (money that came in via INVEST_OUT minus money that has genuinely gone
      // back out via WITHDRAW_PRINCIPAL/ROLLBACK_PRINCIPAL) - NOT
      // investment.principalAmount, which is only reliable for OWNER-only
      // withdrawals and can itself go stale (e.g. partner-driven withdrawals
      // never touch it).
      const expectedRemaining = totalInvestOut - totalWithdrawn
      const mismatch = expectedRemaining - totalAllocatedRemaining

      return { allocations, investOutMovements, totalAllocatedRemaining, totalInvestOut, totalWithdrawn, expectedRemaining, mismatch }
    }

    const before = await diagnose()
    const { expectedRemaining } = before

    // We only ever repair up to what the real cash movement history
    // justifies, never beyond it, so we can't accidentally conjure up
    // principal that was legitimately already withdrawn (mismatch > 0), nor
    // leave phantom "available" principal that was actually already spent
    // (mismatch < 0, which could let someone double-withdraw real cash).
    const repairableShortfall = Math.max(0, before.mismatch)
    const repairableExcess = Math.max(0, -before.mismatch)

    if (!apply || (repairableShortfall <= 0.01 && repairableExcess <= 0.01)) {
      return NextResponse.json({
        applied: false,
        investment: { id: investment.id, name: investment.name, principalAmount: investment.principalAmount },
        repairableShortfall,
        repairableExcess,
        ...before,
      })
    }

    if (repairableExcess > 0.01) {
      // Over-tracked: proportionally reduce each allocation's
      // principalRemaining down until the total matches ground truth.
      const result = await prisma.$transaction(async (tx) => {
        const reduced: any[] = []
        let remainingToRemove = repairableExcess

        for (const alloc of before.allocations) {
          if (remainingToRemove <= 0.01) break
          const currentRemaining = Number(alloc.principalRemaining || 0)
          if (currentRemaining <= 0.01) continue

          const removeAmount = Math.min(currentRemaining, remainingToRemove)
          const updated = await tx.investmentBucketAllocation.update({
            where: { id: alloc.id },
            data: { principalRemaining: currentRemaining - removeAmount },
          })
          reduced.push(updated)
          remainingToRemove = Math.max(0, remainingToRemove - removeAmount)
        }

        return { reduced }
      })

      const after = await diagnose()
      return NextResponse.json({
        applied: true,
        direction: 'reduced',
        investment: { id: investment.id, name: investment.name, principalAmount: investment.principalAmount },
        expectedRemaining,
        repairableExcess,
        reducedAllocations: result.reduced,
        before,
        after,
      })
    }

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
      const restored: any[] = []
      const created: any[] = []
      let remainingShortfall = repairableShortfall

      // Step 1: top up existing allocations that are under their own
      // principalAllocated cap (this is the common case: a prior operation
      // zeroed out principalRemaining without any real withdrawal happening).
      for (const alloc of before.allocations) {
        if (remainingShortfall <= 0.01) break

        const allocatedCap = Number(alloc.principalAllocated || 0)
        const currentRemaining = Number(alloc.principalRemaining || 0)
        const room = Math.max(0, allocatedCap - currentRemaining)
        if (room <= 0.01) continue

        const addBack = Math.min(room, remainingShortfall)
        const updated = await tx.investmentBucketAllocation.update({
          where: { id: alloc.id },
          data: { principalRemaining: currentRemaining + addBack },
        })
        restored.push(updated)
        remainingShortfall = Math.max(0, remainingShortfall - addBack)
      }

      // Step 2: for any INVEST_OUT bucket that never got an allocation row at
      // all, create one covering that bucket's contribution.
      for (const [bucketId, entry] of investOutByBucket) {
        if (remainingShortfall <= 0.01) break
        if (existingBucketIds.has(bucketId)) continue

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

      // Step 3: fallback if nothing above could absorb the shortfall.
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

      return { restored, created }
    })

    const after = await diagnose()

    return NextResponse.json({
      applied: true,
      investment: { id: investment.id, name: investment.name, principalAmount: investment.principalAmount },
      expectedRemaining,
      repairableShortfall,
      restoredAllocations: result.restored,
      createdAllocations: result.created,
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
