import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { ZakatDashboard } from '@/components/zakat/ZakatDashboard'

export const dynamic = 'force-dynamic'

const NISAB_KEY = 'NISAB_VALUE'
const DEFAULT_NISAB = 55000

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

const receiptTypes = new Set([
  'WITHDRAW_PROFIT',
  'WITHDRAW_PRINCIPAL',
  'ROLLBACK_PRINCIPAL',
  'SELL_RECEIPT',
])

export default async function ZakatPage() {
  const user = await getCurrentUser()
  if (!user) {
    return null
  }

  if (user.role !== 'OWNER') {
    return (
      <div className="space-y-6">
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-xl shadow-md p-6 text-white">
          <h1 className="text-2xl font-bold">Zakat Dashboard</h1>
          <p className="text-sm text-slate-400 mt-1">Only owners can access Zakat.</p>
        </div>
      </div>
    )
  }

  const nisabSetting = await prisma.systemSetting.findUnique({ where: { key: NISAB_KEY } })
  const nisabRaw = nisabSetting ? Number(nisabSetting.value) : DEFAULT_NISAB
  const nisabValue = Number.isFinite(nisabRaw) && nisabRaw > 0 ? nisabRaw : DEFAULT_NISAB

  const buckets = await prisma.cashBucket.findMany({
    where: { excludeFromZakat: false },
    orderBy: { haulStartDate: 'asc' },
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

  const zakatEnabled = totalZakatableWealth >= nisabValue

  const rows: BucketRow[] = buckets
    .map((bucket: any): BucketRow | null => {
    const effectiveStart = bucket.lastZakatPaidDate
      ? new Date(bucket.lastZakatPaidDate)
      : new Date(bucket.haulStartDate)
    const haulCompleteDate = addDays(effectiveStart, 354)
    const now = new Date()
    const haulCompleted = now.getTime() >= haulCompleteDate.getTime()

    const idleMovements = bucket.movements.filter((movement: any) => {
      const movementDate = new Date(movement.date)
      if (movement.type === 'ZAKAT_PAID') return false
      if (movementDate < effectiveStart) return false
      if (movementDate > haulCompleteDate) return false
      // Exclude Circlys receipt payout — it shouldn't count as idle cash
      // for this bucket's haul period (it arrived later and inflates the balance)
      if (movement.type === 'CASH_IN' && movement.notes && String(movement.notes).includes('Circlys receipt')) return false
      return true
    })

    const idleBase = Math.max(
      0,
      idleMovements.reduce((sum: number, movement: any) => sum + movement.amount, 0)
    )

    const rawReceipts = bucket.movements.filter((movement: any) => {
      if (!receiptTypes.has(movement.type)) return false
      if (!movement.investmentId) return false
      if (!movement.investment) return false
      if (movement.investment?.isIjarah) return false
      if (movement.investment?.reopenedAt) {
        const reopenedAt = new Date(movement.investment.reopenedAt)
        if (new Date(movement.createdAt) < reopenedAt) return false
      }
      const movementDate = new Date(movement.date)
      if (movementDate < effectiveStart) return false
      return movementDate >= haulCompleteDate
    })
    const dedupedMap = new Map<string, typeof rawReceipts[number]>()
    rawReceipts.forEach((movement: any) => {
      const key = [
        movement.investmentId,
        movement.type,
        movement.amount,
        new Date(movement.date).toISOString().split('T')[0],
      ].join('|')
      if (!dedupedMap.has(key)) {
        dedupedMap.set(key, movement)
      }
    })
    const dueReceipts = Array.from(dedupedMap.values())
    const receiptsTotal = dueReceipts.reduce((sum: number, m: any) => sum + m.amount, 0)
    const zakatBase = idleBase + receiptsTotal
    const zakatDue = haulCompleted ? zakatBase * 0.025 : 0

    const payments = bucket.movements
      .filter((movement: any) => movement.type === 'ZAKAT_PAID')
      .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())

    const lastPayment = payments[0]

    const alloc = bucket.allocations?.[0]
    const source = alloc?.investment?.name
      || bucket.label
      || 'General'
    const sourceType = alloc?.investment?.account?.type || 'OTHER'

    // Group Circlys monthly buckets by investment name
    // Labels look like "Circlys • February 2025 • 2025-03"
    const isCirclys = typeof bucket.label === 'string' && bucket.label.startsWith('Circlys')
    const sourceGroup = isCirclys && bucket.label
      ? bucket.label.split(' • ').slice(0, 2).join(' • ')
      : source

    // Subtract Circlys receipt payout from displayed balance so it
    // reflects only the actual monthly contributions, not the full ROSCA pot.
    const receiptInBucket = bucket.movements
      .filter((m: any) => m.type === 'CASH_IN' && m.notes && String(m.notes).includes('Circlys receipt'))
      .reduce((s: number, m: any) => s + m.amount, 0)
    const displayBalance = bucket.balance - receiptInBucket

    // Hide buckets that are effectively empty (cash was added then fully invested out)
    // to avoid cluttering the zakat dashboard with many "General" 0 rows.
    const isEffectivelyEmpty =
      Number(bucket.balance || 0) <= 0 &&
      idleBase <= 0 &&
      receiptsTotal <= 0 &&
      zakatDue <= 0 &&
      dueReceipts.length === 0 &&
      payments.length === 0

    if (isEffectivelyEmpty) return null

    return {
      id: bucket.id,
      label: bucket.label,
      currency: bucket.currency,
      balance: displayBalance,
      haulStartDate: bucket.haulStartDate.toISOString().split('T')[0],
      lastZakatPaidDate: bucket.lastZakatPaidDate
        ? bucket.lastZakatPaidDate.toISOString().split('T')[0]
        : null,
      receiptsTotal,
      zakatDue,
      lastPayment: lastPayment
        ? {
            id: lastPayment.id,
            date: new Date(lastPayment.date).toISOString().split('T')[0],
            amount: Math.abs(lastPayment.amount),
          }
        : null,
      haulCompleteDate: haulCompleteDate.toISOString().split('T')[0],
      idleBase,
      haulCompleted,
      source,
      sourceGroup,
      sourceType,
      dueReceipts: dueReceipts.map((m) => ({
        date: new Date(m.date).toISOString().split('T')[0],
        amount: m.amount,
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

      {!zakatEnabled && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="font-semibold">Below Nisab</div>
          <div className="mt-1">
            Total zakatable cash is SAR {totalZakatableWealth.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.
            Nisab is SAR {nisabValue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}.
          </div>
        </div>
      )}

      <ZakatDashboard buckets={rows} zakatEnabled={zakatEnabled} />
    </div>
  )
}
