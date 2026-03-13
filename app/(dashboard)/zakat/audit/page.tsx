import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { requireModuleAccess } from '@/lib/rbac'
import { DISPLAY_CURRENCY_KEY, normalizeDisplayCurrency } from '@/lib/currency'
import { redirect } from 'next/navigation'
import { ZakatAuditClient, type AuditInvestment } from '@/components/zakat/audit/ZakatAuditClient'
import { type Warning } from '@/components/zakat/audit/ReconciliationWarnings'

export const dynamic = 'force-dynamic'

const parseMetadata = (value: unknown) => {
  if (!value) return null
  if (typeof value === 'object') return value as any
  if (typeof value !== 'string') return null
  try { return JSON.parse(value) } catch { return null }
}

const toDate = (value?: string | Date | null) => {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  }
  const date = new Date(value as any)
  if (Number.isNaN(date.getTime())) return null
  return date
}

const isoDay = (d: Date) => {
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  return s.toISOString().split('T')[0]
}

const diffDaysFloor = (start: Date, end: Date) => {
  const ms = end.getTime() - start.getTime()
  if (ms <= 0) return 0
  return Math.floor(ms / (1000 * 60 * 60 * 24))
}

const addDays = (date: Date, days: number) => {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

type BucketRow = {
  id: string
  bucketId: string
  periodIndex: number
  label?: string | null
  currency: string
  balance: number
  haulStartDate: string
  lastZakatPaidDate?: string | null
  haulCompleteDate: string
  idleBase: number
  receiptsTotal: number
  zakatDue: number
  isPaid: boolean
  haulCompleted: boolean
  source: string
  sourceGroup: string
  sourceType: string
  rowKind?: 'PROFIT' | 'COMMISSION' | 'IDLE' | 'PRINCIPAL' | 'RECEIPT' | 'REWARD'
  why?: string | null
  lastPayment: null | { id: string; date: string; amount: number }
  dueReceipts: Array<{ date: string; amount: number; type: string; investmentName?: string | null }>
}

export default async function ZakatAuditPage() {
  await requireModuleAccess('zakat')
  const user = await getCurrentUser()

  if (!user) redirect('/login')
  if (user.role !== 'OWNER' && user.role !== 'PARTNER') redirect('/dashboard')

  const displayCurrencySetting = await prisma.systemSetting.findUnique({
    where: { key: DISPLAY_CURRENCY_KEY },
  })
  const displayCurrency = normalizeDisplayCurrency(displayCurrencySetting?.value)
  const now = new Date()

  const ownerPersonId = user.role === 'OWNER' ? (user.personId || null) : null
  const personScope = user.role === 'OWNER'
    ? (ownerPersonId
        ? { OR: [{ personId: ownerPersonId }, { personId: null }] }
        : { personId: null })
    : user.personId
      ? { personId: user.personId }
      : { personId: 'none' as string }

  const investmentScope = user.role === 'OWNER'
    ? {}
    : user.personId
      ? { dealParticipants: { some: { personId: user.personId } } }
      : { id: 'none' as string }

  // ━━━ PARALLEL DATA FETCH ━━━
  const [
    allBuckets,
    allBucketsIncludingExcluded,
    sukukInvestments,
    circlysInvestments,
    cryptoInvestments,
    zakatPaymentsThisYear,
    allZakatPayments,
    healthBuckets,
  ] = await Promise.all([
    // Active zakat buckets
    prisma.cashBucket.findMany({
      where: {
        excludeFromZakat: false,
        ...personScope,
      },
      include: {
        movements: { orderBy: { date: 'desc' as const } },
        allocations: {
          include: {
            investment: {
              select: { id: true, name: true, principalAmount: true, maturityDate: true, metadata: true, account: { select: { type: true } } },
            },
          },
        },
        debt: { select: { id: true } },
      },
    }),
    // ALL buckets (including excluded) for deep health checks
    prisma.cashBucket.findMany({
      where: personScope,
      select: {
        id: true, label: true, balance: true, haulStartDate: true,
        excludeFromZakat: true, personId: true,
        debt: { select: { id: true } },
        movements: { select: { type: true, amount: true, investmentId: true, notes: true }, take: 100 },
        allocations: {
          select: {
            principalAllocated: true, principalRemaining: true, haulStartDate: true,
            investmentId: true,
            investment: { select: { id: true, name: true, metadata: true, maturityDate: true, account: { select: { type: true } } } },
            cashBucket: { select: { label: true, haulStartDate: true } },
          },
        },
      },
    }),
    // Sukuk with full details
    prisma.investment.findMany({
      where: { account: { type: 'SUKUK' }, ...investmentScope },
      include: {
        account: { select: { type: true, currency: true } },
        transactions: {
          where: { type: { in: ['WITHDRAW_PROFIT', 'WITHDRAW_PRINCIPAL', 'CASH_INVEST', 'BUY_FROM_PARTNER'] } },
          orderBy: { date: 'desc' as const },
        },
        dealParticipants: { include: { person: { select: { name: true } } } },
        bucketAllocations: {
          include: { cashBucket: { select: { id: true, label: true, haulStartDate: true, balance: true } } },
        },
      },
    }),
    // Circlys/savings investments
    prisma.investment.findMany({
      where: { account: { type: 'CIRCLYS' }, ...investmentScope },
      select: { id: true, name: true, principalAmount: true, currentValue: true, startDate: true, metadata: true },
    }),
    // Crypto investments
    prisma.investment.findMany({
      where: { account: { type: 'CRYPTO' }, ...investmentScope },
      select: { id: true, currentValue: true },
    }),
    // Zakat payments this year
    prisma.cashBucketMovement.findMany({
      where: {
        type: 'ZAKAT_PAID',
        date: { gte: new Date(now.getFullYear(), 0, 1) },
      },
      select: { amount: true, date: true, cashBucketId: true, notes: true },
    }),
    // All-time zakat payments
    prisma.cashBucketMovement.findMany({
      where: { type: 'ZAKAT_PAID' },
      select: { amount: true, date: true, cashBucketId: true, notes: true },
    }),
    // Health check buckets — all non-excluded with debt info
    prisma.cashBucket.findMany({
      where: { excludeFromZakat: false },
      select: {
        id: true, label: true, haulStartDate: true, balance: true,
        debt: { select: { id: true } },
        allocations: {
          select: {
            principalRemaining: true, principalAllocated: true,
            investment: { select: { id: true, name: true, metadata: true, maturityDate: true, account: { select: { type: true } } } },
          },
        },
      },
    }),
  ])

  // ━━━ SECTION 1: WEALTH & SUMMARY CALCULATIONS ━━━
  const cashWealth = allBuckets.reduce((sum, b) => sum + Math.max(0, Number(b.balance) || 0), 0)

  const sukukWealth = sukukInvestments.reduce((sum, inv) => {
    const principal = Math.max(0, Number(inv.principalAmount) || 0)
    const receivable = Math.max(0, Number(inv.receivableAmount) || 0)
    return sum + principal + receivable
  }, 0)

  const savingsWealth = circlysInvestments.reduce((sum, inv) => {
    return sum + Math.max(0, Number(inv.currentValue) || Number(inv.principalAmount) || 0)
  }, 0)

  const cryptoWealth = cryptoInvestments.reduce((sum, inv) => sum + Math.max(0, Number(inv.currentValue) || 0), 0)

  const totalWealth = cashWealth + sukukWealth + savingsWealth + cryptoWealth
  const totalPaidThisYear = zakatPaymentsThisYear.reduce((s, p) => s + Math.abs(Number(p.amount) || 0), 0)

  // ━━━ BUILD BUCKET ROWS (simplified from main zakat page for audit view) ━━━
  const bucketRows: BucketRow[] = allBuckets.flatMap((bucket): BucketRow[] => {
    const balance = Math.max(0, Number(bucket.balance) || 0)
    if (balance <= 0.01) return []

    const haulStart = toDate(bucket.haulStartDate)
    if (!haulStart || Number.isNaN(haulStart.getTime())) return []

    const movements = Array.isArray(bucket.movements) ? bucket.movements : []
    const payments = movements.filter((m: any) => m.type === 'ZAKAT_PAID')
    const lastPaymentRaw = payments[0]
    const lastPayment = lastPaymentRaw ? {
      id: lastPaymentRaw.id,
      date: new Date(lastPaymentRaw.date).toISOString().split('T')[0],
      amount: Math.abs(Number(lastPaymentRaw.amount || 0)),
    } : null

    const label = typeof bucket.label === 'string' ? bucket.label : ''
    const isDebt = !!(bucket as any).debt?.id
    if (isDebt) return []

    // Determine source info
    const isProfitBucket = label.startsWith('Profit •') || label.startsWith('Profit \u2022')
    const isCommissionBucket = label === 'Partner Commission'
    const isRewardBucket = label.startsWith('Circlys Reward Receipt •')
    const isSavingsReceipt = label.startsWith('Savings Receipt •')

    const sourceType = isProfitBucket ? 'SUKUK'
      : isCommissionBucket ? 'COMMISSION'
      : isRewardBucket ? 'CIRCLYS'
      : isSavingsReceipt ? 'CIRCLYS'
      : 'CASH'

    const source = label || 'General Cash'
    const sourceGroup = source

    // Generate hawl cycle rows
    const startDay = new Date(haulStart.getFullYear(), haulStart.getMonth(), haulStart.getDate())
    const elapsed = diffDaysFloor(startDay, now)
    const completedCycles = Math.floor(elapsed / 354)
    const rows: BucketRow[] = []

    for (let i = 0; i < Math.max(1, completedCycles + 1); i++) {
      const periodStart = addDays(startDay, i * 354)
      const periodEnd = addDays(startDay, (i + 1) * 354)
      const haulCompleted = now.getTime() >= periodEnd.getTime()

      if (i >= completedCycles && !haulCompleted) {
        // Upcoming cycle — show it but no zakat due yet
        rows.push({
          id: `audit|${bucket.id}|${i}`,
          bucketId: bucket.id,
          periodIndex: i,
          label: `${source} • ${isoDay(periodStart)} → ${isoDay(periodEnd)}`,
          currency: (bucket as any).currency || 'SAR',
          balance,
          haulStartDate: isoDay(periodStart),
          lastZakatPaidDate: bucket.lastZakatPaidDate ? new Date(bucket.lastZakatPaidDate).toISOString().split('T')[0] : null,
          haulCompleteDate: isoDay(periodEnd),
          idleBase: balance,
          receiptsTotal: 0,
          zakatDue: 0,
          isPaid: false,
          haulCompleted: false,
          source,
          sourceGroup,
          sourceType,
          rowKind: isProfitBucket ? 'PROFIT' : isCommissionBucket ? 'COMMISSION' : isRewardBucket ? 'REWARD' : isSavingsReceipt ? 'RECEIPT' : 'IDLE',
          why: `Hawl cycle ${i + 1}: ${isoDay(periodStart)} to ${isoDay(periodEnd)} — in progress`,
          lastPayment,
          dueReceipts: [],
        })
        continue
      }

      // Check if this period was paid
      const rowKey = `audit|${bucket.id}|${i}`
      const isPaid = payments.some((p: any) => {
        const notes = typeof p?.notes === 'string' ? p.notes : ''
        return notes.includes(`ZAKAT_ROW=${rowKey}`)
      })

      const zakatDue = !isPaid ? balance * 0.025 : 0

      rows.push({
        id: rowKey,
        bucketId: bucket.id,
        periodIndex: i,
        label: `${source} • ${isoDay(periodStart)} → ${isoDay(periodEnd)}`,
        currency: (bucket as any).currency || 'SAR',
        balance,
        haulStartDate: isoDay(periodStart),
        lastZakatPaidDate: bucket.lastZakatPaidDate ? new Date(bucket.lastZakatPaidDate).toISOString().split('T')[0] : null,
        haulCompleteDate: isoDay(periodEnd),
        idleBase: balance,
        receiptsTotal: 0,
        zakatDue,
        isPaid,
        haulCompleted: true,
        source,
        sourceGroup,
        sourceType,
        rowKind: isProfitBucket ? 'PROFIT' : isCommissionBucket ? 'COMMISSION' : isRewardBucket ? 'REWARD' : isSavingsReceipt ? 'RECEIPT' : 'IDLE',
        why: `Hawl cycle ${i + 1}: ${isoDay(periodStart)} to ${isoDay(periodEnd)} — ${isPaid ? 'paid' : 'due'}. Balance: ${balance.toFixed(2)}, Zakat at 2.5%: ${zakatDue.toFixed(2)}`,
        lastPayment,
        dueReceipts: [],
      })
    }

    return rows
  })

  // Sort by hawl start date
  bucketRows.sort((a, b) => {
    const aTime = new Date(a.haulStartDate).getTime()
    const bTime = new Date(b.haulStartDate).getTime()
    return aTime - bTime
  })

  const totalDue = bucketRows.reduce((s, r) => s + (r.isPaid ? 0 : Math.max(0, r.zakatDue)), 0)

  // ━━━ SECTION 4: DEEP RECONCILIATION WARNINGS ━━━
  const warnings: Warning[] = []

  // CHECK 1: Buckets missing haulStartDate
  for (const b of healthBuckets) {
    if (!b.haulStartDate || isNaN(new Date(b.haulStartDate as any).getTime())) {
      const earliestMovement = allBucketsIncludingExcluded.find(ab => ab.id === b.id)
        ?.movements?.filter((m: any) => m.type === 'CASH_IN')
        ?.map((m: any) => new Date(m.date || m.createdAt))
        ?.filter((d: Date) => !isNaN(d.getTime()))
        ?.sort((a: Date, b: Date) => a.getTime() - b.getTime())[0]

      warnings.push({
        id: `missing-haul-${b.id}`,
        type: 'MISSING_HAUL_START',
        severity: 'error',
        title: 'Bucket Missing Hawl Start Date',
        description: `Cash bucket "${b.label || b.id.slice(0, 8)}" has no haulStartDate set. Zakat cannot be calculated for this money.`,
        bucketId: b.id,
        bucketLabel: b.label || undefined,
        fixable: true,
        fixAction: 'SET_HAUL_START',
        fixDescription: earliestMovement
          ? `Auto-fix will set haulStartDate to the earliest CASH_IN movement date (${isoDay(earliestMovement)}). This assumes the money has been held since that date.`
          : 'Auto-fix will set haulStartDate to today. You should manually correct this to the actual date the money was first received.',
        fixPayload: earliestMovement ? { haulStartDate: isoDay(earliestMovement) } : undefined,
        details: `Bucket balance: ${Number(b.balance || 0).toFixed(2)}. Without a hawl start date, the system cannot determine when this money completes a lunar year cycle.`,
      })
    }
  }

  // CHECK 2: Debt buckets leaking into zakat
  for (const b of healthBuckets) {
    if ((b as any).debt?.id) {
      warnings.push({
        id: `debt-bucket-${b.id}`,
        type: 'DEBT_IN_ZAKAT',
        severity: 'error',
        title: 'Debt Bucket in Zakat Calculations',
        description: `Bucket "${b.label || b.id.slice(0, 8)}" is linked to a debt but not excluded from zakat. Debt money should not be zakatable.`,
        bucketId: b.id,
        bucketLabel: b.label || undefined,
        fixable: true,
        fixAction: 'EXCLUDE_BUCKET',
        fixDescription: 'Auto-fix will mark this bucket as excluded from zakat calculations. Debt-linked buckets represent money owed, not owned.',
        details: `This bucket has balance ${Number(b.balance || 0).toFixed(2)} and is linked to a debt. Islamic scholars agree that money owed to others should not count toward zakatable wealth.`,
      })
    }
  }

  // CHECK 3: ROSCA funded Sukuk missing savingsHaulStartDate
  for (const inv of sukukInvestments) {
    const isRoscaFunded = inv.bucketAllocations?.some((a: any) => {
      const label = a.cashBucket?.label || ''
      return label.startsWith('Savings Receipt •') || label.startsWith('Circlys Reward Receipt •')
    })

    if (isRoscaFunded) {
      const meta = parseMetadata(inv.metadata)
      if (!meta?.savingsHaulStartDate) {
        const firstAllocation = inv.bucketAllocations
          ?.filter((a: any) => {
            const label = a.cashBucket?.label || ''
            return label.startsWith('Savings Receipt •') || label.startsWith('Circlys Reward Receipt •')
          })
          ?.sort((a: any, b: any) => {
            const aDate = toDate(a.cashBucket?.haulStartDate)?.getTime() || Infinity
            const bDate = toDate(b.cashBucket?.haulStartDate)?.getTime() || Infinity
            return aDate - bDate
          })[0]

        const suggestedDate = firstAllocation?.cashBucket?.haulStartDate
          ? isoDay(new Date(firstAllocation.cashBucket.haulStartDate))
          : null

        warnings.push({
          id: `missing-savings-haul-${inv.id}`,
          type: 'MISSING_SAVINGS_HAUL',
          severity: 'warning',
          title: 'ROSCA Funded Sukuk Missing Continuity Anchor',
          description: `Sukuk "${inv.name}" was funded from ROSCA savings but has no savingsHaulStartDate in metadata. Hawl continuity will be broken.`,
          investmentId: inv.id,
          investmentName: inv.name,
          fixable: !!suggestedDate,
          fixAction: suggestedDate ? 'SET_SAVINGS_HAUL' : undefined,
          fixDescription: suggestedDate
            ? `Auto-fix will set savingsHaulStartDate to ${suggestedDate} (from the funding bucket's hawl date). This preserves hawl continuity from savings → sukuk.`
            : 'Cannot auto-fix: no funding bucket hawl date found. Manually set savingsHaulStartDate in the investment metadata.',
          fixPayload: suggestedDate ? { ...(meta || {}), savingsHaulStartDate: suggestedDate } : undefined,
          details: `This Sukuk was funded from ROSCA buckets (${inv.bucketAllocations?.map((a: any) => a.cashBucket?.label).filter(Boolean).join(', ')}). Without savingsHaulStartDate, principal receipt rows will fall back to the investment start date instead of maintaining continuity from the savings contribution.`,
        })
      }
    }
  }

  // CHECK 4: Double counting — same bucket allocated to multiple active investments
  for (const b of healthBuckets) {
    const activeAllocs = b.allocations.filter((a: any) => Number(a.principalRemaining) > 0.01)
    if (activeAllocs.length > 1) {
      const investmentNames = activeAllocs.map((a: any) => a.investment?.name || 'Unknown').join(', ')
      warnings.push({
        id: `double-count-${b.id}`,
        type: 'DOUBLE_COUNTING',
        severity: 'error',
        title: 'Possible Double Counting Detected',
        description: `Bucket "${b.label || b.id.slice(0, 8)}" is allocated to ${activeAllocs.length} active investments. The same money may be counted multiple times.`,
        bucketId: b.id,
        bucketLabel: b.label || undefined,
        fixable: false,
        fixDescription: `Review the allocations for this bucket. Investments: ${investmentNames}. Ensure each allocation represents distinct money, not the same funds counted twice.`,
        details: `Active allocations: ${activeAllocs.map((a: any) => `${a.investment?.name}: ${Number(a.principalRemaining || 0).toFixed(2)}`).join('; ')}. Total allocated: ${activeAllocs.reduce((s: number, a: any) => s + Number(a.principalRemaining || 0), 0).toFixed(2)}, bucket balance: ${Number(b.balance || 0).toFixed(2)}.`,
      })
    }
  }

  // CHECK 5: Hawl date jumped backwards
  for (const b of healthBuckets) {
    const bucketHaulTime = b.haulStartDate ? new Date(b.haulStartDate as any).getTime() : null
    if (!bucketHaulTime) continue

    for (const alloc of b.allocations) {
      if (alloc.investment?.account?.type !== 'SUKUK') continue
      const meta = parseMetadata(alloc.investment.metadata)
      const savedHaul = meta?.savingsHaulStartDate ? new Date(meta.savingsHaulStartDate).getTime() : null
      if (savedHaul && savedHaul < bucketHaulTime - 86400000 * 30) {
        warnings.push({
          id: `hawl-backwards-${b.id}-${alloc.investment.id}`,
          type: 'HAWL_JUMPED_BACKWARDS',
          severity: 'warning',
          title: 'Hawl Clock Jumped Backwards',
          description: `Investment "${alloc.investment.name}" has savingsHaulStartDate earlier than its funding bucket "${b.label || b.id.slice(0, 8)}". This suggests a continuity error.`,
          bucketId: b.id,
          bucketLabel: b.label || undefined,
          investmentId: alloc.investment.id,
          investmentName: alloc.investment.name,
          fixable: false,
          fixDescription: `The investment's savingsHaulStartDate (${meta.savingsHaulStartDate}) is more than 30 days before the funding bucket's haulStartDate (${b.haulStartDate ? new Date(b.haulStartDate as any).toISOString().split('T')[0] : '?'}). Check if the continuity anchor was set incorrectly. Normally the investment anchor should be >= the bucket anchor.`,
          details: `Bucket haulStartDate: ${b.haulStartDate ? new Date(b.haulStartDate as any).toISOString().split('T')[0] : 'missing'}, Investment savingsHaulStartDate: ${meta.savingsHaulStartDate}. Gap: ${Math.abs(Math.round((bucketHaulTime - savedHaul) / 86400000))} days.`,
        })
      }
    }
  }

  // CHECK 6: Zakat amount mismatch (not equal to balance × 2.5%)
  for (const row of bucketRows) {
    if (!row.haulCompleted || row.isPaid) continue
    const expectedZakat = (row.idleBase + row.receiptsTotal) * 0.025
    if (Math.abs(row.zakatDue - expectedZakat) > 0.01 && row.zakatDue > 0) {
      warnings.push({
        id: `zakat-mismatch-${row.id}`,
        type: 'ZAKAT_MISMATCH',
        severity: 'info',
        title: 'Zakat Amount Verification',
        description: `Row "${row.label || row.source}" has zakat ${row.zakatDue.toFixed(2)} but expected ${expectedZakat.toFixed(2)} (balance × 2.5%).`,
        bucketId: row.bucketId,
        fixable: false,
        fixDescription: `The difference of ${Math.abs(row.zakatDue - expectedZakat).toFixed(2)} may be due to withdrawals or outflows that reduced the taxable base during the hawl period.`,
        details: `Idle base: ${row.idleBase.toFixed(2)}, Receipts: ${row.receiptsTotal.toFixed(2)}, Computed zakat: ${row.zakatDue.toFixed(2)}, Expected (simple): ${expectedZakat.toFixed(2)}.`,
      })
    }
  }

  // CHECK 7: Active Sukuk appearing in due rows
  for (const inv of sukukInvestments) {
    const maturity = inv.maturityDate ? new Date(inv.maturityDate) : null
    const isActive = !maturity || maturity > now
    if (!isActive) continue

    const hasAllocatedPrincipal = inv.bucketAllocations?.some((a: any) => Number(a.principalRemaining) > 0.01)
    if (!hasAllocatedPrincipal) continue

    const hasDueRows = bucketRows.some(r =>
      r.rowKind === 'PRINCIPAL' &&
      r.zakatDue > 0 &&
      !r.isPaid &&
      r.source === inv.name
    )

    if (hasDueRows) {
      warnings.push({
        id: `active-sukuk-due-${inv.id}`,
        type: 'ACTIVE_SUKUK_IN_DUE',
        severity: 'warning',
        title: 'Active Sukuk Has Due Zakat Rows',
        description: `Sukuk "${inv.name}" is still active (matures ${maturity ? isoDay(maturity) : 'unknown'}) but has principal zakat rows showing as due. Active Sukuk principal is typically not zakatable until maturity.`,
        investmentId: inv.id,
        investmentName: inv.name,
        fixable: false,
        fixDescription: 'Review whether this Sukuk\'s principal should appear in zakat rows while still active. If ROSCA-funded, only the idle savings portion should be zakatable before maturity.',
        details: `Principal: ${Number(inv.principalAmount || 0).toFixed(2)}, Maturity: ${maturity ? isoDay(maturity) : 'not set'}, Active allocations: ${inv.bucketAllocations?.filter((a: any) => Number(a.principalRemaining) > 0.01).length || 0}.`,
      })
    }
  }

  // CHECK 8: Monthly contribution buckets not excluded
  for (const b of allBucketsIncludingExcluded) {
    const label = b.label || ''
    const isContribution = label.startsWith('Circlys •') && !label.includes('Receipt') && !label.includes('Reward')
    if (isContribution && !b.excludeFromZakat) {
      warnings.push({
        id: `contribution-not-excluded-${b.id}`,
        type: 'CONTRIBUTION_NOT_EXCLUDED',
        severity: 'error',
        title: 'Monthly Contribution Bucket Not Excluded',
        description: `Savings contribution bucket "${b.label}" is not excluded from zakat. These represent money being saved, which should not be double-counted.`,
        bucketId: b.id,
        bucketLabel: b.label || undefined,
        fixable: true,
        fixAction: 'EXCLUDE_BUCKET',
        fixDescription: 'Auto-fix will mark this bucket as excluded from zakat. Monthly contribution buckets represent savings installments — the receipt bucket (created when savings mature) is the correct source for zakat.',
        details: `Balance: ${Number(b.balance || 0).toFixed(2)}. Monthly contributions are excluded because they will be captured as a single Savings Receipt or Reward Receipt when the plan matures.`,
      })
    }
  }

  // CHECK 9: Negative bucket balance
  for (const b of healthBuckets) {
    const balance = Number(b.balance || 0)
    if (balance < -0.01) {
      warnings.push({
        id: `negative-balance-${b.id}`,
        type: 'BUCKET_NEGATIVE_BALANCE',
        severity: 'warning',
        title: 'Bucket Has Negative Balance',
        description: `Bucket "${b.label || b.id.slice(0, 8)}" has a negative balance of ${balance.toFixed(2)}. This may indicate a processing error.`,
        bucketId: b.id,
        bucketLabel: b.label || undefined,
        fixable: false,
        fixDescription: 'Review the bucket movements to find the cause of the negative balance. This often happens when a withdrawal exceeds the bucket balance, or when movements are processed out of order.',
        details: `Current balance: ${balance.toFixed(2)}. Negative balances should not exist in the zakat system as they represent phantom money.`,
      })
    }
  }

  // Sort warnings: errors first, then warnings, then info
  warnings.sort((a, b) => {
    const order = { error: 0, warning: 1, info: 2 }
    return order[a.severity] - order[b.severity]
  })

  // ━━━ SECTION 2: BUILD INVESTMENT BREAKDOWN ━━━
  const auditInvestments: AuditInvestment[] = sukukInvestments.map(inv => {
    const fundingSources = (inv.bucketAllocations || [])
      .filter((a: any) => Number(a.principalAllocated || a.principalRemaining) > 0.01)
      .map((a: any) => ({
        bucketLabel: a.cashBucket?.label || 'Direct Cash',
        amount: Number(a.principalAllocated || a.principalRemaining || 0),
        haulDate: a.cashBucket?.haulStartDate
          ? new Date(a.cashBucket.haulStartDate).toISOString().split('T')[0]
          : '—',
        bucketId: a.cashBucket?.id || undefined,
      }))

    const maturity = inv.maturityDate ? new Date(inv.maturityDate) : null
    const isActive = !maturity || Number.isNaN(maturity.getTime()) || maturity > now
    const isMature = !!maturity && !Number.isNaN(maturity.getTime()) && maturity <= now

    return {
      id: inv.id,
      name: inv.name,
      principalAmount: Math.max(0, Number(inv.principalAmount) || 0),
      currentValue: Math.max(0, Number(inv.currentValue) || Number(inv.principalAmount) || 0),
      maturityDate: maturity && !Number.isNaN(maturity.getTime()) ? isoDay(maturity) : null,
      isActive,
      isMature,
      accountType: 'SUKUK',
      fundingSources,
    }
  })

  // ━━━ RENDER ━━━
  return (
    <div className="space-y-6" style={{ background: 'linear-gradient(to bottom, #0a1628, #0d1b2a)' }}>
      <div className="bg-gradient-to-r from-[#0a1628] to-[#0d1b2a] rounded-xl shadow-md p-6 border border-slate-700/40">
        <div className="flex items-center gap-3 mb-1">
          <span className="text-2xl">🕌</span>
          <h1 className="text-2xl font-bold text-slate-100">Zakat Audit & Verification</h1>
        </div>
        <p className="text-sm text-slate-400">
          Complete audit of all zakat calculations, hawl timelines, reconciliation checks, and system health verification.
        </p>
      </div>

      <ZakatAuditClient
        rows={bucketRows}
        investments={auditInvestments}
        warnings={warnings}
        totalWealth={totalWealth}
        totalPaidThisYear={totalPaidThisYear}
        displayCurrency={displayCurrency}
      />
    </div>
  )
}
