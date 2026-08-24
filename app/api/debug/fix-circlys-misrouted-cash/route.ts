import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'
import { recomputeCashSetting } from '@/lib/cashBalance'

export const dynamic = 'force-dynamic'

// One-off repair for the Circlys pay-route bucket-scoping bug (fixed in
// commit 87efc35): withdrawFromBuckets() was called without personId, so it
// could drain a PARTNER's cash bucket to fund an owner-only Circlys
// contribution/payback, while the "undo" path always credited the OWNER's
// own bucket regardless of where the money actually came from.
//
// This restores the exact amounts wrongly debited from each partner's
// bucket, and debits the equivalent total from the owner's own cash (since
// the owner never actually paid for these Circlys expenses, and/or received
// erroneous "undo" credits that belonged to a partner instead).
//
// GET  -> report only, no changes
// GET ?apply=1 -> perform the credits/debit in one transaction
const REPAIRS = [
  { personId: 'cmli0pbff000113095mnmbqwa', bucketId: 'cmmp7gphc00085owsi5yfo1xh', amount: 1000, label: 'Partner A (Aug 2026(Maj) Month 1, double-charged)' },
  { personId: 'cmli0pbfv000213092vszelad', bucketId: 'cmmo57yf4001grtdq327h6izr', amount: 1700, label: 'Partner B (June 2026(Maj) Month 3 double-charge + Oct 2025(Rid) Month 11 payback)' },
]

export async function GET(req: NextRequest) {
  try {
    await requireAuth(['OWNER'])
    const url = new URL(req.url)
    const apply = url.searchParams.get('apply') === '1'

    const totalToOwnerDebit = REPAIRS.reduce((s, r) => s + r.amount, 0)

    const buckets = await prisma.cashBucket.findMany({
      where: { id: { in: REPAIRS.map((r) => r.bucketId) } },
      select: { id: true, personId: true, balance: true, label: true },
    })

    const report = REPAIRS.map((r) => ({
      ...r,
      currentBucketBalance: buckets.find((b) => b.id === r.bucketId)?.balance ?? null,
      bucketPersonIdMatches: buckets.find((b) => b.id === r.bucketId)?.personId === r.personId,
    }))

    if (!apply) {
      return NextResponse.json({
        applied: false,
        report,
        totalToOwnerDebit,
      })
    }

    const mismatched = report.filter((r) => !r.bucketPersonIdMatches)
    if (mismatched.length > 0) {
      return NextResponse.json(
        { error: 'Bucket personId no longer matches expected value - aborting for safety.', mismatched },
        { status: 409 },
      )
    }

    const result = await prisma.$transaction(async (tx: any) => {
      for (const r of REPAIRS) {
        await tx.cashBucket.update({
          where: { id: r.bucketId },
          data: { balance: { increment: r.amount } },
        })
        await tx.cashBucketMovement.create({
          data: {
            cashBucketId: r.bucketId,
            amount: r.amount,
            type: 'CASH_IN',
            date: new Date(),
            notes: `Repair: restore misrouted Circlys withdrawal - ${r.label}`,
          },
        })
        await recomputeCashSetting(tx, r.personId)
      }

      // Debit the owner's raw current balances directly (not via
      // withdrawFromBuckets), since this is a corrective adjustment to
      // today's snapshot, not a real new expense - it shouldn't be blocked
      // by that helper's future-scheduled-outflow guard.
      const ownerBuckets = await tx.cashBucket.findMany({
        where: { personId: null, balance: { gt: 0 } },
        orderBy: [{ haulStartDate: 'asc' }, { createdAt: 'asc' }],
      })

      let remaining = totalToOwnerDebit
      for (const bucket of ownerBuckets) {
        if (remaining <= 0.0001) break
        const used = Math.min(bucket.balance, remaining)
        if (used <= 0) continue

        await tx.cashBucket.update({
          where: { id: bucket.id },
          data: { balance: { decrement: used } },
        })
        await tx.cashBucketMovement.create({
          data: {
            cashBucketId: bucket.id,
            amount: -used,
            type: 'CASH_OUT',
            date: new Date(),
            notes: 'Repair: reverse cash wrongly retained from misrouted Circlys withdrawals',
          },
        })
        remaining -= used
      }

      if (remaining > 0.0001) {
        throw new Error('INSUFFICIENT_CASH')
      }

      await recomputeCashSetting(tx, null)

      return { debitedFromOwner: totalToOwnerDebit }
    })

    return NextResponse.json({ applied: true, report, ...result })
  } catch (error) {
    console.error('fix-circlys-misrouted-cash error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to repair misrouted Circlys cash' },
      { status: 500 },
    )
  }
}
