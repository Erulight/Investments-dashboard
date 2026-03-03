import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { ZakatDashboard } from '@/components/zakat/ZakatDashboard'

export const dynamic = 'force-dynamic'

const NISAB_KEY = 'NISAB_VALUE'

type BucketRow = {
  id: string
  label?: string | null
  currency: string
  balance: number
  haulStartDate: string
  lastZakatPaidDate?: string | null
  haulCompleteDate: string
  idleBase: number
  receiptsTotal: number
  zakatDue: number
  haulCompleted: boolean
  source: string
  sourceGroup: string
  sourceType: string
  lastPayment: null | {
    id: string
    date: string
    amount: number
  }
  dueReceipts: Array<{
    date: string
    amount: number
    type: string
    investmentName?: string | null
  }>
}

const addDays = (date: Date, days: number) => {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

const diffDaysFloor = (start: Date, end: Date) => {
  const startTime = start.getTime()
  const endTime = end.getTime()
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return 0
  const diffMs = endTime - startTime
  if (diffMs <= 0) return 0
  return Math.floor(diffMs / (1000 * 60 * 60 * 24))
}

const receiptTypes = new Set([
  'WITHDRAW_PROFIT',
  'WITHDRAW_PRINCIPAL',
  'ROLLBACK_PRINCIPAL',
  'SELL_RECEIPT',
])

const toDate = (value?: string | Date | null) => {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (match) {
      const [, year, month, day] = match
      return new Date(Number(year), Number(month) - 1, Number(day))
    }
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date
}

const getPeriodMonths = (start?: string | Date | null, end?: string | Date | null) => {
  const startDate = toDate(start)
  const endDate = toDate(end)
  if (!startDate || !endDate) return 0
  const months = (endDate.getFullYear() - startDate.getFullYear()) * 12
    + (endDate.getMonth() - startDate.getMonth())
    + (endDate.getDate() - startDate.getDate()) / 30
  return Math.max(0, months)
}

const parseMetadata = (value: unknown) => {
  if (!value) return null
  if (typeof value === 'object') return value as any
  if (typeof value !== 'string') return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

const getPartnerSukukValueAt = (inv: any, participation: any, asOf: Date) => {
  const principal = Number.isFinite(participation?.investedAmount) ? Number(participation.investedAmount) : 0
  if (principal <= 0) return 0

  const apr = Number.isFinite(inv?.interestRate) ? Number(inv.interestRate) : 0
  const fullFees = Number.isFinite(inv?.fees) ? Number(inv.fees) : 0
  const startBasis = participation?.acquiredAt ?? inv?.startDate
  const totalMonthsFull = getPeriodMonths(inv?.startDate, inv?.maturityDate)
  const monthsHeld = getPeriodMonths(startBasis, inv?.maturityDate)
  const timeRatio = totalMonthsFull > 0 ? Math.min(1, Math.max(0, monthsHeld / totalMonthsFull)) : 1

  const feesHeld = (principal > 0 && Number.isFinite(inv?.principalAmount) && Number(inv.principalAmount) > 0)
    ? (fullFees * Math.min(1, principal / Number(inv.principalAmount))) * timeRatio
    : 0

  const periodYears = monthsHeld ? monthsHeld / 12 : 0
  const grossProfit = principal > 0 && apr > 0 && periodYears > 0
    ? principal * (apr / 100) * periodYears
    : 0

  const manualReceivableFull = Number.isFinite(inv?.receivableAmount) ? Number(inv.receivableAmount) : null
  const manualReceivable = manualReceivableFull !== null && manualReceivableFull > 0
    ? manualReceivableFull * timeRatio
    : null

  const txs = Array.isArray(inv?.transactions) ? inv.transactions : []
  const commissionFromParticipant = Number.isFinite(participation?.commissionFees)
    ? Number(participation.commissionFees)
    : 0
  const commissionFromTx = txs
    .filter((tx: any) => tx?.type === 'BUY_FROM_PARTNER' && participation?.personId && tx.personId === participation.personId)
    .reduce((sum: number, tx: any) => {
      const meta = parseMetadata(tx.metadata)
      const commission = Number(meta?.commissionAmount ?? 0)
      return sum + (Number.isFinite(commission) ? Math.max(0, commission) : 0)
    }, 0)
  const commissionPaid = commissionFromParticipant > 0 ? commissionFromParticipant : commissionFromTx

  const netProfitTotal = manualReceivable !== null
    ? Math.max(0, manualReceivable - commissionPaid)
    : Math.max(0, grossProfit - feesHeld - commissionPaid)

  const start = toDate(startBasis)
  const maturity = toDate(inv?.maturityDate)
  const startTime = start?.getTime() || 0
  const maturityTime = maturity?.getTime() || 0
  const totalMs = maturityTime > startTime ? maturityTime - startTime : 0
  const atMs = asOf.getTime()
  const elapsedMs = totalMs > 0
    ? Math.min(Math.max(atMs - startTime, 0), totalMs)
    : (atMs > startTime ? 1 : 0)

  const accruedProfit = totalMs > 0
    ? netProfitTotal * (elapsedMs / totalMs)
    : (atMs > startTime ? netProfitTotal : 0)

  const withdrawnProfit = txs
    .filter((tx: any) => tx?.type === 'WITHDRAW_PROFIT' && participation?.personId && tx.personId === participation.personId)
    .filter((tx: any) => {
      const d = tx?.date instanceof Date ? tx.date : new Date(tx?.date)
      return !Number.isNaN(d.getTime()) && d.getTime() <= atMs
    })
    .reduce((sum: number, tx: any) => sum + Math.abs(Number(tx?.amount) || 0), 0)

  const withdrawnPrincipal = txs
    .filter((tx: any) => tx?.type === 'WITHDRAW_PRINCIPAL' && participation?.personId && tx.personId === participation.personId)
    .filter((tx: any) => {
      const d = tx?.date instanceof Date ? tx.date : new Date(tx?.date)
      return !Number.isNaN(d.getTime()) && d.getTime() <= atMs
    })
    .reduce((sum: number, tx: any) => sum + Math.abs(Number(tx?.amount) || 0), 0)

  const principalOutstanding = Math.max(0, principal - withdrawnPrincipal)
  const receivable = Math.max(0, accruedProfit - withdrawnProfit)
  return principalOutstanding + receivable
}

export default async function ZakatPage() {
  const user = await getCurrentUser()
  if (!user) {
    return null
  }

  const canAccess = user.role === 'OWNER' || user.role === 'PARTNER'
  if (!canAccess) {
    return (
      <div className="space-y-6">
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-xl shadow-md p-6 text-white">
          <h1 className="text-2xl font-bold">Zakat Dashboard</h1>
          <p className="text-sm text-slate-400 mt-1">You do not have access to Zakat.</p>
        </div>
      </div>
    )
  }

  if (user.role === 'PARTNER' && !user.personId) {
    return (
      <div className="space-y-6">
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-xl shadow-md p-6 text-white">
          <h1 className="text-2xl font-bold">Zakat Dashboard</h1>
          <p className="text-sm text-slate-400 mt-1">Partner is missing a person profile.</p>
        </div>
      </div>
    )
  }

  const nisabSetting = await prisma.systemSetting.findUnique({ where: { key: NISAB_KEY } })
  const nisabRaw = nisabSetting ? Number(nisabSetting.value) : null
  const nisabValue = nisabRaw !== null && Number.isFinite(nisabRaw) && nisabRaw > 0 ? nisabRaw : null

  const scopeKey = user.role === 'OWNER' ? 'OWNER' : user.personId!
  const nisabMetKey = `NISAB_MET_SINCE:${scopeKey}`

  const buckets = await prisma.cashBucket.findMany({
    where: {
      excludeFromZakat: false,
      ...(user.role === 'OWNER'
        ? { 
            OR: [
              { personId: null },                    // Original owner buckets
              { personId: user.personId || null }    // Commission buckets with owner's personId
            ]
          }
        : {
            personId: user.personId,
            NOT: [
              { label: 'Partner Commission' },
              { label: { startsWith: 'Debt •' } },
            ],
          }),
    },
    include: {
      movements: {
        orderBy: { date: 'asc' },
        include: {
          investment: {
            select: {
              id: true,
              name: true,
              isIjarah: true,
              reopenedAt: true,
            },
          },
        },
      },
      allocations: {
        include: {
          investment: {
            select: { id: true, name: true, account: { select: { type: true } } },
          },
        },
      },
    },
  })

  const totalZakatableWealth = buckets.reduce((sum: number, b: any) => {
    const balance = Number(b.balance)
    return sum + (Number.isFinite(balance) ? Math.max(0, balance) : 0)
  }, 0)

  const now = new Date()
  let sukukValueForNisab = 0
  if (user.role === 'PARTNER' && user.personId) {
    const participations = await prisma.dealParticipant.findMany({
      where: {
        personId: user.personId,
        investment: {
          account: { type: 'SUKUK' },
        },
      },
      select: {
        investedAmount: true,
        acquiredAt: true,
        commissionFees: true,
        personId: true,
        investment: {
          select: {
            id: true,
            startDate: true,
            maturityDate: true,
            interestRate: true,
            fees: true,
            principalAmount: true,
            receivableAmount: true,
            transactions: {
              where: {
                type: { in: ['WITHDRAW_PROFIT', 'WITHDRAW_PRINCIPAL', 'BUY_FROM_PARTNER'] },
                OR: [{ personId: user.personId }, { personId: null }],
              },
              select: { type: true, date: true, amount: true, personId: true, metadata: true },
              orderBy: { date: 'asc' },
            },
          },
        },
      },
    })

    sukukValueForNisab = participations.reduce((sum: number, p: any) => {
      return sum + getPartnerSukukValueAt(p.investment, p, now)
    }, 0)
  }

  if (user.role === 'OWNER') {
    const ownerPersonId = user.personId || null
    const investments = await prisma.investment.findMany({
      where: {
        account: { type: 'SUKUK' },
      },
      select: {
        id: true,
        principalAmount: true,
        startDate: true,
        maturityDate: true,
        interestRate: true,
        fees: true,
        receivableAmount: true,
        dealParticipants: {
          select: { personId: true, investedAmount: true, acquiredAt: true, commissionFees: true },
        },
        transactions: {
          where: {
            type: { in: ['WITHDRAW_PROFIT', 'WITHDRAW_PRINCIPAL'] },
          },
          select: { type: true, date: true, amount: true },
          orderBy: { date: 'asc' },
        },
      },
    })

    const getOwnerPosition = (inv: any) => {
      if (!ownerPersonId) return null
      const dps = Array.isArray(inv.dealParticipants) ? inv.dealParticipants : []
      return dps.find((p: any) => p?.personId === ownerPersonId) || null
    }

    sukukValueForNisab = investments.reduce((sum: number, inv: any) => {
      const pos = getOwnerPosition(inv)
      const principal = pos ? (Number(pos.investedAmount) || 0) : (Number(inv.principalAmount) || 0)
      if (principal <= 0) return sum

      const totalMonths = getPeriodMonths(inv.startDate, inv.maturityDate)
      const periodYears = totalMonths ? totalMonths / 12 : 0
      const apr = Number(inv.interestRate) || 0
      const fees = Number(inv.fees) || 0
      const manualReceivable = Number.isFinite(inv.receivableAmount) ? Number(inv.receivableAmount) : null
      const totalProfit = manualReceivable !== null && manualReceivable > 0
        ? manualReceivable
        : Math.max(0, (principal * (apr / 100) * periodYears) - fees)

      const start = toDate(inv.startDate)
      const maturity = toDate(inv.maturityDate)
      const startTime = start?.getTime() || 0
      const maturityTime = maturity?.getTime() || 0
      const totalMs = maturityTime > startTime ? maturityTime - startTime : 0
      const atMs = now.getTime()
      const elapsedMs = totalMs > 0
        ? Math.min(Math.max(atMs - startTime, 0), totalMs)
        : (atMs > startTime ? 1 : 0)
      const accruedProfit = totalMs > 0
        ? totalProfit * (elapsedMs / totalMs)
        : (atMs > startTime ? totalProfit : 0)

      const txs = Array.isArray(inv.transactions) ? inv.transactions : []
      const withdrawnProfit = txs
        .filter((tx: any) => tx?.type === 'WITHDRAW_PROFIT')
        .filter((tx: any) => {
          const d = tx?.date instanceof Date ? tx.date : new Date(tx?.date)
          return !Number.isNaN(d.getTime()) && d.getTime() <= atMs
        })
        .reduce((s: number, tx: any) => s + Math.abs(Number(tx?.amount) || 0), 0)

      const withdrawnPrincipal = txs
        .filter((tx: any) => tx?.type === 'WITHDRAW_PRINCIPAL')
        .filter((tx: any) => {
          const d = tx?.date instanceof Date ? tx.date : new Date(tx?.date)
          return !Number.isNaN(d.getTime()) && d.getTime() <= atMs
        })
        .reduce((s: number, tx: any) => s + Math.abs(Number(tx?.amount) || 0), 0)

      const principalOutstanding = Math.max(0, principal - withdrawnPrincipal)
      const receivable = Math.max(0, accruedProfit - withdrawnProfit)
      return sum + principalOutstanding + receivable
    }, 0)
  }

  const totalZakatableWealthForNisab = totalZakatableWealth + sukukValueForNisab

  const nisabConfigured = nisabValue !== null
  const thresholdMet = nisabConfigured ? totalZakatableWealthForNisab >= nisabValue : false
  const nisabMetSetting = await prisma.systemSetting.findUnique({ where: { key: nisabMetKey } })
  const nisabMetSince = nisabMetSetting?.value ? new Date(nisabMetSetting.value) : null

  // Haul starts when nisab is met, and restarts when wealth drops below nisab.
  // We persist the crossing time to keep haul-year stable.
  if (nisabConfigured && thresholdMet) {
    if (!nisabMetSince || Number.isNaN(nisabMetSince.getTime())) {
      const now = new Date()
      const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      await prisma.systemSetting.upsert({
        where: { key: nisabMetKey },
        update: { value: dayStart.toISOString() },
        create: {
          key: nisabMetKey,
          value: dayStart.toISOString(),
          description: 'When nisab threshold was met for zakat haul start',
        },
      })
    }
  } else if (nisabMetSetting) {
    await prisma.systemSetting.delete({ where: { key: nisabMetKey } })
  }

  const effectiveNisabStart = nisabConfigured && thresholdMet
    ? (nisabMetSince && !Number.isNaN(nisabMetSince.getTime()) ? nisabMetSince : new Date())
    : null

  const zakatEnabled = Boolean(effectiveNisabStart)

  const rows: BucketRow[] = buckets
    .map((bucket: any): BucketRow | null => {
      const now = new Date()

      const bucketStart = new Date(bucket.haulStartDate)
      if (Number.isNaN(bucketStart.getTime())) return null

      const lastPaid = bucket.lastZakatPaidDate ? new Date(bucket.lastZakatPaidDate) : null
      const lastPaidTime =
        lastPaid && !Number.isNaN(lastPaid.getTime()) ? lastPaid.getTime() : null

      // Haul 1 always starts from bucket.haulStartDate.
      // Subsequent hauls are 354-day blocks from this same anchor.
      const daysSinceStart = diffDaysFloor(bucketStart, now)
      const completedHauls = Math.floor(daysSinceStart / 354)

      const isProfitBucket =
        typeof bucket.label === 'string' && bucket.label.startsWith('Profit  b7')
      const isCirclys =
        typeof bucket.label === 'string' && bucket.label.startsWith('Circlys')

      let totalIdleBase = 0
      let totalReceipts = 0
      const allDueReceipts: any[] = []

      // Iterate over ALL completed 354-day periods since haulStartDate.
      // For each period [periodStart, periodEnd):
      //   - If lastZakatPaidDate >= periodEnd: that haul is already settled  b7 skip.
      //   - Otherwise, compute idleBase and receipts only from movements whose
      //     date falls inside this specific period.
      for (let i = 0; i < completedHauls; i++) {
        const periodStart = addDays(bucketStart, i * 354)
        const periodEnd = addDays(periodStart, 354)

        // If zakat for this period was already paid (payment on/after period end),
        // we treat this haul as settled.
        if (lastPaidTime && lastPaidTime >= periodEnd.getTime()) {
          continue
        }

        // Idle cash base for this haul period
        const idleMovements = bucket.movements.filter((movement: any) => {
          const movementDate = new Date(movement.date)
          if (Number.isNaN(movementDate.getTime())) return false
          if (movementDate < periodStart || movementDate >= periodEnd) return false
          if (movement.type === 'ZAKAT_PAID') return false
          if (movement.type === 'INVEST_OUT') return false
          // Exclude Circlys receipt payout from idle base
          if (
            movement.type === 'CASH_IN' &&
            movement.notes &&
            String(movement.notes).includes('Circlys receipt')
          ) {
            return false
          }
          return true
        })

        const idleBaseForPeriod = Math.max(
          0,
          idleMovements.reduce(
            (sum: number, movement: any) => sum + Number(movement.amount || 0),
            0,
          ),
        )

        // Receipts per haul period (BUG 1 + BUG 3)
        const periodReceipts = bucket.movements.filter((movement: any) => {
          const movementDate = new Date(movement.date)
          if (Number.isNaN(movementDate.getTime())) return false
          if (movementDate < periodStart || movementDate >= periodEnd) return false

          // Decide if this movement is a receipt:
          // - For profit buckets ("Profit  b7 ..."), CASH_IN is itself the profit receipt.
          // - For other buckets, use classic receiptTypes (WITHDRAW_PROFIT, etc).
          let isReceipt = false
          if (isProfitBucket && movement.type === 'CASH_IN') {
            isReceipt = true
          } else if (receiptTypes.has(movement.type)) {
            isReceipt = true
          }
          if (!isReceipt) return false

          // For normal receipt movements, enforce investment-based filters
          // (exclude Ijarah and defaulted/written-off deals). For pure profit
          // buckets without an investment attached, skip these checks.
          if (!isProfitBucket) {
            if (!movement.investmentId || !movement.investment) return false
            if (movement.investment?.isIjarah) return false

            const metadata = parseMetadata(movement.investment?.metadata)
            const category = movement.investment?.category
            if (
              category === 'DEFAULT_LEGAL' ||
              category === 'WRITTEN_OFF' ||
              metadata?.recoveryStatus === 'DEFAULT_LEGAL' ||
              metadata?.recoveryStatus === 'WRITTEN_OFF'
            ) {
              return false
            }

            if (movement.investment?.reopenedAt) {
              const reopenedAt = new Date(movement.investment.reopenedAt)
              if (new Date(movement.createdAt) < reopenedAt) return false
            }
          }

          return true
        })

        periodReceipts.forEach((m: any) => allDueReceipts.push(m))

        const receiptsForPeriod = periodReceipts.reduce(
          (sum: number, m: any) => sum + Number(m.amount || 0),
          0,
        )

        totalIdleBase += idleBaseForPeriod
        totalReceipts += receiptsForPeriod
      }

      const zakatBase = totalIdleBase + totalReceipts
      const hasUnpaidHaul = completedHauls > 0 && zakatBase > 0
      const zakatDue = hasUnpaidHaul ? zakatBase * 0.025 : 0

      // Current (open) haul window  b7 purely informational
      const currentHaulStart = addDays(bucketStart, completedHauls * 354)
      const currentHaulEnd = addDays(currentHaulStart, 354)
      const haulCompleted = now.getTime() >= currentHaulEnd.getTime()

      const payments = bucket.movements
        .filter((movement: any) => movement.type === 'ZAKAT_PAID')
        .sort(
          (a: any, b: any) =>
            new Date(b.date).getTime() - new Date(a.date).getTime(),
        )

      const lastPayment = payments[0]

      const alloc = bucket.allocations?.[0]
      const source = alloc?.investment?.name || bucket.label || 'General'
      const sourceType = alloc?.investment?.account?.type || 'OTHER'

      const sourceGroup =
        isCirclys && bucket.label
          ? bucket.label.split('  b7 ').slice(0, 2).join('  b7 ')
          : source

      // Subtract Circlys receipt payout from displayed balance to show only contributions.
      const receiptInBucket = bucket.movements
        .filter(
          (m: any) =>
            m.type === 'CASH_IN' &&
            m.notes &&
            String(m.notes).includes('Circlys receipt'),
        )
        .reduce((s: number, m: any) => s + Number(m.amount || 0), 0)

      const displayBalance = bucket.balance - receiptInBucket

      const isEffectivelyEmpty =
        Number(bucket.balance || 0) <= 0 &&
        totalIdleBase <= 0 &&
        totalReceipts <= 0 &&
        zakatDue <= 0 &&
        allDueReceipts.length === 0 &&
        payments.length === 0

      if (isEffectivelyEmpty) return null

      return {
        id: bucket.id,
        label: bucket.label,
        currency: bucket.currency,
        balance: displayBalance,
        haulStartDate: bucketStart.toISOString().split('T')[0],
        lastZakatPaidDate: bucket.lastZakatPaidDate
          ? bucket.lastZakatPaidDate.toISOString().split('T')[0]
          : null,
        receiptsTotal: totalReceipts,
        zakatDue,
        lastPayment: lastPayment
          ? {
              id: lastPayment.id,
              date: new Date(lastPayment.date).toISOString().split('T')[0],
              amount: Math.abs(Number(lastPayment.amount || 0)),
            }
          : null,
        // Show the end date of the most recently completed haul
        haulCompleteDate: addDays(
          bucketStart,
          completedHauls * 354,
        ).toISOString().split('T')[0],
        idleBase: totalIdleBase,
        haulCompleted,
        source,
        sourceGroup,
        sourceType,
        dueReceipts: allDueReceipts.map((m: any) => ({
          date: new Date(m.date).toISOString().split('T')[0],
          amount: Number(m.amount || 0),
          type: m.type,
          investmentName: m.investment?.name || null,
        })),
      }
    })
    .filter((row: BucketRow | null): row is BucketRow => row !== null)

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-xl shadow-md p-6 text-white">
        <h1 className="text-2xl font-bold">Zakat Dashboard</h1>
        <p className="text-sm text-slate-400 mt-1">
          Zakat is calculated only on cash received after the haul is completed.
        </p>
      </div>

      {!nisabConfigured && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="font-semibold">Nisab not configured — please set it in Settings</div>
        </div>
      )}

      {nisabConfigured && !zakatEnabled && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="font-semibold">Below Nisab</div>
          <div className="mt-1">
            Total zakatable wealth is SAR {totalZakatableWealthForNisab.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.
            Nisab is SAR {nisabValue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}.
          </div>
        </div>
      )}

      <ZakatDashboard buckets={rows} zakatEnabled={zakatEnabled} />
    </div>
  )
}
