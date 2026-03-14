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
    // Active zakat buckets (exact same logic as main zakat page)
    prisma.cashBucket.findMany({
      where: {
        AND: [
          {
            OR: [
              { excludeFromZakat: false },
              // Always include ROSCA receipt buckets regardless of excludeFromZakat flag
              // because they need to show hawl 1 completed row even after full investment
              { label: { startsWith: 'Savings Receipt •' } },
              { label: { startsWith: 'Circlys Reward Receipt •' } },
            ],
          },
          ...(user.role === 'OWNER'
            ? [
                {
                  OR: [
                    { personId: null },
                    { personId: ownerPersonId },
                  ],
                },
              ]
            : [
                {
                  personId: user.personId,
                  OR: [
                    { label: null },
                    {
                      AND: [
                        { NOT: { label: 'Partner Commission' } },
                        { NOT: { label: { startsWith: 'Debt •' } } },
                        { NOT: { label: { startsWith: 'Debt Refund •' } } },
                      ],
                    },
                  ],
                },
              ]),
        ],
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
    // Zakat payments this year (scoped to current user's buckets)
    prisma.cashBucketMovement.findMany({
      where: {
        type: 'ZAKAT_PAID',
        date: { gte: new Date(now.getFullYear(), 0, 1) },
        cashBucket: { is: personScope },
      },
      select: { amount: true, date: true, cashBucketId: true, notes: true },
    }),
    // All-time zakat payments (scoped to current user's buckets)
    prisma.cashBucketMovement.findMany({
      where: { type: 'ZAKAT_PAID', cashBucket: { is: personScope } },
      select: { amount: true, date: true, cashBucketId: true, notes: true },
    }),
    // Health check buckets — all non-excluded with debt info (scoped to current user)
    prisma.cashBucket.findMany({
      where: { 
        excludeFromZakat: false, 
        debt: null, // Exclude debt buckets from health checks
        ...personScope 
      },
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

  // ━━━ Helper: check if any ZAKAT_PAID movement marks a given row key as paid ━━━
  const movementHasRowPaid = (payments: any[], rowKey: string) => {
    return payments.some((p: any) => {
      const notes = typeof p?.notes === 'string' ? p.notes : ''
      return notes.includes(`ZAKAT_ROW=${rowKey}`)
    })
  }

  // Helper: check if bucket has ANY zakat payment covering a period (fallback match)
  const hasAnyPaymentInPeriod = (payments: any[], periodStart: Date, periodEnd: Date) => {
    return payments.some((p: any) => {
      const pDate = new Date(p.date)
      if (isNaN(pDate.getTime())) return false
      return pDate.getTime() >= periodStart.getTime() && pDate.getTime() <= addDays(periodEnd, 90).getTime()
    })
  }

  // Helper: calculate hawl outflow barriers (money withdrawn during hawl reduces zakat base)
  const calculateHawlOutflows = (movements: any[], haulStart: Date, haulEnd: Date) => {
    const hawlOutflowTypes = new Set(['CASH_OUT', 'INVEST_OUT', 'WITHDRAW_PRINCIPAL', 'WITHDRAW_PROFIT', 'TRANSFER_OUT'])
    
    return movements
      .map((m: any) => {
        const movementType = typeof m?.type === 'string' ? m.type : ''
        if (!hawlOutflowTypes.has(movementType)) return null

        const mDate = new Date(m.date)
        if (isNaN(mDate.getTime())) return null
        if (mDate.getTime() < haulStart.getTime() || mDate.getTime() > haulEnd.getTime()) return null

        const amount = Math.abs(Number(m?.amount) || 0)
        if (amount <= 0) return null

        return { time: mDate.getTime(), amount, type: movementType }
      })
      .filter((x: any): x is { time: number; amount: number; type: string } => Boolean(x))
      .reduce((sum, evt) => sum + evt.amount, 0)
  }

  // Helper: calculate proper zakat base accounting for outflows
  const calculateZakatBase = (balance: number, movements: any[], haulStart: Date, haulEnd: Date) => {
    const outflows = calculateHawlOutflows(movements, haulStart, haulEnd)
    // If money was withdrawn during hawl, it reduces the zakatable base
    // But never go below current balance
    return Math.max(balance, balance + outflows * 0.5) // Conservative 50% reduction for outflows
  }

  // ━━━ BUILD BUCKET ROWS (mirrors main zakat page logic) ━━━
  const bucketRows: BucketRow[] = allBuckets.flatMap((bucket): BucketRow[] => {
    const balance = Math.max(0, Number(bucket.balance) || 0)
    if (balance <= 0.01) return []

    const haulStart = toDate(bucket.haulStartDate)
    if (!haulStart || Number.isNaN(haulStart.getTime())) return []

    const movements = Array.isArray(bucket.movements) ? bucket.movements : []
    const payments = movements
      .filter((m: any) => m.type === 'ZAKAT_PAID')
      .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
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

    const rowKind: BucketRow['rowKind'] = isProfitBucket ? 'PROFIT'
      : isCommissionBucket ? 'COMMISSION'
      : isRewardBucket ? 'REWARD'
      : isSavingsReceipt ? 'RECEIPT'
      : 'IDLE'

    const source = label || 'General Cash'
    const sourceGroup = source

    // For receipt/reward buckets, check if the main zakat page would generate
    // a ROSCA_RECEIPT first-hawl row
    if (isRewardBucket || isSavingsReceipt) {
      const firstRowKey = `ROSCA_RECEIPT|${isRewardBucket ? 'REWARD' : 'SAVINGS'}|${bucket.id}`
      const isPaid = movementHasRowPaid(payments, firstRowKey)
      const startDay = new Date(haulStart.getFullYear(), haulStart.getMonth(), haulStart.getDate())
      const periodEnd = addDays(startDay, 354)
      const haulCompleted = now.getTime() >= periodEnd.getTime()
      const zakatBase = calculateZakatBase(balance, movements, startDay, periodEnd)
      const zakatDue = !isPaid && haulCompleted ? zakatBase * 0.025 : 0

      const rows: BucketRow[] = [{
        id: firstRowKey,
        bucketId: bucket.id,
        periodIndex: 0,
        label: source,
        currency: (bucket as any).currency || 'SAR',
        balance,
        haulStartDate: isoDay(startDay),
        lastZakatPaidDate: bucket.lastZakatPaidDate ? new Date(bucket.lastZakatPaidDate).toISOString().split('T')[0] : null,
        haulCompleteDate: isoDay(periodEnd),
        idleBase: 0,
        receiptsTotal: balance,
        zakatDue,
        isPaid,
        haulCompleted,
        source,
        sourceGroup,
        sourceType,
        rowKind,
        why: haulCompleted
          ? `Receipt hawl completed: ${isoDay(startDay)} to ${isoDay(periodEnd)}. Balance: ${balance.toFixed(2)}, Zakat at 2.5%: ${zakatDue.toFixed(2)}`
          : `Receipt hawl in progress: ${isoDay(startDay)} to ${isoDay(periodEnd)}. Projected zakat: ${(balance * 0.025).toFixed(2)}`,
        lastPayment,
        dueReceipts: [],
      }]

      // Also generate subsequent idle cycles if hawl 1 is completed
      if (haulCompleted) {
        const elapsed = diffDaysFloor(startDay, now)
        const completedCycles = Math.floor(elapsed / 354)
        for (let i = 1; i <= completedCycles; i++) {
          const pStart = addDays(startDay, i * 354)
          const pEnd = addDays(startDay, (i + 1) * 354)
          const cycleCompleted = now.getTime() >= pEnd.getTime()
          const rowKey = `SAVINGS_IDLE|${bucket.id}|${isoDay(pStart)}|${isoDay(pEnd)}`
          const cyclePaid = movementHasRowPaid(payments, rowKey)
          const cycleZakatBase = calculateZakatBase(balance, movements, pStart, pEnd)
          const cycleZakat = !cyclePaid && cycleCompleted ? cycleZakatBase * 0.025 : 0

          rows.push({
            id: rowKey,
            bucketId: bucket.id,
            periodIndex: i,
            label: `${source} • Cycle ${i + 1}`,
            currency: (bucket as any).currency || 'SAR',
            balance,
            haulStartDate: isoDay(pStart),
            lastZakatPaidDate: bucket.lastZakatPaidDate ? new Date(bucket.lastZakatPaidDate).toISOString().split('T')[0] : null,
            haulCompleteDate: isoDay(pEnd),
            idleBase: balance,
            receiptsTotal: 0,
            zakatDue: cycleZakat,
            isPaid: cyclePaid,
            haulCompleted: cycleCompleted,
            source,
            sourceGroup,
            sourceType,
            rowKind: 'IDLE',
            why: cycleCompleted
              ? `Idle cycle ${i + 1}: ${isoDay(pStart)} to ${isoDay(pEnd)} — ${cyclePaid ? 'paid' : 'due'}`
              : `Idle cycle ${i + 1}: ${isoDay(pStart)} to ${isoDay(pEnd)} — upcoming`,
            lastPayment,
            dueReceipts: [],
          })
        }
      }

      return rows
    }

    // Generate hawl cycle rows for general cash / profit / commission buckets
    const startDay = new Date(haulStart.getFullYear(), haulStart.getMonth(), haulStart.getDate())
    const elapsed = diffDaysFloor(startDay, now)
    const completedCycles = Math.floor(elapsed / 354)
    const rows: BucketRow[] = []

    for (let i = 0; i < Math.max(1, completedCycles + 1); i++) {
      const periodStart = addDays(startDay, i * 354)
      const periodEnd = addDays(startDay, (i + 1) * 354)
      const haulCompleted = now.getTime() >= periodEnd.getTime()

      // Try multiple row key formats used by the main zakat page
      const depositRowKey = `DEPOSIT|${bucket.id}|${isoDay(periodStart)}|${isoDay(periodEnd)}`
      const idleRowKey = `IDLE|${bucket.id}|${isoDay(periodStart)}|${isoDay(periodEnd)}`
      const auditRowKey = `audit|${bucket.id}|${i}`

      const isPaid = movementHasRowPaid(payments, depositRowKey) ||
                     movementHasRowPaid(payments, idleRowKey) ||
                     movementHasRowPaid(payments, auditRowKey) ||
                     (haulCompleted && hasAnyPaymentInPeriod(payments, periodStart, periodEnd))

      // For completed cycles, use proper zakat base calculation. For upcoming, show projected amount
      const zakatBase = haulCompleted ? calculateZakatBase(balance, movements, periodStart, periodEnd) : balance
      const zakatDue = isPaid ? 0 : zakatBase * 0.025

      if (!haulCompleted) {
        // Upcoming cycle — show projected zakat
        rows.push({
          id: depositRowKey,
          bucketId: bucket.id,
          periodIndex: i,
          label: source,
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
          rowKind,
          why: `Hawl cycle ${i + 1}: ${isoDay(periodStart)} to ${isoDay(periodEnd)} — in progress. Projected zakat: ${(balance * 0.025).toFixed(2)}`,
          lastPayment,
          dueReceipts: [],
        })
        continue
      }

      rows.push({
        id: depositRowKey,
        bucketId: bucket.id,
        periodIndex: i,
        label: source,
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
        rowKind,
        why: `Hawl cycle ${i + 1}: ${isoDay(periodStart)} to ${isoDay(periodEnd)} — ${isPaid ? 'paid' : 'due'}. Balance: ${balance.toFixed(2)}, Zakat at 2.5%: ${zakatDue.toFixed(2)}`,
        lastPayment,
        dueReceipts: [],
      })
    }

    return rows
  })

  // ━━━ ADD SUKUK INVESTMENT ROWS FROM ALLOCATIONS ━━━
  for (const inv of sukukInvestments) {
    const meta = parseMetadata(inv.metadata)
    const maturity = inv.maturityDate ? new Date(inv.maturityDate) : null
    const isDealClosed = !!maturity && !isNaN(maturity.getTime()) && maturity <= now

    for (const alloc of (inv.bucketAllocations || [])) {
      const principalRemaining = Number(alloc.principalRemaining || 0)
      if (principalRemaining <= 0.01) continue

      const sourceBucket = alloc.cashBucket
      const bucketLabel = sourceBucket?.label || ''
      const isRoscaFunded = bucketLabel.startsWith('Savings Receipt •') || bucketLabel.startsWith('Circlys Reward Receipt •')

      if (isRoscaFunded) {
        // ROSCA Sukuk principal continuity rows
        const savedHaulStr = meta?.savingsHaulStartDate as string | undefined
        const continuityAnchor = toDate(savedHaulStr) || toDate(sourceBucket?.haulStartDate) || toDate(inv.startDate)
        if (!continuityAnchor) continue

        const continuityStart = new Date(continuityAnchor.getFullYear(), continuityAnchor.getMonth(), continuityAnchor.getDate())
        const elapsed = diffDaysFloor(continuityStart, now)
        const completedCycles = Math.floor(elapsed / 354)

        // Find ALL zakat payments on the source bucket to check isPaid
        const sourceBucketFull = allBuckets.find(b => b.id === sourceBucket?.id)
        const sourcePayments = sourceBucketFull
          ? (Array.isArray(sourceBucketFull.movements) ? sourceBucketFull.movements : [])
              .filter((m: any) => m.type === 'ZAKAT_PAID')
          : []

        for (let i = 0; i < Math.max(1, completedCycles + 1); i++) {
          const periodStart = addDays(continuityStart, i * 354)
          const periodEnd = addDays(continuityStart, (i + 1) * 354)
          const haulCompleted = now.getTime() >= periodEnd.getTime()

          const rowKey = `ROSCA_SUKUK_PRINCIPAL|${sourceBucket?.id || ''}|${inv.id}|${isoDay(periodStart)}|${isoDay(periodEnd)}`
          const isPaid = movementHasRowPaid(sourcePayments, rowKey)
          const sourceBucketMovements = sourceBucketFull ? (Array.isArray(sourceBucketFull.movements) ? sourceBucketFull.movements : []) : []
          const zakatBase = haulCompleted && isDealClosed ? calculateZakatBase(principalRemaining, sourceBucketMovements, periodStart, periodEnd) : principalRemaining
          const zakatDue = !isPaid && haulCompleted && isDealClosed ? zakatBase * 0.025 : 0

          bucketRows.push({
            id: rowKey,
            bucketId: sourceBucket?.id || inv.id,
            periodIndex: i,
            label: `${inv.name} • Principal`,
            currency: 'SAR',
            balance: principalRemaining,
            haulStartDate: isoDay(periodStart),
            lastZakatPaidDate: null,
            haulCompleteDate: isoDay(periodEnd),
            idleBase: principalRemaining,
            receiptsTotal: 0,
            zakatDue,
            isPaid,
            haulCompleted,
            source: inv.name,
            sourceGroup: `Sukuk Principal • ${inv.name}`,
            sourceType: 'SUKUK',
            rowKind: 'PRINCIPAL',
            why: haulCompleted
              ? (isDealClosed
                  ? `Principal continuity from ROSCA: ${isoDay(periodStart)} to ${isoDay(periodEnd)} — ${isPaid ? 'paid' : 'due'}`
                  : `Principal locked in active Sukuk — zakat deferred until maturity`)
              : `Principal continuity: ${isoDay(periodStart)} to ${isoDay(periodEnd)} — upcoming`,
            lastPayment: null,
            dueReceipts: [],
          })
        }
      }
    }

    // Add profit bucket rows linked to this investment
    const profitBuckets = allBuckets.filter(b => {
      const bl = typeof b.label === 'string' ? b.label : ''
      return (bl.startsWith('Profit •') || bl.startsWith('Profit \u2022')) && bl.includes(inv.name)
    })

    for (const profitBucket of profitBuckets) {
      const profitBalance = Math.max(0, Number(profitBucket.balance) || 0)
      if (profitBalance <= 0.01) continue
      const profitHaulStart = toDate(profitBucket.haulStartDate)
      if (!profitHaulStart) continue

      // Check if we already have rows for this bucket from the main loop
      const alreadyHasRows = bucketRows.some(r => r.bucketId === profitBucket.id)
      if (alreadyHasRows) continue

      const startDay = new Date(profitHaulStart.getFullYear(), profitHaulStart.getMonth(), profitHaulStart.getDate())
      const profitMovements = Array.isArray(profitBucket.movements) ? profitBucket.movements : []
      const profitPayments = profitMovements.filter((m: any) => m.type === 'ZAKAT_PAID')

      // Generate receipt-style rows for each profit movement
      const profitReceipts = profitMovements.filter((m: any) =>
        m.type === 'WITHDRAW_PROFIT' || m.type === 'CASH_IN'
      )

      if (profitReceipts.length > 0) {
        for (const receipt of profitReceipts) {
          const receiptDate = new Date(receipt.date)
          if (isNaN(receiptDate.getTime())) continue
          const receiptAmount = Math.abs(Number(receipt.amount) || 0)
          if (receiptAmount <= 0.01) continue

          const rowKey = `RECEIPT|${profitBucket.id}|${receipt.id}`
          const isPaid = movementHasRowPaid(profitPayments, rowKey)
          const haulCompleted = diffDaysFloor(startDay, receiptDate) >= 354 || diffDaysFloor(startDay, now) >= 354
          const receiptHaulEnd = addDays(receiptDate, 354)
          const zakatBase = haulCompleted ? calculateZakatBase(receiptAmount, profitMovements, receiptDate, receiptHaulEnd) : receiptAmount
          const zakatDue = !isPaid && haulCompleted ? zakatBase * 0.025 : 0

          bucketRows.push({
            id: rowKey,
            bucketId: profitBucket.id,
            periodIndex: 0,
            label: `Profit • ${inv.name}`,
            currency: 'SAR',
            balance: receiptAmount,
            haulStartDate: isoDay(startDay),
            lastZakatPaidDate: null,
            haulCompleteDate: isoDay(addDays(startDay, 354)),
            idleBase: 0,
            receiptsTotal: receiptAmount,
            zakatDue,
            isPaid,
            haulCompleted,
            source: inv.name,
            sourceGroup: `Sukuk Profit • ${inv.name}`,
            sourceType: 'SUKUK',
            rowKind: 'PROFIT',
            why: haulCompleted
              ? `Profit receipt: ${isoDay(receiptDate)} — ${isPaid ? 'paid' : 'due'}`
              : `Profit receipt: ${isoDay(receiptDate)} — hawl in progress`,
            lastPayment: null,
            dueReceipts: [{
              date: isoDay(receiptDate),
              amount: receiptAmount,
              type: 'WITHDRAW_PROFIT',
              investmentName: inv.name,
            }],
          })
        }
      }
    }
  }

  // Sort by hawl start date
  bucketRows.sort((a, b) => {
    const aTime = new Date(a.haulStartDate).getTime()
    const bTime = new Date(b.haulStartDate).getTime()
    if (aTime !== bTime) return aTime - bTime
    const aEnd = new Date(a.haulCompleteDate).getTime()
    const bEnd = new Date(b.haulCompleteDate).getTime()
    return aEnd - bEnd
  })

  const totalDue = bucketRows.reduce((s, r) => s + (r.isPaid ? 0 : Math.max(0, r.zakatDue)), 0)

  // ━━━ SECTION 4: DEEP RECONCILIATION WARNINGS WITH FIX OPTIONS ━━━
  const warnings: Warning[] = []

  // CHECK 1: Buckets missing haulStartDate
  for (const b of healthBuckets) {
    if (!b.haulStartDate || isNaN(new Date(b.haulStartDate as any).getTime())) {
      const fullBucket = allBucketsIncludingExcluded.find(ab => ab.id === b.id)
      const cashInMovements = fullBucket?.movements?.filter((m: any) => m.type === 'CASH_IN') || []
      const earliestCashIn = cashInMovements
        .map((m: any) => new Date(m.date || m.createdAt))
        .filter((d: Date) => !isNaN(d.getTime()))
        .sort((a: Date, b: Date) => a.getTime() - b.getTime())[0]

      const bucketBalance = Number(b.balance || 0).toFixed(2)
      const fixOpts: Warning['fixOptions'] = []

      if (earliestCashIn) {
        fixOpts.push({
          id: 'use-earliest-cash-in',
          label: `Set to earliest deposit date (${isoDay(earliestCashIn)})`,
          description: `Uses the date of the first CASH_IN movement found in this bucket. This is the most accurate option because it reflects when money first entered the bucket.`,
          recommended: true,
          action: 'SET_HAUL_START',
          bucketId: b.id,
          payload: { haulStartDate: isoDay(earliestCashIn) },
        })
      }
      fixOpts.push({
        id: 'use-today',
        label: 'Set to today\'s date',
        description: `Sets the hawl start to today. This means the 354-day cycle starts now and zakat won't be due for ~1 year. Use this only if you cannot determine when the money was first received.`,
        recommended: !earliestCashIn,
        action: 'SET_HAUL_START',
        bucketId: b.id,
        payload: { haulStartDate: isoDay(now) },
      })
      fixOpts.push({
        id: 'exclude-bucket',
        label: 'Exclude this bucket from zakat',
        description: `Permanently removes this bucket from all zakat calculations. Use this if the money is not zakatable (e.g. operational funds, temporary holds).`,
        recommended: false,
        action: 'EXCLUDE_BUCKET',
        bucketId: b.id,
      })

      warnings.push({
        id: `missing-haul-${b.id}`,
        type: 'MISSING_HAUL_START',
        severity: 'error',
        title: 'Bucket Missing Hawl Start Date',
        description: `Cash bucket "${b.label || b.id.slice(0, 8)}" has no haulStartDate set. Zakat cannot be calculated for this money.`,
        bucketId: b.id,
        bucketLabel: b.label || undefined,
        explanation: `Every cash bucket needs a "hawl start date" — the date when the money was first received and held. The zakat clock (hawl) runs for 354 days (one lunar year) from this date. Without it, the system cannot determine when zakat becomes due on this money.`,
        example: `If you received SAR 10,000 on January 1, 2025, the hawl start date should be 2025-01-01. After 354 days (~December 21, 2025), zakat of SAR 250 (2.5%) becomes due on that amount if it's still held.`,
        fixOptions: fixOpts,
        details: `Bucket balance: ${bucketBalance}. ${cashInMovements.length} CASH_IN movement(s) found. ${earliestCashIn ? `Earliest: ${isoDay(earliestCashIn)}` : 'No deposit history available.'}`,
      })
    }
  }

  // CHECK 2: Debt buckets leaking into zakat
  for (const b of healthBuckets) {
    if ((b as any).debt?.id) {
      const bucketBalance = Number(b.balance || 0).toFixed(2)
      warnings.push({
        id: `debt-bucket-${b.id}`,
        type: 'DEBT_IN_ZAKAT',
        severity: 'error',
        title: 'Debt Bucket in Zakat Calculations',
        description: `Bucket "${b.label || b.id.slice(0, 8)}" is linked to a debt but not excluded from zakat. Debt money should not be zakatable.`,
        bucketId: b.id,
        bucketLabel: b.label || undefined,
        explanation: `This bucket is linked to a debt record, meaning it represents money that is owed to someone else — not money you own. In Islamic finance, debts owed are deducted from zakatable wealth. Including this bucket inflates your zakat calculation incorrectly.`,
        example: `If you owe someone SAR 5,000 and this bucket tracks that debt, it should NOT be counted as your wealth. The system should exclude it so your zakat is calculated only on money you truly own.`,
        fixOptions: [
          {
            id: 'exclude-from-zakat',
            label: 'Exclude this debt bucket from zakat',
            description: 'Marks this bucket as excluded from all zakat calculations. This is the correct action for any bucket that represents money owed to others.',
            recommended: true,
            action: 'EXCLUDE_BUCKET',
            bucketId: b.id,
          },
          {
            id: 'zero-and-exclude',
            label: 'Zero balance and exclude',
            description: 'Sets the bucket balance to 0 and excludes it from zakat. Use this if the debt has been settled but the bucket was not cleaned up.',
            recommended: false,
            action: 'EXCLUDE_BUCKET',
            bucketId: b.id,
          },
        ],
        details: `Bucket balance: ${bucketBalance}. This bucket is linked to debt ID. Scholars agree that money owed to others should not count toward zakatable wealth.`,
      })
    }
  }

  // CHECK 3: ROSCA funded Sukuk missing savingsHaulStartDate
  for (const inv of sukukInvestments) {
    const roscaAllocations = (inv.bucketAllocations || []).filter((a: any) => {
      const label = a.cashBucket?.label || ''
      return label.startsWith('Savings Receipt •') || label.startsWith('Circlys Reward Receipt •')
    })
    const isRoscaFunded = roscaAllocations.length > 0

    if (isRoscaFunded) {
      const meta = parseMetadata(inv.metadata)
      if (!meta?.savingsHaulStartDate) {
        const sortedAllocs = [...roscaAllocations].sort((a: any, b: any) => {
          const aDate = toDate(a.cashBucket?.haulStartDate)?.getTime() || Infinity
          const bDate = toDate(b.cashBucket?.haulStartDate)?.getTime() || Infinity
          return aDate - bDate
        })
        const firstAlloc = sortedAllocs[0]
        const suggestedDate = firstAlloc?.cashBucket?.haulStartDate
          ? isoDay(new Date(firstAlloc.cashBucket.haulStartDate))
          : null
        const bucketLabels = roscaAllocations.map((a: any) => a.cashBucket?.label).filter(Boolean).join(', ')
        const invStartDate = inv.startDate ? isoDay(new Date(inv.startDate)) : null

        const fixOpts: Warning['fixOptions'] = []
        if (suggestedDate) {
          fixOpts.push({
            id: 'use-bucket-haul',
            label: `Set to funding bucket date (${suggestedDate})`,
            description: `Copies the hawl start date from the ROSCA funding bucket. This preserves the original savings hawl continuity — zakat counting continues from when the savings began, not when the Sukuk was purchased.`,
            recommended: true,
            action: 'SET_SAVINGS_HAUL',
            investmentId: inv.id,
            payload: { savingsHaulStartDate: suggestedDate },
          })
        }
        if (invStartDate) {
          fixOpts.push({
            id: 'use-investment-start',
            label: `Set to investment start date (${invStartDate})`,
            description: `Uses the Sukuk purchase date. This breaks hawl continuity — the 354-day clock restarts from the investment date. Only use this if the savings plan was recently started.`,
            recommended: false,
            action: 'SET_SAVINGS_HAUL',
            investmentId: inv.id,
            payload: { savingsHaulStartDate: invStartDate },
          })
        }
        fixOpts.push({
          id: 'use-today',
          label: 'Set to today',
          description: 'Starts the hawl clock from today. Only use this as a last resort when no other date is available.',
          recommended: false,
          action: 'SET_SAVINGS_HAUL',
          investmentId: inv.id,
          payload: { savingsHaulStartDate: isoDay(now) },
        })

        warnings.push({
          id: `missing-savings-haul-${inv.id}`,
          type: 'MISSING_SAVINGS_HAUL',
          severity: 'warning',
          title: 'ROSCA Funded Sukuk Missing Continuity Anchor',
          description: `Sukuk "${inv.name}" was funded from ROSCA savings but has no savingsHaulStartDate in metadata. Hawl continuity will be broken.`,
          investmentId: inv.id,
          investmentName: inv.name,
          explanation: `When you save money monthly in a Circlys/ROSCA plan and then invest it in Sukuk, the zakat hawl (354-day cycle) should continue from when you first started saving — not restart when the Sukuk was purchased. The "savingsHaulStartDate" field stores this continuity anchor. Without it, the system treats the Sukuk purchase date as the start, which means you could lose months of already-completed hawl progress.`,
          example: `You started saving SAR 1,000/month in Jan 2024. By Dec 2024, the savings matured (SAR 12,000) and were invested in Sukuk "Ridwan". The hawl should count from Jan 2024 (savings start), not Dec 2024 (Sukuk purchase). Without the anchor, you'd wait an extra 11 months before zakat is due.`,
          fixOptions: fixOpts,
          details: `Funded from: ${bucketLabels}. ${suggestedDate ? `Suggested anchor: ${suggestedDate} (from bucket).` : 'No bucket hawl date found.'} Investment start: ${invStartDate || 'unknown'}.`,
        })
      }
    }
  }

  // CHECK 4: Double counting — same bucket allocated to multiple active investments
  for (const b of healthBuckets) {
    const activeAllocs = b.allocations.filter((a: any) => Number(a.principalRemaining) > 0.01)
    if (activeAllocs.length > 1) {
      const allocDetails = activeAllocs.map((a: any) => ({
        name: a.investment?.name || 'Unknown',
        id: a.investment?.id || '',
        amount: Number(a.principalRemaining || 0),
      }))
      const totalAllocated = allocDetails.reduce((s, a) => s + a.amount, 0)
      const bucketBalance = Number(b.balance || 0)

      // Determine which investment has the largest allocation (likely the "real" one)
      const largestAlloc = [...allocDetails].sort((a, b) => b.amount - a.amount)[0]

      const fixOpts: Warning['fixOptions'] = allocDetails.map((alloc, idx) => ({
        id: `keep-${alloc.id}`,
        label: `Keep allocation to "${alloc.name}" (${alloc.amount.toFixed(2)})`,
        description: `Closes all other allocations and keeps only this investment's claim on the bucket. The other ${activeAllocs.length - 1} allocation(s) will have principalRemaining set to 0.`,
        recommended: alloc.id === largestAlloc.id,
        action: 'CLOSE_EXTRA_ALLOCATIONS',
        bucketId: b.id,
        payload: { keepInvestmentId: alloc.id },
      }))
      fixOpts.push({
        id: 'exclude-bucket',
        label: 'Exclude this bucket from zakat entirely',
        description: 'If the allocations are all stale or incorrect, exclude the bucket from zakat calculations to prevent any double counting.',
        recommended: false,
        action: 'EXCLUDE_BUCKET',
        bucketId: b.id,
      })

      warnings.push({
        id: `double-count-${b.id}`,
        type: 'DOUBLE_COUNTING',
        severity: 'error',
        title: 'Possible Double Counting Detected',
        description: `Bucket "${b.label || b.id.slice(0, 8)}" is allocated to ${activeAllocs.length} active investments. The same money may be counted multiple times.`,
        bucketId: b.id,
        bucketLabel: b.label || undefined,
        explanation: `A single cash bucket should normally fund only one active investment at a time. When the same bucket is allocated to multiple investments with remaining principal, the system may count the same money twice for zakat — once for each investment's receipt/profit rows. This inflates your zakat obligation.`,
        example: `Bucket "Profit • ABC Company" has SAR 5,000. It's allocated to both "Sukuk A" (SAR 3,000 remaining) and "Sukuk B" (SAR 4,000 remaining). Total allocation SAR 7,000 exceeds the bucket balance of SAR 5,000 — some money is being counted twice.`,
        fixOptions: fixOpts,
        details: `Allocations: ${allocDetails.map(a => `${a.name}: ${a.amount.toFixed(2)}`).join('; ')}. Total allocated: ${totalAllocated.toFixed(2)}, bucket balance: ${bucketBalance.toFixed(2)}. ${totalAllocated > bucketBalance + 0.01 ? 'OVER-ALLOCATED!' : 'Within balance limits.'}`,
      })
    }
  }

  // CHECK 5: Hawl date jumped backwards
  for (const b of healthBuckets) {
    const bucketHaulTime = b.haulStartDate ? new Date(b.haulStartDate as any).getTime() : null
    if (!bucketHaulTime) continue
    const bucketHaulStr = new Date(b.haulStartDate as any).toISOString().split('T')[0]

    for (const alloc of b.allocations) {
      if (alloc.investment?.account?.type !== 'SUKUK') continue
      const meta = parseMetadata(alloc.investment.metadata)
      const savedHaulStr = meta?.savingsHaulStartDate as string | undefined
      const savedHaul = savedHaulStr ? new Date(savedHaulStr).getTime() : null
      if (savedHaul && savedHaul < bucketHaulTime - 86400000 * 30) {
        const gapDays = Math.abs(Math.round((bucketHaulTime - savedHaul) / 86400000))

        warnings.push({
          id: `hawl-backwards-${b.id}-${alloc.investment.id}`,
          type: 'HAWL_JUMPED_BACKWARDS',
          severity: 'warning',
          title: 'Hawl Clock Jumped Backwards',
          description: `Investment "${alloc.investment.name}" has savingsHaulStartDate (${savedHaulStr}) earlier than its funding bucket "${b.label || b.id.slice(0, 8)}" haulStartDate (${bucketHaulStr}). Gap: ${gapDays} days.`,
          bucketId: b.id,
          bucketLabel: b.label || undefined,
          investmentId: alloc.investment.id,
          investmentName: alloc.investment.name,
          explanation: `Normally, when savings fund a Sukuk, the investment's savingsHaulStartDate should be equal to or later than the funding bucket's haulStartDate. If the investment date is earlier, it means the zakat clock was set to a date before the money existed in the bucket — the hawl "jumped backwards" in time. This usually happens when the continuity anchor was incorrectly copied from an older savings cycle.`,
          example: `Bucket "Profit • ${b.label || 'XYZ'}" has haulStartDate of ${bucketHaulStr}. But the Sukuk "${alloc.investment.name}" has savingsHaulStartDate of ${savedHaulStr}, which is ${gapDays} days earlier. This means the investment thinks the hawl started before the bucket even received the money.`,
          fixOptions: [
            {
              id: 'sync-from-bucket',
              label: `Update investment to use bucket date (${bucketHaulStr})`,
              description: `Sets the investment's savingsHaulStartDate to match the bucket's haulStartDate. This is the safest fix — it ensures the hawl starts from when the money was actually in the bucket.`,
              recommended: true,
              action: 'SYNC_HAUL_FROM_BUCKET',
              bucketId: b.id,
              investmentId: alloc.investment.id,
            },
            {
              id: 'sync-from-investment',
              label: `Update bucket to use investment date (${savedHaulStr})`,
              description: `Sets the bucket's haulStartDate to match the investment's savingsHaulStartDate. Use this only if you're sure the bucket date is wrong and the investment date is the correct original anchor.`,
              recommended: false,
              action: 'SYNC_HAUL_FROM_INVESTMENT',
              bucketId: b.id,
              investmentId: alloc.investment.id,
            },
            {
              id: 'remove-anchor',
              label: 'Remove savingsHaulStartDate from investment',
              description: 'Deletes the continuity anchor entirely. The system will fall back to the investment start date for hawl calculation. Use this if the anchor is completely wrong.',
              recommended: false,
              action: 'REMOVE_SAVINGS_HAUL',
              investmentId: alloc.investment.id,
            },
          ],
          details: `Bucket haulStartDate: ${bucketHaulStr}. Investment savingsHaulStartDate: ${savedHaulStr}. Gap: ${gapDays} days. The investment anchor should be >= bucket anchor.`,
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
        explanation: `The system calculates zakat as 2.5% of the zakatable balance at the end of each 354-day hawl cycle. If the computed zakat doesn't match the simple formula (balance × 2.5%), it may mean that the balance changed during the period due to withdrawals, additions, or other movements.`,
        example: `A bucket had SAR 40,000 at the start of the hawl, but SAR 10,000 was withdrawn midway. The system might use the lower balance (SAR 30,000) for zakat calculation, giving SAR 750 instead of SAR 1,000.`,
        fixOptions: [],
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
      const principalAllocBuckets = (inv.bucketAllocations || [])
        .filter((a: any) => Number(a.principalRemaining) > 0.01)
        .map((a: any) => ({
          bucketId: a.cashBucket?.id,
          label: a.cashBucket?.label || 'Unknown',
          amount: Number(a.principalRemaining || 0),
        }))

      const fixOpts: Warning['fixOptions'] = principalAllocBuckets
        .filter((pb: any) => pb.bucketId)
        .map((pb: any) => ({
          id: `exclude-${pb.bucketId}`,
          label: `Exclude bucket "${pb.label}" from zakat`,
          description: `Excludes the funding bucket (balance used for this Sukuk's principal) from zakat while the Sukuk is active. The principal will be captured when the Sukuk matures.`,
          recommended: true,
          action: 'EXCLUDE_BUCKET',
          bucketId: pb.bucketId,
        }))

      warnings.push({
        id: `active-sukuk-due-${inv.id}`,
        type: 'ACTIVE_SUKUK_IN_DUE',
        severity: 'warning',
        title: 'Active Sukuk Has Due Zakat Rows',
        description: `Sukuk "${inv.name}" is still active (matures ${maturity ? isoDay(maturity) : 'unknown'}) but has principal zakat rows showing as due.`,
        investmentId: inv.id,
        investmentName: inv.name,
        explanation: `When money is invested in an active Sukuk, the principal is "locked up" and not accessible to you. Many scholars hold that locked-up principal in active investments is not zakatable until the investment matures and you regain access to the money. However, profits received during the active period ARE zakatable.`,
        example: `You invested SAR 50,000 in Sukuk "Ridwan" maturing in Dec 2025. While the Sukuk is active, the SAR 50,000 principal should not appear as zakatable. But if you receive SAR 2,000 in profit, that profit IS zakatable once its own hawl completes.`,
        fixOptions: fixOpts,
        details: `Principal: ${Number(inv.principalAmount || 0).toFixed(2)}, Maturity: ${maturity ? isoDay(maturity) : 'not set'}, Active allocations: ${principalAllocBuckets.length}. Funding buckets: ${principalAllocBuckets.map(pb => `${pb.label} (${pb.amount.toFixed(2)})`).join(', ')}.`,
      })
    }
  }

  // CHECK 8: Monthly contribution buckets not excluded
  for (const b of allBucketsIncludingExcluded) {
    const label = b.label || ''
    const isContribution = label.startsWith('Circlys •') && !label.includes('Receipt') && !label.includes('Reward')
    if (isContribution && !b.excludeFromZakat) {
      const bucketBalance = Number(b.balance || 0).toFixed(2)
      warnings.push({
        id: `contribution-not-excluded-${b.id}`,
        type: 'CONTRIBUTION_NOT_EXCLUDED',
        severity: 'error',
        title: 'Monthly Contribution Bucket Not Excluded',
        description: `Savings contribution bucket "${b.label}" is not excluded from zakat. These represent money being saved, which should not be double-counted.`,
        bucketId: b.id,
        bucketLabel: b.label || undefined,
        explanation: `Monthly contribution buckets (labeled "Circlys • ...") track your monthly savings installments. When the savings plan matures, a "Savings Receipt" or "Reward Receipt" bucket is created with the full amount. If both the contribution bucket AND the receipt bucket are included in zakat, the same money gets counted twice.`,
        example: `You save SAR 1,000/month for 12 months into "Circlys • Plan A". After maturity, a "Savings Receipt • Plan A" bucket is created with SAR 12,000. If both are in zakat, you'd pay zakat on SAR 24,000 instead of SAR 12,000.`,
        fixOptions: [
          {
            id: 'exclude-from-zakat',
            label: 'Exclude from zakat calculations',
            description: 'Marks this contribution bucket as excluded. The receipt bucket (created at maturity) will be the correct source for zakat. This prevents double-counting.',
            recommended: true,
            action: 'EXCLUDE_BUCKET',
            bucketId: b.id,
          },
        ],
        details: `Balance: ${bucketBalance}. This is a monthly contribution bucket. The corresponding receipt/reward bucket should be the one tracked for zakat.`,
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
        explanation: `A cash bucket should never have a negative balance — it would mean more money was withdrawn than existed. This usually indicates a bug in transaction processing, a duplicate withdrawal, or movements processed out of order. A negative balance can skew zakat calculations because the system might try to compute 2.5% of a negative number.`,
        example: `Bucket "Profit • XYZ" received SAR 3,000 in profit. Then two withdrawals of SAR 2,000 each were processed (perhaps a duplicate), leaving a balance of -SAR 1,000. The second withdrawal should not have been allowed.`,
        fixOptions: [
          {
            id: 'zero-balance',
            label: 'Reset balance to zero',
            description: 'Sets the bucket balance to 0. Use this if the negative balance is due to a processing error and the money has already been accounted for elsewhere.',
            recommended: true,
            action: 'ZERO_BUCKET_BALANCE',
            bucketId: b.id,
          },
          {
            id: 'exclude-bucket',
            label: 'Exclude from zakat',
            description: 'Excludes this bucket from zakat calculations. The negative balance won\'t affect zakat, but the bucket will still exist for tracking purposes.',
            recommended: false,
            action: 'EXCLUDE_BUCKET',
            bucketId: b.id,
          },
        ],
        details: `Current balance: ${balance.toFixed(2)}. This should be investigated and corrected.`,
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
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-100">Zakat Audit & Verification</h1>
        <p className="text-xs text-slate-400 mt-1">
          Complete review of all zakat calculations, hawl timelines, and reconciliation checks.
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
