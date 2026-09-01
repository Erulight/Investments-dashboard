import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

export const dynamic = 'force-dynamic'

// Scans every SUKUK investment for the "allocation state is inconsistent"
// bug proactively: compares the ground truth (INVEST_OUT total minus real
// WITHDRAW_PRINCIPAL/ROLLBACK_PRINCIPAL total) against what
// InvestmentBucketAllocation currently tracks as remaining. Read-only -
// use /api/debug/fix-allocation-mismatch?name=<deal>&apply=1 per deal to
// actually repair any deal this reports.
export async function GET() {
  try {
    await requireAuth(['OWNER'])

    const investments = await prisma.investment.findMany({
      where: { account: { type: 'SUKUK' } },
      select: { id: true, name: true, principalAmount: true },
    })

    const results = await Promise.all(
      investments.map(async (inv) => {
        const [allocations, investOutMovements, withdrawalMovements] = await Promise.all([
          prisma.investmentBucketAllocation.findMany({
            where: { investmentId: inv.id },
            select: { principalRemaining: true },
          }),
          prisma.cashBucketMovement.findMany({
            where: { investmentId: inv.id, type: 'INVEST_OUT' },
            select: { amount: true },
          }),
          prisma.cashBucketMovement.findMany({
            where: { investmentId: inv.id, type: { in: ['WITHDRAW_PRINCIPAL', 'ROLLBACK_PRINCIPAL'] } },
            select: { amount: true },
          }),
        ])

        const totalAllocatedRemaining = allocations.reduce((s, a) => s + Number(a.principalRemaining || 0), 0)
        const totalInvestOut = investOutMovements.reduce((s, m) => s + Math.abs(Number(m.amount) || 0), 0)
        const totalWithdrawn = withdrawalMovements.reduce((s, m) => s + Math.abs(Number(m.amount) || 0), 0)
        const expectedRemaining = totalInvestOut - totalWithdrawn
        const mismatch = round2(expectedRemaining - totalAllocatedRemaining)

        return {
          id: inv.id,
          name: inv.name,
          principalAmount: inv.principalAmount,
          totalInvestOut: round2(totalInvestOut),
          totalWithdrawn: round2(totalWithdrawn),
          expectedRemaining: round2(expectedRemaining),
          totalAllocatedRemaining: round2(totalAllocatedRemaining),
          mismatch,
        }
      }),
    )

    const affected = results.filter((r) => Math.abs(r.mismatch) > 0.01)

    return NextResponse.json({
      scannedDeals: results.length,
      affectedCount: affected.length,
      affected,
    })
  } catch (error) {
    console.error('scan-all-allocation-mismatches error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to scan allocation mismatches' },
      { status: 500 },
    )
  }
}

function round2(value: number) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100) / 100
}
