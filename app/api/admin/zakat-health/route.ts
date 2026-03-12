import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest) {
  try {
    await requireAuth(['OWNER'])

    const warnings: Array<{
      type: string
      bucketId?: string
      bucketLabel?: string
      investmentId?: string
      investmentName?: string
      message: string
    }> = []

    const [buckets, zakatPaid, sukukInvs] = await Promise.all([
      prisma.cashBucket.findMany({
        where: { excludeFromZakat: false },
        select: {
          id: true,
          label: true,
          haulStartDate: true,
          balance: true,
          excludeFromZakat: true,
          debt: { select: { id: true } },
          allocations: {
            select: {
              principalRemaining: true,
              principalAllocated: true,
              investment: {
                select: {
                  id: true,
                  name: true,
                  metadata: true,
                  maturityDate: true,
                  account: { select: { type: true } },
                },
              },
            },
          },
        },
      }),
      prisma.cashBucketMovement.findMany({
        where: { type: 'ZAKAT_PAID' },
        select: { cashBucketId: true, amount: true, date: true },
      }),
      prisma.investment.findMany({
        where: { account: { type: 'SUKUK' } },
        select: {
          id: true,
          name: true,
          metadata: true,
          maturityDate: true,
          bucketAllocations: {
            select: {
              principalRemaining: true,
              cashBucket: { select: { label: true } },
            },
          },
        },
      }),
    ])

    const totalZakatPaid = zakatPaid.reduce((s, m) => s + Math.abs(Number(m.amount)), 0)
    const now = new Date()

    // Check 1: Bucket missing haulStartDate
    for (const b of buckets) {
      if (!b.haulStartDate || isNaN(new Date(b.haulStartDate as any).getTime())) {
        warnings.push({
          type: 'MISSING_HAUL_START',
          bucketId: b.id,
          bucketLabel: b.label || undefined,
          message: `Bucket missing haulStartDate — ${b.label || b.id.slice(0, 8)}`,
        })
      }
    }

    // Check 2: Debt bucket leaking into zakat
    for (const b of buckets) {
      if ((b as any).debt?.id) {
        warnings.push({
          type: 'DEBT_BUCKET_LEAKING',
          bucketId: b.id,
          bucketLabel: b.label || undefined,
          message: `Debt bucket leaking into zakat — ${b.label || b.id.slice(0, 8)}`,
        })
      }
    }

    // Check 3: ROSCA Sukuk missing savingsHaulStartDate
    for (const inv of sukukInvs) {
      try {
        const meta = inv.metadata ? JSON.parse(inv.metadata as string) : {}
        const isRosca = inv.bucketAllocations.some((a) => {
          const lbl = a.cashBucket?.label || ''
          return lbl.startsWith('Savings Receipt •') || lbl.startsWith('Circlys Reward Receipt •')
        })
        if (isRosca && !meta?.savingsHaulStartDate) {
          warnings.push({
            type: 'MISSING_SAVINGS_HAUL',
            investmentId: inv.id,
            investmentName: inv.name,
            message: `ROSCA funded Sukuk missing savingsHaulStartDate — ${inv.name}`,
          })
        }
      } catch {}
    }

    // Check 4: Possible double counting — bucket allocated to multiple active investments
    for (const b of buckets) {
      const activeAllocs = b.allocations.filter((a) => Number(a.principalRemaining) > 0.01)
      if (activeAllocs.length > 1) {
        warnings.push({
          type: 'DOUBLE_COUNTING',
          bucketId: b.id,
          bucketLabel: b.label || undefined,
          message: `Possible double counting — "${b.label || b.id.slice(0, 8)}" allocated to ${activeAllocs.length} active investments`,
        })
      }
    }

    // Check 5: Hawl clock jumped backwards — allocation haulStartDate earlier than bucket's
    for (const b of buckets) {
      const bucketHaul = b.haulStartDate ? new Date(b.haulStartDate as any).getTime() : null
      if (!bucketHaul) continue
      for (const alloc of b.allocations) {
        if (alloc.investment?.account?.type !== 'SUKUK') continue
        try {
          const meta = alloc.investment.metadata ? JSON.parse(alloc.investment.metadata as string) : {}
          const savedHaul = meta?.savingsHaulStartDate ? new Date(meta.savingsHaulStartDate).getTime() : null
          if (savedHaul && savedHaul < bucketHaul - 86400000 * 30) {
            warnings.push({
              type: 'HAWL_JUMPED_BACKWARDS',
              bucketId: b.id,
              bucketLabel: b.label || undefined,
              investmentId: alloc.investment.id,
              investmentName: alloc.investment.name,
              message: `Hawl clock jumped backwards — ${alloc.investment.name}`,
            })
          }
        } catch {}
      }
    }

    // Check 6: Active Sukuk appearing with zakat due
    for (const inv of sukukInvs) {
      const maturity = inv.maturityDate ? new Date(inv.maturityDate as any) : null
      const isActive = !maturity || maturity > now
      if (isActive) {
        const activeAllocs = inv.bucketAllocations.filter((a) => Number(a.principalRemaining) > 0.01)
        if (activeAllocs.length > 0) {
          // This is fine — active Sukuk principal is not zakatable until closed
          // Only flag if somehow these appear in due rows
        }
      }
    }

    const bucketsWithIssues = new Set(warnings.filter((w) => w.bucketId).map((w) => w.bucketId!)).size
    const totalZakatDue = buckets.reduce((s, b) => s + Math.max(0, Number(b.balance)) * 0.025, 0)

    return NextResponse.json({
      status: warnings.length === 0 ? 'OK' : 'WARNINGS',
      warnings,
      stats: {
        totalBuckets: buckets.length,
        bucketsWithIssues,
        totalZakatDue: Math.round(totalZakatDue * 100) / 100,
        totalZakatPaid: Math.round(totalZakatPaid * 100) / 100,
      },
    })
  } catch (error) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Forbidden')) {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    return NextResponse.json({ error: 'Health check failed' }, { status: 500 })
  }
}
