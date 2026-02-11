'use client'

import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import { SIPForm } from './SIPForm'
import { CreateSipInput } from '@/lib/validation'
import { formatGregorianAndHijriDate } from '@/lib/date'

interface Investment {
  id: string
  name: string
  principalAmount: number
  currentValue: number
  startDate: string
  metadata?: string
  notes?: string
  account: {
    id: string
    name: string
    type: string
    currency: string
  }
}

interface SIPPortfolioClientProps {
  investment?: Investment
  userRole: string
}

type HoldingRow = {
  id: string
  name: string
  assetType: string
  cost: number
  currentValue: number
  allocationPct: number
}

type HoldingDraftRow = {
  id: string
  name: string
  assetType: string
  cost: string
  currentValue: string
}

type ZakatBaseRow = {
  key: string
  label: string
  value: number
}

type ZakatBreakdownRow = {
  hijriYear: number
  startAt: Date
  startValue: number
  endAt: Date
  endValue: number
  basePct: number
  zakatable: number
  zakatDue: number
  paidAmount: number
  dueAfterPayment: number
  periodKey: string
  canPay: boolean
}

type RangeKey = 'week' | 'month' | 'year' | 'all'

type HistoryItem = {
  at: string
  action: string
  currentValue?: number
  investedAmount?: number
  totalAmount?: number
}

const getHijriYear = (date: Date) => {
  try {
    const parts = new Intl.DateTimeFormat('en-US-u-ca-islamic', { year: 'numeric' }).formatToParts(date)
    const yearPart = parts.find((p) => p.type === 'year')?.value
    const year = yearPart ? Number(yearPart) : NaN
    return Number.isFinite(year) ? year : null
  } catch {
    return null
  }
}

const safeNumber = (value: unknown, fallback = 0) => {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}

const parseMeta = (inv?: Investment | null) => {
  if (!inv) return {}
  try {
    return JSON.parse(inv.metadata || '{}')
  } catch {
    return {}
  }
}

const formatCurrency = (value: number) => {
  const amount = Number.isFinite(value) ? value : 0
  return `SAR ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

const addDays = (date: Date, days: number) => {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

const getRangeStart = (range: RangeKey, now: Date) => {
  const n = startOfDay(now)
  if (range === 'week') return new Date(n.getTime() - 7 * 24 * 60 * 60 * 1000)
  if (range === 'month') return new Date(n.getTime() - 30 * 24 * 60 * 60 * 1000)
  if (range === 'year') return new Date(n.getTime() - 365 * 24 * 60 * 60 * 1000)
  return null
}

function LineChart({ points }: { points: { at: Date; value: number }[] }) {
  const width = 820
  const height = 240
  const padX = 24
  const padY = 18

  if (!points || points.length < 2) {
    return (
      <div className="h-[240px] flex items-center justify-center text-sm text-slate-200/80">
        Add value updates to see the chart.
      </div>
    )
  }

  const values = points.map((p) => p.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = Math.max(0.000001, max - min)

  const x0 = points[0].at.getTime()
  const x1 = points[points.length - 1].at.getTime()
  const xRange = Math.max(1, x1 - x0)

  const coords = points.map((p) => {
    const x = padX + ((p.at.getTime() - x0) / xRange) * (width - padX * 2)
    const y = padY + (1 - (p.value - min) / range) * (height - padY * 2)
    return { x, y }
  })

  const d = coords
    .map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(2)} ${c.y.toFixed(2)}`)
    .join(' ')

  const area = `${d} L ${(width - padX).toFixed(2)} ${(height - padY).toFixed(2)} L ${padX.toFixed(2)} ${(height - padY).toFixed(2)} Z`

  const up = values[values.length - 1] >= values[0]
  const stroke = up ? '#34d399' : '#f87171'
  const fill = up ? 'rgba(52,211,153,0.18)' : 'rgba(248,113,113,0.18)'

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={area} fill={fill} />
      <path d={d} fill="none" stroke={stroke} strokeWidth="3" strokeLinecap="round" />
      <circle
        cx={coords[coords.length - 1].x}
        cy={coords[coords.length - 1].y}
        r="5"
        fill={stroke}
      />
    </svg>
  )
}

export default function SIPPortfolioClient({ investment, userRole }: SIPPortfolioClientProps) {
  const [inv, setInv] = useState(investment)

  const [activeTab, setActiveTab] = useState<'performance' | 'zakat' | 'logs'>('performance')
  const [range, setRange] = useState<RangeKey>('month')

  const [showCreateForm, setShowCreateForm] = useState(false)
  const [showEditForm, setShowEditForm] = useState(false)
  const [showValueForm, setShowValueForm] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [valueForm, setValueForm] = useState<{ date: string; currentValue: string }>({
    date: new Date().toISOString().split('T')[0],
    currentValue: '',
  })

  const [showInvestForm, setShowInvestForm] = useState(false)
  const [investForm, setInvestForm] = useState<{ date: string; amount: string }>({
    date: new Date().toISOString().split('T')[0],
    amount: '',
  })

  const [showHoldingsForm, setShowHoldingsForm] = useState(false)
  const [isSavingHoldings, setIsSavingHoldings] = useState(false)
  const [isSavingZakatBase, setIsSavingZakatBase] = useState(false)

  const [zakatBaseDraft, setZakatBaseDraft] = useState<Record<string, string>>({})

  const [holdingsDraft, setHoldingsDraft] = useState<HoldingDraftRow[]>([])

  const meta = useMemo(() => parseMeta(inv), [inv])

  const investedAmount = Number(meta.investedAmount ?? inv?.principalAmount ?? 0)
  const currentValue = useMemo(() => {
    const history: HistoryItem[] = Array.isArray((meta as any).history) ? ((meta as any).history as HistoryItem[]) : []
    const latest = history
      .filter((h) => typeof h?.action === 'string' && h.action === 'VALUE_UPDATE')
      .map((h) => ({ at: new Date(h.at), value: safeNumber(h.currentValue, NaN) }))
      .filter((x) => !Number.isNaN(x.at.getTime()) && Number.isFinite(x.value))
      .sort((a, b) => a.at.getTime() - b.at.getTime())
      .at(-1)

    if (latest) return latest.value
    return Number((meta as any).currentValue ?? inv?.currentValue ?? 0)
  }, [meta, inv?.currentValue])
  const profit = currentValue - investedAmount
  const returnPct = investedAmount > 0 ? (profit / investedAmount) * 100 : 0

  const transactionLogRows = useMemo(() => {
    const history: any[] = Array.isArray((meta as any).history) ? ((meta as any).history as any[]) : []
    const payments: any[] = Array.isArray((meta as any).zakatPayments) ? ((meta as any).zakatPayments as any[]) : []

    const historyRows = history
      .map((h: any) => {
        const at = new Date(h?.at)
        if (Number.isNaN(at.getTime())) return null
        return {
          key: `h_${String(h?.at || '')}_${String(h?.action || '')}_${String(h?.amount || '')}`,
          at,
          action: String(h?.action || ''),
          amount: safeNumber(h?.amount, 0),
          investedAmount: safeNumber(h?.investedAmount, NaN),
          currentValue: safeNumber(h?.currentValue, NaN),
        }
      })
      .filter((x): x is {
        key: string
        at: Date
        action: string
        amount: number
        investedAmount: number
        currentValue: number
      } => !!x)

    const paymentRows = payments
      .map((p: any) => {
        const at = new Date(p?.date)
        if (Number.isNaN(at.getTime())) return null
        return {
          key: `z_${String(p?.id || '')}`,
          at,
          action: 'ZAKAT_PAID',
          amount: safeNumber(p?.amount, 0),
          investedAmount: NaN,
          currentValue: NaN,
        }
      })
      .filter((x): x is {
        key: string
        at: Date
        action: string
        amount: number
        investedAmount: number
        currentValue: number
      } => !!x)

    return [...historyRows, ...paymentRows]
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, 200)
  }, [meta])

  const points = useMemo(() => {
    const history: HistoryItem[] = Array.isArray(meta.history) ? meta.history : []
    const now = new Date()
    const start = getRangeStart(range, now)

    const parsed = history
      .map((h) => {
        const at = new Date(h.at)
        const value = Number(h.currentValue)
        if (Number.isNaN(at.getTime()) || !Number.isFinite(value)) return null
        return { at, value }
      })
      .filter((x): x is { at: Date; value: number } => !!x)
      .sort((a, b) => a.at.getTime() - b.at.getTime())

    const filtered = start ? parsed.filter((p) => p.at >= start) : parsed

    return filtered
  }, [meta.history, range])

  const zakatBreakdown = useMemo(() => {
    const history: HistoryItem[] = Array.isArray(meta.history) ? meta.history : []
    const valuePoints = history
      .map((h) => {
        const at = new Date(h.at)
        const value = safeNumber(h.currentValue, NaN)
        if (Number.isNaN(at.getTime()) || !Number.isFinite(value)) return null
        const hijriYear = getHijriYear(at)
        if (!hijriYear) return null
        return { hijriYear, at, value }
      })
      .filter((x): x is { hijriYear: number; at: Date; value: number } => !!x)
      .sort((a, b) => a.at.getTime() - b.at.getTime())

    const payments = Array.isArray((meta as any).zakatPayments)
      ? ((meta as any).zakatPayments as any[])
      : []
    const paidByPeriodKey = new Map<string, number>()
    for (const p of payments) {
      const key = typeof p?.periodKey === 'string' ? p.periodKey : ''
      if (!key) continue
      const amount = safeNumber(p?.amount, 0)
      if (amount <= 0) continue
      paidByPeriodKey.set(key, (paidByPeriodKey.get(key) || 0) + amount)
    }

    const zakatBaseByAssetType = (meta.zakatBaseByAssetType || {}) as Record<string, number>
    const holdings = Array.isArray(meta.holdings) ? meta.holdings : []

    const effectiveBasePct = (() => {
      if (!holdings.length) return 0
      const total = holdings.reduce((acc: number, h: any) => acc + Math.max(0, safeNumber(h?.currentValue, 0)), 0)
      if (total <= 0) return 0
      const weighted = holdings.reduce((acc: number, h: any) => {
        const holdingValue = Math.max(0, safeNumber(h?.currentValue, 0))
        const assetType = String(h?.assetType || '')
        const base = safeNumber(zakatBaseByAssetType[assetType], 0)
        const allocationPct = (holdingValue / total) * 100
        return acc + (allocationPct * base) / 100
      }, 0)
      return Math.max(0, Math.min(100, weighted))
    })()

    const rows: ZakatBreakdownRow[] = (() => {
      if (valuePoints.length === 0) return []

      const hawlAnchorAt = (() => {
        const investedDates = history
          .filter((h) => typeof h?.action === 'string' && h.action === 'INVEST')
          .map((h) => new Date(h.at))
          .filter((d) => !Number.isNaN(d.getTime()))
          .sort((a, b) => a.getTime() - b.getTime())

        if (investedDates.length > 0) return investedDates[0]
        return valuePoints[0].at
      })()

      const firstAt = startOfDay(hawlAnchorAt)
      const lastAt = startOfDay(valuePoints[valuePoints.length - 1].at)
      const now = startOfDay(new Date())

      const periods: Array<{ startAt: Date; endAt: Date }> = []
      // Generate rolling Hawl periods (approx lunar year) from the first point.
      // We generate until the last recorded point (and optionally the current in-progress period).
      let cursor = new Date(firstAt)
      while (cursor.getTime() <= lastAt.getTime() || cursor.getTime() <= now.getTime()) {
        const endAt = addDays(cursor, 354)
        periods.push({ startAt: cursor, endAt })
        cursor = addDays(cursor, 354)
        // safety to avoid infinite loops
        if (periods.length > 30) break
        if (cursor.getTime() > now.getTime() && cursor.getTime() > lastAt.getTime()) break
      }

      const getEndPoint = (startAt: Date, endAt: Date) => {
        // last value point within the period (<= endAt)
        for (let i = valuePoints.length - 1; i >= 0; i--) {
          const p = valuePoints[i]
          if (p.at.getTime() > endAt.getTime()) continue
          if (p.at.getTime() < startAt.getTime()) break
          return p
        }
        return null
      }

      const getStartPoint = (startAt: Date, endAt: Date) => {
        // first value point within the period (>= startAt)
        for (let i = 0; i < valuePoints.length; i++) {
          const p = valuePoints[i]
          if (p.at.getTime() < startAt.getTime()) continue
          if (p.at.getTime() > endAt.getTime()) break
          return p
        }
        return null
      }

      return periods
        .map((period) => {
          const startPoint = getStartPoint(period.startAt, period.endAt)
          const endPoint = getEndPoint(period.startAt, period.endAt)
          if (!endPoint || !startPoint) return null

          const hijriYear = getHijriYear(period.startAt)
          if (!hijriYear) return null

          const endValue = endPoint.value
          const zakatable = (endValue * effectiveBasePct) / 100
          const zakatDue = zakatable * 0.025

          const periodKey = `${period.startAt.toISOString().split('T')[0]}_${period.endAt.toISOString().split('T')[0]}`
          const paidAmount = paidByPeriodKey.get(periodKey) || 0
          const completed = now.getTime() >= period.endAt.getTime()
          const dueIfCompleted = completed ? zakatDue : 0
          const dueAfterPayment = Math.max(0, dueIfCompleted - paidAmount)

          return {
            hijriYear,
            startAt: period.startAt,
            startValue: startPoint.value,
            endAt: period.endAt,
            endValue,
            basePct: effectiveBasePct,
            zakatable,
            zakatDue: dueIfCompleted,
            paidAmount,
            dueAfterPayment,
            periodKey,
            canPay: completed && dueAfterPayment > 0,
          } satisfies ZakatBreakdownRow
        })
        .filter((x): x is ZakatBreakdownRow => !!x)
    })()

    return {
      rows,
      effectiveBasePct,
      hasHoldings: holdings.length > 0,
      hasHistory: valuePoints.length > 0,
    }
  }, [meta.history, meta.zakatBaseByAssetType, meta.holdings, (meta as any).zakatPayments])

  const [showZakatPayForm, setShowZakatPayForm] = useState(false)
  const [zakatPayTarget, setZakatPayTarget] = useState<ZakatBreakdownRow | null>(null)
  const [zakatPayAmount, setZakatPayAmount] = useState('')
  const [zakatPayDate, setZakatPayDate] = useState(new Date().toISOString().split('T')[0])
  const [isPayingZakat, setIsPayingZakat] = useState(false)

  const openZakatPay = (row: ZakatBreakdownRow) => {
    setZakatPayTarget(row)
    setZakatPayAmount(row.dueAfterPayment.toFixed(2))
    setZakatPayDate(new Date().toISOString().split('T')[0])
    setShowZakatPayForm(true)
  }

  const submitZakatPay = async (event: FormEvent) => {
    event.preventDefault()
    if (!inv || !zakatPayTarget) return
    const amount = Number(zakatPayAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      alert('Enter a valid amount')
      return
    }
    const date = zakatPayDate ? new Date(zakatPayDate) : new Date()
    if (Number.isNaN(date.getTime())) {
      alert('Invalid date')
      return
    }

    setIsPayingZakat(true)
    try {
      const response = await fetch('/api/sip/pay-zakat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sipId: inv.id,
          periodKey: zakatPayTarget.periodKey,
          periodStartAt: zakatPayTarget.startAt.toISOString(),
          periodEndAt: zakatPayTarget.endAt.toISOString(),
          amount,
          date: date.toISOString(),
        }),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.error || 'Failed to pay zakat')
      }

      const updated = await response.json()
      setInv(updated)
      setShowZakatPayForm(false)
      setZakatPayTarget(null)
    } catch (error) {
      console.error('Pay zakat error:', error)
      alert(error instanceof Error ? error.message : 'Failed to pay zakat')
    } finally {
      setIsPayingZakat(false)
    }
  }

  const holdingsSummary = useMemo(() => {
    const holdings = Array.isArray(meta.holdings) ? meta.holdings : []
    const normalized = holdings
      .map((h: any) => ({
        id: String(h?.id || ''),
        name: String(h?.name || ''),
        assetType: String(h?.assetType || ''),
        cost: Math.max(0, safeNumber(h?.cost, 0)),
        currentValue: Math.max(0, safeNumber(h?.currentValue, 0)),
      }))
      .filter((h: any) => h.assetType)

    const total = normalized.reduce((acc: number, h: any) => acc + h.currentValue, 0)
    const costTotal = normalized.reduce((acc: number, h: any) => acc + h.cost, 0)
    const rows: HoldingRow[] = normalized
      .map((h: any): HoldingRow => ({
        ...h,
        allocationPct: total > 0 ? (h.currentValue / total) * 100 : 0,
      }))
      .sort((a: any, b: any) => b.allocationPct - a.allocationPct)

    return { rows, total, costTotal }
  }, [meta.holdings])

  const latestUpdateLabel = useMemo(() => {
    const history: HistoryItem[] = Array.isArray(meta.history) ? meta.history : []
    const last = history
      .map((h) => ({ at: new Date(h.at) }))
      .filter((x) => !Number.isNaN(x.at.getTime()))
      .sort((a, b) => a.at.getTime() - b.at.getTime())
      .at(-1)

    return last ? formatGregorianAndHijriDate(last.at) : ''
  }, [meta.history])

  const zakatBaseRows = useMemo(() => {
    const base = (meta.zakatBaseByAssetType || {}) as Record<string, number>
    const keys = Object.keys(base)
    const ordered = keys.length
      ? keys
      : [
          'us_stocks',
          'developed_emerging_stocks',
          'local_equity',
          'real_estate',
          'money_market',
          'commodities',
        ]

    return ordered.map((k): ZakatBaseRow => ({
      key: k,
      label: k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      value: Number(base[k] ?? 0),
    }))
  }, [meta.zakatBaseByAssetType])

  const openZakatBaseEditor = () => {
    const next: Record<string, string> = {}
    for (const row of zakatBaseRows) {
      next[row.key] = String(row.value ?? 0)
    }
    setZakatBaseDraft(next)
  }

  const saveZakatBase = async () => {
    if (!inv) return
    setIsSavingZakatBase(true)
    try {
      const payload: Record<string, number> = {}
      for (const [k, v] of Object.entries(zakatBaseDraft)) {
        const n = parseFloat(String(v))
        payload[k] = Number.isFinite(n) ? n : 0
      }

      const response = await fetch('/api/sip/update-zakat-base', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sipId: inv.id, zakatBaseByAssetType: payload }),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.error || 'Failed to save zakat base')
      }

      const updated = await response.json()
      setInv(updated)
    } catch (error) {
      console.error('Save zakat base error:', error)
      alert(error instanceof Error ? error.message : 'Failed to save zakat base')
    } finally {
      setIsSavingZakatBase(false)
    }
  }

  const openValueModal = () => {
    setValueForm({
      date: new Date().toISOString().split('T')[0],
      currentValue: String(currentValue || ''),
    })
    setShowValueForm(true)
  }

  const openInvestModal = () => {
    setInvestForm({
      date: new Date().toISOString().split('T')[0],
      amount: '',
    })
    setShowInvestForm(true)
  }

  const handleSubmitCurrentValue = async (e: FormEvent) => {
    e.preventDefault()
    if (!inv) return

    const value = parseFloat(valueForm.currentValue)
    if (!Number.isFinite(value) || value < 0) {
      return
    }

    setIsLoading(true)
    try {
      const response = await fetch('/api/sip/update-value', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sipId: inv.id, currentValue: value, date: valueForm.date }),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.error || 'Failed to update current value')
      }

      const updated = await response.json()
      setInv(updated)
      setShowValueForm(false)
    } catch (error) {
      console.error('Update value error:', error)
      alert(error instanceof Error ? error.message : 'Failed to update current value')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmitInvest = async (e: FormEvent) => {
    e.preventDefault()
    if (!inv) return

    const amount = parseFloat(investForm.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      return
    }

    setIsLoading(true)
    try {
      const response = await fetch('/api/sip/invest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sipId: inv.id, amount, date: investForm.date }),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.error || 'Failed to invest')
      }

      const updated = await response.json()
      setInv(updated)
      setShowInvestForm(false)
    } catch (error) {
      console.error('Invest error:', error)
      alert(error instanceof Error ? error.message : 'Failed to invest')
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreate = async (data: CreateSipInput) => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/sip/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.error || 'Failed to create SIP portfolio')
      }
      const created = await response.json()
      setInv(created)
      setShowCreateForm(false)
    } finally {
      setIsLoading(false)
    }
  }

  const handleEdit = async (data: CreateSipInput) => {
    if (!inv) return
    setIsLoading(true)
    try {
      const response = await fetch(`/api/sip/${inv.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.error || 'Failed to update SIP portfolio')
      }
      const updated = await response.json()
      setInv(updated)
      setShowEditForm(false)
    } finally {
      setIsLoading(false)
    }
  }

  const handleInvest = () => {
    if (!inv) return
    openInvestModal()
  }

  const handleDelete = async () => {
    if (!inv) return
    const confirmed = window.confirm('Delete SIP portfolio? This cannot be undone.')
    if (!confirmed) return

    try {
      const response = await fetch(`/api/sip/${inv.id}`, { method: 'DELETE' })
      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.error || 'Failed to delete')
      }
      setInv(undefined)
    } catch (error) {
      console.error('Delete error:', error)
      alert(error instanceof Error ? error.message : 'Failed to delete')
    }
  }

  if (!inv) {
    return (
      <div className="space-y-6">
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-xl shadow-md p-6 text-white">
          <h1 className="text-2xl font-bold">SIP Portfolio</h1>
          <p className="text-sm text-slate-300 mt-1">Create your portfolio to start tracking deposits, value updates, and zakat.</p>
          {userRole === 'OWNER' && (
            <div className="mt-4">
              <button
                onClick={() => setShowCreateForm(true)}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm font-semibold"
              >
                + Create SIP Portfolio
              </button>
            </div>
          )}
        </div>

        {showCreateForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-gray-900">Create SIP Portfolio</h2>
                <button onClick={() => setShowCreateForm(false)} className="text-gray-400 hover:text-gray-600">✕</button>
              </div>
              <SIPForm onSubmit={handleCreate} onCancel={() => setShowCreateForm(false)} isLoading={isLoading} />
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="bg-gradient-to-r from-indigo-700 via-purple-700 to-violet-800 rounded-2xl shadow-md p-6 text-white">
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="text-xs text-white/80">Portfolio Value</div>
            <div className="text-3xl font-extrabold mt-1 tabular-nums">{formatCurrency(currentValue)}</div>
            <div className="mt-2 text-sm text-white/80">
              <span className={`font-semibold ${profit >= 0 ? 'text-emerald-200' : 'text-red-200'}`}>
                {profit >= 0 ? '+' : '-'}{formatCurrency(Math.abs(profit))}
              </span>
              <span className="ml-2">({returnPct >= 0 ? '+' : ''}{returnPct.toFixed(2)}%)</span>
            </div>
            <div className="mt-3 text-xs text-white/80">
              <div>
                <span className="text-white/70">Started:</span> {formatGregorianAndHijriDate(inv.startDate) || '-'}
              </div>
              <div className="mt-1">
                <span className="text-white/70">Last update:</span> {latestUpdateLabel || '-'}
              </div>
            </div>
          </div>

          {userRole === 'OWNER' && (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button onClick={handleInvest} className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/15 border border-white/15 text-sm font-semibold">
                + Invest
              </button>
              <button onClick={openValueModal} className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/15 border border-white/15 text-sm font-semibold">
                Update Value
              </button>
              <button onClick={() => setShowEditForm(true)} className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/15 border border-white/15 text-sm font-semibold">
                Edit
              </button>
              <button onClick={handleDelete} className="px-4 py-2 rounded-full bg-red-500/20 hover:bg-red-500/30 border border-red-200/30 text-sm font-semibold">
                Delete
              </button>
            </div>
          )}
        </div>

        <div className="mt-5 rounded-xl bg-white/10 border border-white/10 overflow-hidden">
          <div className="p-3">
            <LineChart points={points} />
          </div>
          <div className="px-3 pb-3">
            <div className="grid grid-cols-4 gap-2 bg-white/10 p-1 rounded-full">
              {([
                { key: 'week', label: 'Week' },
                { key: 'month', label: 'Month' },
                { key: 'year', label: 'Year' },
                { key: 'all', label: 'All' },
              ] as const).map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setRange(opt.key)}
                  className={`rounded-full py-1.5 text-xs font-semibold transition-colors ${
                    range === opt.key ? 'bg-white text-slate-900' : 'text-white/90 hover:bg-white/10'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex flex-wrap items-center gap-2">
          {([
            { key: 'performance', label: 'Performance' },
            { key: 'zakat', label: 'Zakat & Purif.' },
            { key: 'logs', label: 'Logs' },
          ] as const).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
                activeTab === tab.key ? 'bg-slate-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'performance' && (
          <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-xl border border-gray-200 p-4">
              <div className="text-xs text-gray-500">Average Purchase Cost</div>
              <div className="mt-1 font-bold text-gray-900 tabular-nums">{formatCurrency(investedAmount)}</div>
            </div>
            <div className="rounded-xl border border-gray-200 p-4">
              <div className="text-xs text-gray-500">Unrealized Profit</div>
              <div className={`mt-1 font-bold tabular-nums ${profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {profit >= 0 ? '+' : '-'}{formatCurrency(Math.abs(profit))}
              </div>
            </div>
            <div className="rounded-xl border border-gray-200 p-4">
              <div className="text-xs text-gray-500">Simple Return</div>
              <div className={`mt-1 font-bold tabular-nums ${returnPct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {returnPct >= 0 ? '+' : ''}{returnPct.toFixed(2)}%
              </div>
            </div>

            <div className="md:col-span-3 rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-bold text-gray-900">Holdings & Allocation</div>
                  <div className="text-xs text-gray-500 mt-1">Allocation % is derived from holding values.</div>
                </div>
                {userRole === 'OWNER' && (
                  <button
                    type="button"
                    onClick={openHoldingsEditor}
                    className="px-3 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 text-sm font-semibold"
                  >
                    Edit Holdings
                  </button>
                )}
              </div>

              {holdingsSummary.rows.length === 0 ? (
                <div className="mt-4 text-sm text-gray-600">No holdings yet.</div>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wider text-gray-500">
                        <th className="py-2 pr-4">Holding</th>
                        <th className="py-2 pr-4">Asset Type</th>
                        <th className="py-2 pr-4 text-right">Cost</th>
                        <th className="py-2 pr-4 text-right">Value</th>
                        <th className="py-2 text-right">Allocation</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {holdingsSummary.rows.map((h: HoldingRow) => (
                        <tr key={h.id || `${h.assetType}-${h.name}`}>
                          <td className="py-3 pr-4 font-medium text-gray-900 whitespace-nowrap">{h.name || '-'}</td>
                          <td className="py-3 pr-4 text-gray-700 whitespace-nowrap">{h.assetType}</td>
                          <td className="py-3 pr-4 text-right tabular-nums text-gray-900 whitespace-nowrap">{formatCurrency(h.cost)}</td>
                          <td className="py-3 pr-4 text-right tabular-nums text-gray-900 whitespace-nowrap">{formatCurrency(h.currentValue)}</td>
                          <td className="py-3 text-right tabular-nums text-gray-900 whitespace-nowrap">{h.allocationPct.toFixed(2)}%</td>
                        </tr>
                      ))}
                      <tr>
                        <td className="py-3 pr-4 font-semibold text-gray-900" colSpan={2}>Total</td>
                        <td className="py-3 pr-4 text-right tabular-nums font-semibold text-gray-900 whitespace-nowrap">{formatCurrency(holdingsSummary.costTotal)}</td>
                        <td className="py-3 pr-4 text-right tabular-nums font-semibold text-gray-900 whitespace-nowrap">{formatCurrency(holdingsSummary.total)}</td>
                        <td className="py-3 text-right tabular-nums font-semibold text-gray-900 whitespace-nowrap">100.00%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="mt-6 rounded-xl border border-gray-200 p-4">
            <div className="text-sm font-bold text-gray-900">Transaction Log</div>
            <div className="mt-2 text-sm text-gray-600">
              {transactionLogRows.length > 0 ? 'Latest 200 events.' : 'No history yet.'}
            </div>

            {transactionLogRows.length > 0 && (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wider text-gray-500">
                      <th className="py-2 pr-4">Date</th>
                      <th className="py-2 pr-4">Action</th>
                      <th className="py-2 pr-4 text-right">Amount</th>
                      <th className="py-2 pr-4 text-right">Invested</th>
                      <th className="py-2 text-right">Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {transactionLogRows.map((r) => (
                      <tr key={r.key}>
                        <td className="py-3 pr-4 text-gray-700 whitespace-nowrap">{formatGregorianAndHijriDate(r.at) || '-'}</td>
                        <td className="py-3 pr-4 font-semibold text-gray-900 whitespace-nowrap">{r.action || '-'}</td>
                        <td className="py-3 pr-4 text-right tabular-nums text-gray-900 whitespace-nowrap">{r.amount ? formatCurrency(r.amount) : '-'}</td>
                        <td className="py-3 pr-4 text-right tabular-nums text-gray-900 whitespace-nowrap">{Number.isFinite(r.investedAmount) ? formatCurrency(r.investedAmount) : '-'}</td>
                        <td className="py-3 text-right tabular-nums text-gray-900 whitespace-nowrap">{Number.isFinite(r.currentValue) ? formatCurrency(r.currentValue) : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'zakat' && (
          <div className="mt-6 space-y-4">
            <div className="rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-bold text-gray-900">Zakat Base % (by Asset Type)</div>
                  <div className="text-xs text-gray-500 mt-1">Edit these percentages when your scholar guidance changes.</div>
                </div>
                {userRole === 'OWNER' && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={openZakatBaseEditor}
                      className="px-3 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 text-sm font-semibold"
                    >
                      Reset
                    </button>
                    <button
                      type="button"
                      onClick={saveZakatBase}
                      disabled={isSavingZakatBase}
                      className="px-3 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 text-sm font-semibold"
                    >
                      {isSavingZakatBase ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                )}
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wider text-gray-500">
                      <th className="py-2 pr-4">Asset Type</th>
                      <th className="py-2">Zakat Base %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {zakatBaseRows.map((row: ZakatBaseRow) => {
                      const draftValue = zakatBaseDraft[row.key]
                      const shown = typeof draftValue === 'string' ? draftValue : String(row.value ?? 0)
                      return (
                        <tr key={row.key}>
                          <td className="py-3 pr-4 font-medium text-gray-900 whitespace-nowrap">{row.label}</td>
                          <td className="py-3">
                            {userRole === 'OWNER' ? (
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  min="0"
                                  max="100"
                                  step="0.01"
                                  value={shown}
                                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                                    setZakatBaseDraft((prev: Record<string, string>) => ({
                                      ...prev,
                                      [row.key]: e.target.value,
                                    }))
                                  }
                                  className="w-28 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                                />
                                <span className="text-gray-500">%</span>
                              </div>
                            ) : (
                              <span className="text-gray-700 tabular-nums">{Number(row.value ?? 0).toFixed(2)}%</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 p-4 text-sm text-gray-600">
              <div className="text-sm font-bold text-gray-900">Hijri Yearly (Hawl) Breakdown</div>
              <div className="mt-2 text-sm text-gray-600">
                {zakatBreakdown.hasHistory
                  ? 'This uses your value history and calculates zakat based on the end-of-year value.'
                  : 'Add value updates to generate yearly zakat breakdown.'}
              </div>

              {!zakatBreakdown.hasHoldings && (
                <div className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                  Effective zakat base is currently 0% because holdings/allocations are not set yet.
                </div>
              )}

              {zakatBreakdown.rows.length > 0 && (
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wider text-gray-500">
                        <th className="py-2 pr-4">Hijri Year</th>
                        <th className="py-2 pr-4">Start</th>
                        <th className="py-2 pr-4">End</th>
                        <th className="py-2 pr-4">Base %</th>
                        <th className="py-2 pr-4 text-right">End Value</th>
                        <th className="py-2 pr-4 text-right">Zakatable</th>
                        <th className="py-2 pr-4 text-right">Zakat (2.5%)</th>
                        <th className="py-2 pr-4 text-right">Paid</th>
                        <th className="py-2 text-right">Zakat Due</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {zakatBreakdown.rows.map((r: ZakatBreakdownRow) => (
                        <tr key={r.periodKey}>
                          <td className="py-3 pr-4 font-semibold text-gray-900 whitespace-nowrap">{r.hijriYear}</td>
                          <td className="py-3 pr-4 text-gray-700 whitespace-nowrap">{formatGregorianAndHijriDate(r.startAt) || '-'}</td>
                          <td className="py-3 pr-4 text-gray-700 whitespace-nowrap">{formatGregorianAndHijriDate(r.endAt) || '-'}</td>
                          <td className="py-3 pr-4 text-gray-700 tabular-nums whitespace-nowrap">{r.basePct.toFixed(2)}%</td>
                          <td className="py-3 pr-4 text-right tabular-nums text-gray-900 whitespace-nowrap">{formatCurrency(r.endValue)}</td>
                          <td className="py-3 pr-4 text-right tabular-nums text-gray-900 whitespace-nowrap">{formatCurrency(r.zakatable)}</td>
                          <td className="py-3 pr-4 text-right tabular-nums text-gray-900 whitespace-nowrap">{formatCurrency(r.zakatDue)}</td>
                          <td className="py-3 pr-4 text-right tabular-nums text-gray-900 whitespace-nowrap">{formatCurrency(r.paidAmount)}</td>
                          <td className="py-3 text-right tabular-nums font-semibold text-gray-900 whitespace-nowrap">
                            <div className="flex items-center justify-end gap-2">
                              <span>{formatCurrency(r.dueAfterPayment)}</span>
                              {userRole === 'OWNER' && r.canPay && (
                                <button
                                  type="button"
                                  onClick={() => openZakatPay(r)}
                                  className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                                >
                                  Pay
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {showZakatPayForm && zakatPayTarget && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-900">Pay Zakat</h2>
              <button
                onClick={() => (isPayingZakat ? null : setShowZakatPayForm(false))}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={submitZakatPay} className="space-y-4">
              <div className="text-sm text-gray-600">
                Period: {formatGregorianAndHijriDate(zakatPayTarget.startAt)} → {formatGregorianAndHijriDate(zakatPayTarget.endAt)}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Date</label>
                <input
                  type="date"
                  value={zakatPayDate}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setZakatPayDate(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Amount</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={zakatPayAmount}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setZakatPayAmount(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowZakatPayForm(false)}
                  disabled={isPayingZakat}
                  className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPayingZakat}
                  className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {isPayingZakat ? 'Paying...' : 'Pay'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showEditForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-900">Edit SIP Portfolio</h2>
              <button onClick={() => setShowEditForm(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <SIPForm
              onSubmit={handleEdit}
              onCancel={() => setShowEditForm(false)}
              isLoading={isLoading}
              initialData={{
                accountId: inv.account?.id,
                name: inv.name,
                startDate: new Date(inv.startDate).toISOString().split('T')[0],
                notes: inv.notes || '',
              }}
            />
          </div>
        </div>
      )}

      {showInvestForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-900">Invest</h2>
              <button onClick={() => setShowInvestForm(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>

            <form onSubmit={handleSubmitInvest} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Date</label>
                <input
                  type="date"
                  value={investForm.date}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setInvestForm((prev: { date: string; amount: string }) => ({ ...prev, date: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Amount (SAR)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={investForm.amount}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setInvestForm((prev: { date: string; amount: string }) => ({ ...prev, amount: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  required
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setShowInvestForm(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isLoading ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showValueForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-900">Update Current Value</h2>
              <button onClick={() => setShowValueForm(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>

            <form onSubmit={handleSubmitCurrentValue} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Date</label>
                <input
                  type="date"
                  value={valueForm.date}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setValueForm((prev: { date: string; currentValue: string }) => ({ ...prev, date: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Current Value (SAR)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={valueForm.currentValue}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setValueForm((prev: { date: string; currentValue: string }) => ({ ...prev, currentValue: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  required
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setShowValueForm(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isLoading ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showHoldingsForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-900">Edit Holdings</h2>
              <button onClick={() => setShowHoldingsForm(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>

            <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
              <div className="font-semibold text-gray-900">How this works</div>
              <div className="mt-1">
                - Holdings values represent your <span className="font-semibold">current market value</span> breakdown.
              </div>
              <div className="mt-1">
                - Invested amount is your <span className="font-semibold">cost basis</span> (can be different).
              </div>
            </div>

            <div className="flex justify-end mb-3">
              <button
                type="button"
                onClick={addHoldingDraft}
                className="px-3 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 text-sm font-semibold"
              >
                + Add Holding
              </button>
            </div>

            <div className="space-y-3">
              {holdingsDraft.length === 0 ? (
                <div className="text-sm text-gray-600">No holdings added yet.</div>
              ) : (
                holdingsDraft.map((h: HoldingDraftRow, idx: number) => (
                  <div key={h.id} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end border border-gray-200 rounded-xl p-4">
                    <div className="md:col-span-4">
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Name</label>
                      <input
                        value={h.name}
                        onChange={(e: ChangeEvent<HTMLInputElement>) =>
                          setHoldingsDraft((prev: HoldingDraftRow[]) =>
                            prev.map((x: HoldingDraftRow) => (x.id === h.id ? { ...x, name: e.target.value } : x))
                          )
                        }
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                        placeholder="e.g., SPUS / REIT / Cash"
                      />
                    </div>

                    <div className="md:col-span-3">
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Asset Type</label>
                      <select
                        value={h.assetType}
                        onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                          setHoldingsDraft((prev: HoldingDraftRow[]) =>
                            prev.map((x: HoldingDraftRow) => (x.id === h.id ? { ...x, assetType: e.target.value } : x))
                          )
                        }
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                      >
                        <option value="us_stocks">US Stocks</option>
                        <option value="developed_emerging_stocks">Developed/Emerging Stocks</option>
                        <option value="local_equity">Local Equity</option>
                        <option value="real_estate">Real Estate</option>
                        <option value="money_market">Money Market</option>
                        <option value="commodities">Commodities</option>
                      </select>
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Cost (SAR)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={h.cost}
                        onChange={(e: ChangeEvent<HTMLInputElement>) =>
                          setHoldingsDraft((prev: HoldingDraftRow[]) =>
                            prev.map((x: HoldingDraftRow) => (x.id === h.id ? { ...x, cost: e.target.value } : x))
                          )
                        }
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Current Value (SAR)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={h.currentValue}
                        onChange={(e: ChangeEvent<HTMLInputElement>) =>
                          setHoldingsDraft((prev: HoldingDraftRow[]) =>
                            prev.map((x: HoldingDraftRow) => (x.id === h.id ? { ...x, currentValue: e.target.value } : x))
                          )
                        }
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                      />
                    </div>

                    <div className="md:col-span-1 flex justify-end">
                      <button
                        type="button"
                        onClick={() => removeHoldingDraft(h.id)}
                        className="px-3 py-2 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 text-sm font-semibold"
                      >
                        Remove
                      </button>
                    </div>

                    <div className="md:col-span-12 text-xs text-gray-500">
                      Holding #{idx + 1}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end gap-2 pt-6 border-t mt-6">
              <button
                type="button"
                onClick={() => setShowHoldingsForm(false)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSavingHoldings}
                onClick={saveHoldings}
                className="px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSavingHoldings ? 'Saving...' : 'Save Holdings'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
