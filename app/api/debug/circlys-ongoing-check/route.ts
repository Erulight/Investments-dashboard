import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

export const dynamic = 'force-dynamic'

const parseMetadata = (value: unknown) => {
  if (!value) return {}
  if (typeof value === 'object') return value as any
  if (typeof value !== 'string') return {}
  try {
    return JSON.parse(value)
  } catch {
    return {}
  }
}

const toFiniteNumber = (value: unknown, fallback = 0) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

// Diagnostic (read-only) for the "Circlys Ongoing" dashboard tile
// ("Saved (not received)"). Lists every CIRCLYS investment with the fields
// that drive the tile, and shows the total both with and without excluding
// circles whose payout has already been received.
export async function GET() {
  try {
    await requireAuth(['OWNER'])

    const investments = await prisma.investment.findMany({
      include: { account: true },
    })

    const circlys = investments.filter((inv: any) => inv.account?.type === 'CIRCLYS')

    let totalIncludingReceived = 0
    let totalExcludingReceived = 0

    const details = circlys.map((inv: any) => {
      const meta = parseMetadata(inv.metadata)
      const hasReceived = Boolean(meta?.received?.date)
      const monthlyContribution = toFiniteNumber(meta?.monthlyContribution)
      const totalMonths = toFiniteNumber(meta?.totalMonths)
      const totalRequired = monthlyContribution * totalMonths
      const totalPaid = Math.max(0, toFiniteNumber(meta?.totalPaid))
      const monthsPaid = Math.max(0, toFiniteNumber(meta?.monthsPaid))
      const stillOwing = totalRequired > totalPaid

      if (stillOwing) {
        totalIncludingReceived += totalPaid
        if (!hasReceived) totalExcludingReceived += totalPaid
      }

      return {
        id: inv.id,
        name: inv.name,
        hasReceived,
        receivedDate: meta?.received?.date || null,
        monthlyContribution,
        totalMonths,
        monthsPaid,
        totalRequired,
        totalPaid,
        stillOwing,
        countedTowardTile_currentLogic: stillOwing,
        countedTowardTile_fixedLogic: stillOwing && !hasReceived,
      }
    })

    return NextResponse.json({
      currentTileValue_beforeFix: totalIncludingReceived,
      correctedTileValue_afterFix: totalExcludingReceived,
      difference: totalIncludingReceived - totalExcludingReceived,
      circlys: details,
    })
  } catch (error) {
    console.error('circlys-ongoing-check error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to check circlys ongoing' },
      { status: 500 },
    )
  }
}
