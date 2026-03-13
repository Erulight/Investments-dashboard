import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { requireModuleAccess } from '@/lib/rbac'
import { DISPLAY_CURRENCY_KEY, normalizeDisplayCurrency } from '@/lib/currency'
import { ZakatAuditClient } from '@/components/zakat/ZakatAuditClient'

export const dynamic = 'force-dynamic'

const HAWL_DAYS = 354
const ZAKAT_RATE = 0.025

const toIso = (d: Date | string | null | undefined): string => {
  if (!d) return ''
  const dt = d instanceof Date ? d : new Date(d as string)
  if (isNaN(dt.getTime())) return ''
  return dt.toISOString().split('T')[0]
}

export default async function ZakatAuditPage() {
  await requireModuleAccess('zakat')
  const user = await getCurrentUser()
  if (!user) return null
  if (user.role !== 'OWNER' && user.role !== 'PARTNER') {
    return <div className="p-8 text-slate-400 text-sm">Access restricted.</div>
  }

  const personFilter =
    user.role === 'PARTNER' && user.personId ? { personId: user.personId } : undefined

  const [displayCurrencySetting, cashBuckets, sukukInvestments, zakatMovements, cryptoInvestments] =
    await Promise.all([
      prisma.systemSetting.findUnique({ where: { key: DISPLAY_CURRENCY_KEY } }),
      prisma.cashBucket.findMany({
        where: { excludeFromZakat: false, ...(personFilter ?? {}) },
        select: {
          id: true,
          label: true,
          currency: true,
          balance: true,
          haulStartDate: true,
          lastZakatPaidDate: true,
          personId: true,
          debt: { select: { id: true } },
          allocations: {
            select: {
              principalAllocated: true,
              principalRemaining: true,
              haulStartDate: true,
              investment: {
                select: {
                  id: true,
                  name: true,
                  maturityDate: true,
                  metadata: true,
                  account: { select: { type: true } },
                },
              },
            },
          },
        },
        orderBy: { haulStartDate: 'asc' },
      }),
      prisma.investment.findMany({
        where: { account: { type: 'SUKUK' } },
        select: {
          id: true,
          name: true,
          principalAmount: true,
          currentValue: true,
          maturityDate: true,
          startDate: true,
          metadata: true,
          bucketAllocations: {
            select: {
              principalAllocated: true,
              principalRemaining: true,
              haulStartDate: true,
              cashBucket: {
                select: { id: true, label: true, haulStartDate: true, balance: true, currency: true },
              },
            },
          },
        },
        orderBy: { startDate: 'desc' },
      }),
      prisma.cashBucketMovement.findMany({
        where: { type: 'ZAKAT_PAID', cashBucket: personFilter ?? {} },
        orderBy: { date: 'desc' },
        include: {
          cashBucket: {
            select: {
              id: true,
              label: true,
              currency: true,
              personId: true,
              person: { select: { name: true } },
              allocations: {
                take: 1,
                select: {
                  investment: { select: { id: true, name: true, account: { select: { type: true } } } },
                },
              },
            },
          },
        },
      }),
      prisma.investment.findMany({
        where: { account: { type: 'CRYPTO' } },
        select: { id: true, name: true, currentValue: true },
      }),
    ])

  const displayCurrency = normalizeDisplayCurrency(displayCurrencySetting?.value)
  const now = new Date()
  const thisYearStart = new Date(now.getFullYear(), 0, 1)

  // ── Section A: Wealth & zakat breakdown ──────────────────────────────────
  let wealthCash = 0
  let wealthSavings = 0
  let wealthRewards = 0

  for (const b of cashBuckets) {
    const bal = Math.max(0, Number(b.balance) || 0)
    if (bal <= 0) continue
    const label = b.label || ''
    if (label.startsWith('Circlys •') && !label.includes('Receipt')) {
      wealthSavings += bal
    } else if (label.includes('Reward Receipt') || label.includes('Circlys Reward Receipt')) {
      wealthRewards += bal
    } else {
      wealthCash += bal
    }
  }

  let wealthActiveSukuk = 0
  for (const inv of sukukInvestments) {
    const maturity = inv.maturityDate ? new Date(inv.maturityDate as any) : null
    const isActive = !maturity || maturity > now
    if (isActive) {
      wealthActiveSukuk += inv.bucketAllocations.reduce(
        (s, a) => s + Math.max(0, Number(a.principalRemaining) || 0),
        0
      )
    }
  }

  const wealthCrypto = cryptoInvestments.reduce((s, inv) => s + Math.max(0, Number(inv.currentValue) || 0), 0)

  let totalPaid = 0
  let paidThisYear = 0
  for (const m of zakatMovements) {
    const amt = Math.abs(Number(m.amount))
    totalPaid += amt
    if (new Date(m.date as any) >= thisYearStart) paidThisYear += amt
  }

  let nextDueDate: string | null = null
  for (const b of cashBuckets) {
    if (!b.haulStartDate) continue
    const haulEnd = new Date(new Date(b.haulStartDate as any).getTime() + HAWL_DAYS * 86400000)
    if (haulEnd > now) {
      if (!nextDueDate || haulEnd < new Date(nextDueDate)) {
        nextDueDate = toIso(haulEnd)
      }
    }
  }

  // ── Section B: Investment cards ──────────────────────────────────────────
  const paidBucketIds = new Set(zakatMovements.map((m) => m.cashBucketId))

  const investmentCards = sukukInvestments.map((inv) => {
    const maturity = inv.maturityDate ? new Date(inv.maturityDate as any) : null
    const isActive = !maturity || maturity > now

    const allocations = inv.bucketAllocations.map((a) => {
      const haul =
        (a.haulStartDate
          ? toIso(new Date(a.haulStartDate as any))
          : null) ||
        (a.cashBucket?.haulStartDate
          ? toIso(new Date(a.cashBucket.haulStartDate as any))
          : '')
      return {
        bucketId: a.cashBucket?.id || '',
        bucketLabel: a.cashBucket?.label || null,
        haulStartDate: haul,
        principalAllocated: Number(a.principalAllocated) || 0,
        principalRemaining: Number(a.principalRemaining) || 0,
      }
    })

    let meta: any = {}
    try { meta = inv.metadata ? JSON.parse(inv.metadata as string) : {} } catch {}

    return {
      id: inv.id,
      name: inv.name,
      principal: Number(inv.principalAmount) || 0,
      status: (isActive ? 'ACTIVE' : 'CLOSED') as 'ACTIVE' | 'CLOSED',
      maturityDate: toIso(inv.maturityDate as any),
      startDate: toIso(inv.startDate as any),
      savingsHaulStartDate: meta?.savingsHaulStartDate ? toIso(new Date(meta.savingsHaulStartDate)) : null,
      allocations,
      zakatEstimate: isActive ? 0 : allocations.reduce((s, a) => s + a.principalAllocated * ZAKAT_RATE, 0),
    }
  })

  // ── Section C: Timelines ─────────────────────────────────────────────────
  const timelines = cashBuckets
    .filter((b) => b.haulStartDate && Number(b.balance) > 0.01)
    .slice(0, 25)
    .map((b) => {
      const haulStart = new Date(b.haulStartDate as any)
      const haulEnd = new Date(haulStart.getTime() + HAWL_DAYS * 86400000)
      const totalMs = haulEnd.getTime() - haulStart.getTime()
      const elapsed = Math.min(now.getTime() - haulStart.getTime(), totalMs)
      const progressPct = Math.max(0, Math.min(100, (elapsed / totalMs) * 100))
      const remainingDays = Math.max(0, Math.ceil((haulEnd.getTime() - now.getTime()) / 86400000))
      const isPaid = paidBucketIds.has(b.id)

      return {
        id: b.id,
        label: b.label || 'General Cash',
        haulStart: toIso(haulStart),
        haulEnd: toIso(haulEnd),
        progressPct,
        remainingDays,
        status: (isPaid ? 'PAID' : now > haulEnd ? 'DUE' : 'UPCOMING') as 'PAID' | 'DUE' | 'UPCOMING',
        zakatAmount: Math.max(0, Number(b.balance)) * ZAKAT_RATE,
      }
    })

  // ── Section D: Warnings ──────────────────────────────────────────────────
  const warnings: Array<{
    id: string
    type: string
    message: string
    bucketId?: string
    bucketLabel?: string
    balance?: number
    debtId?: string
    debtAmount?: number
    allocations?: Array<{ investmentName: string; principalRemaining: number; investmentId: string }>
    investmentId?: string
    investmentName?: string
    metadata?: any
  }> = []

  for (const b of cashBuckets) {
    if (!b.haulStartDate) {
      warnings.push({
        id: `no-haul-${b.id}`,
        type: 'MISSING_HAUL_START',
        message: `Bucket missing haulStartDate — ${b.label || b.id.slice(0, 8)}`,
        bucketId: b.id,
        bucketLabel: b.label || 'Unnamed Bucket',
        balance: Number(b.balance || 0),
      })
    }
    if ((b as any).debt?.id) {
      const debt = (b as any).debt
      warnings.push({
        id: `debt-${b.id}`,
        type: 'DEBT_BUCKET_LEAKING',
        message: `Debt bucket leaking into zakat — ${b.label || b.id.slice(0, 8)}`,
        bucketId: b.id,
        bucketLabel: b.label || 'Unnamed Bucket',
        balance: Number(b.balance || 0),
        debtId: debt.id,
        debtAmount: Number(debt.amount || 0),
      })
    }
    const activeAllocs = b.allocations.filter((a) => Number(a.principalRemaining) > 0.01)
    if (activeAllocs.length > 1) {
      warnings.push({
        id: `dbl-${b.id}`,
        type: 'DOUBLE_COUNTING',
        message: `Possible double counting — "${b.label || b.id.slice(0, 8)}" allocated to ${activeAllocs.length} active investments`,
        bucketId: b.id,
        bucketLabel: b.label || 'Unnamed Bucket',
        balance: Number(b.balance || 0),
        allocations: activeAllocs.map((a) => ({
          investmentName: a.investment?.name || 'Unknown',
          principalRemaining: Number(a.principalRemaining || 0),
          investmentId: a.investment?.id || '',
        })),
      })
    }
  }

  for (const inv of sukukInvestments) {
    try {
      const meta = inv.metadata ? JSON.parse(inv.metadata as string) : {}
      const isRosca = inv.bucketAllocations.some((a) => {
        const lbl = a.cashBucket?.label || ''
        return lbl.startsWith('Savings Receipt •') || lbl.startsWith('Circlys Reward Receipt •')
      })
      if (isRosca && !meta?.savingsHaulStartDate) {
        const roscaBuckets = inv.bucketAllocations
          .filter((a) => {
            const lbl = a.cashBucket?.label || ''
            return lbl.startsWith('Savings Receipt •') || lbl.startsWith('Circlys Reward Receipt •')
          })
          .map((a) => a.cashBucket?.label || 'Unknown')
        warnings.push({
          id: `no-savings-haul-${inv.id}`,
          type: 'MISSING_SAVINGS_HAUL',
          message: `ROSCA funded Sukuk missing savingsHaulStartDate — ${inv.name}`,
          investmentId: inv.id,
          investmentName: inv.name,
          metadata: { roscaBuckets, currentMeta: meta },
        })
      }
    } catch {}
  }

  // ── Payments list ────────────────────────────────────────────────────────
  const payments = zakatMovements.map((m) => {
    const alloc = m.cashBucket?.allocations?.[0]
    return {
      id: m.id,
      amount: Math.abs(Number(m.amount)),
      date: toIso(m.date as any),
      notes: m.notes || null,
      bucketId: m.cashBucketId,
      bucketLabel: m.cashBucket?.label || null,
      bucketCurrency: m.cashBucket?.currency || 'SAR',
      personName: m.cashBucket?.person?.name || null,
      investmentName: alloc?.investment?.name || null,
      investmentType: alloc?.investment?.account?.type || null,
    }
  })

  return (
    <div className="min-h-screen bg-slate-950 p-4 sm:p-6 lg:p-8">
      <ZakatAuditClient
        displayCurrency={displayCurrency}
        wealthCash={wealthCash}
        wealthActiveSukuk={wealthActiveSukuk}
        wealthSavings={wealthSavings}
        wealthRewards={wealthRewards}
        wealthCrypto={wealthCrypto}
        zakatPaidThisYear={paidThisYear}
        nextDueDate={nextDueDate}
        investmentCards={investmentCards}
        timelines={timelines}
        warnings={warnings}
        payments={payments}
        totalPaid={totalPaid}
        paidThisYear={paidThisYear}
        isOwner={user.role === 'OWNER'}
      />
    </div>
  )
}
