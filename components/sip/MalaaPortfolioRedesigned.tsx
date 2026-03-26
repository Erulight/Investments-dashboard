'use client'

import { useMemo, useState, type FormEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { SIPForm } from './SIPForm'
import { FoxMascot } from './FoxMascot'
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

interface MalaaPortfolioRedesignedProps {
  investment?: Investment
  userRole: string
}

type RangeKey = 'week' | 'month' | 'year' | 'all'

type HistoryItem = {
  at: string
  action: string
  currentValue?: number
  investedAmount?: number
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
  return `${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ﷼`
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

const getRangeStart = (range: RangeKey, now: Date) => {
  const n = startOfDay(now)
  if (range === 'week') return new Date(n.getTime() - 7 * 24 * 60 * 60 * 1000)
  if (range === 'month') return new Date(n.getTime() - 30 * 24 * 60 * 60 * 1000)
  if (range === 'year') return new Date(n.getTime() - 365 * 24 * 60 * 60 * 1000)
  return null
}

const addDays = (date: Date, days: number) => {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
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

function NeonLineChart({ points, range }: { points: { at: Date; value: number; action: string }[]; range: RangeKey }) {
  const [hoveredPoint, setHoveredPoint] = useState<number | null>(null)
  const width = 900
  const height = 300
  const padX = 40
  const padY = 30

  if (!points || points.length < 2) {
    return (
      <div className="h-[300px] flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <div className="text-6xl mb-4">📈</div>
          <p className="text-slate-400 text-sm">Add value updates to see your portfolio dance!</p>
        </motion.div>
      </div>
    )
  }

  const values = points.map((p) => p.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range_val = Math.max(0.000001, max - min)

  const x0 = points[0].at.getTime()
  const x1 = points[points.length - 1].at.getTime()
  const xRange = Math.max(1, x1 - x0)

  const coords = points.map((p) => {
    const x = padX + ((p.at.getTime() - x0) / xRange) * (width - padX * 2)
    const y = padY + (1 - (p.value - min) / range_val) * (height - padY * 2)
    return { x, y, value: p.value, date: p.at, action: p.action }
  })

  const d = coords
    .map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(2)} ${c.y.toFixed(2)}`)
    .join(' ')

  const area = `${d} L ${(width - padX).toFixed(2)} ${(height - padY).toFixed(2)} L ${padX.toFixed(2)} ${(height - padY).toFixed(2)} Z`

  const up = values[values.length - 1] >= values[0]
  const neonColor = up ? '#10b981' : '#ef4444'
  const glowColor = up ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.4)'

  return (
    <div className="relative h-[300px] overflow-hidden rounded-xl">
      {/* Grid lines */}
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} className="absolute inset-0">
        <defs>
          <linearGradient id="chartGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={neonColor} stopOpacity="0.3" />
            <stop offset="100%" stopColor={neonColor} stopOpacity="0.05" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Horizontal grid */}
        {[0, 1, 2, 3, 4].map((i) => (
          <line
            key={`h-${i}`}
            x1={padX}
            y1={padY + (i * (height - padY * 2)) / 4}
            x2={width - padX}
            y2={padY + (i * (height - padY * 2)) / 4}
            stroke="rgba(148,163,184,0.1)"
            strokeWidth="1"
          />
        ))}

        {/* Area fill */}
        <motion.path
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1 }}
          d={area}
          fill="url(#chartGradient)"
        />

        {/* Main line with glow */}
        <motion.path
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.5, ease: 'easeInOut' }}
          d={d}
          fill="none"
          stroke={neonColor}
          strokeWidth="3"
          strokeLinecap="round"
          filter="url(#glow)"
        />

        {/* Animated gradient line overlay */}
        <motion.path
          d={d}
          fill="none"
          stroke="url(#lineGradient)"
          strokeWidth="3"
          strokeLinecap="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: [0, 1, 0.8] }}
          transition={{ duration: 2, ease: 'easeOut' }}
        />

        <defs>
          <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={neonColor} stopOpacity="0.2" />
            <stop offset="50%" stopColor={neonColor} stopOpacity="1" />
            <stop offset="100%" stopColor={neonColor} stopOpacity="0.2" />
          </linearGradient>
        </defs>

        {/* Data points with hover interaction */}
        {coords.map((coord, i) => (
          <motion.g
            key={i}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.5 + i * 0.05, duration: 0.3 }}
            style={{ cursor: 'pointer', pointerEvents: 'all' }}
          >
            {/* Invisible larger hit area for easier hovering */}
            <circle
              cx={coord.x}
              cy={coord.y}
              r="15"
              fill="transparent"
              onMouseEnter={() => setHoveredPoint(i)}
              onMouseLeave={() => setHoveredPoint(null)}
              style={{ pointerEvents: 'all' }}
            />
            <circle
              cx={coord.x}
              cy={coord.y}
              r={hoveredPoint === i ? "10" : "6"}
              fill={neonColor}
              opacity="0.3"
              className="transition-all duration-200"
              style={{ pointerEvents: 'none' }}
            />
            <motion.circle
              cx={coord.x}
              cy={coord.y}
              r={hoveredPoint === i ? "6" : "4"}
              fill={neonColor}
              animate={{
                scale: i === coords.length - 1 || hoveredPoint === i ? [1, 1.3, 1] : 1,
              }}
              transition={{
                duration: 2,
                repeat: i === coords.length - 1 || hoveredPoint === i ? Infinity : 0,
                ease: 'easeInOut',
              }}
              className="transition-all duration-200"
              style={{ pointerEvents: 'none' }}
            />
          </motion.g>
        ))}

        {/* Value labels */}
        <text x={padX} y={padY - 10} fill="#94a3b8" fontSize="12" fontWeight="500">
          {formatCurrency(max)}
        </text>
        <text x={padX} y={height - padY + 20} fill="#94a3b8" fontSize="12" fontWeight="500">
          {formatCurrency(min)}
        </text>
      </svg>

      {/* Pulsing glow effect */}
      <motion.div
        className="absolute inset-0 rounded-xl"
        style={{
          background: `radial-gradient(circle at ${coords[coords.length - 1]?.x || 50}px ${coords[coords.length - 1]?.y || 50}px, ${glowColor} 0%, transparent 60%)`,
        }}
        animate={{
          opacity: [0.3, 0.6, 0.3],
        }}
        transition={{
          duration: 5,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Interactive tooltip */}
      {hoveredPoint !== null && coords[hoveredPoint] && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: 10 }}
          transition={{ duration: 0.2 }}
          className="absolute pointer-events-none z-10"
          style={{
            left: `${(coords[hoveredPoint].x / width) * 100}%`,
            top: `${(coords[hoveredPoint].y / height) * 100}%`,
            transform: 'translate(-50%, -120%)',
          }}
        >
          <div className="relative">
            {/* Neon glow background */}
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/40 to-purple-500/40 blur-xl rounded-lg" />
            
            {/* Tooltip content */}
            <div className="relative bg-slate-900/95 backdrop-blur-xl border-2 border-cyan-400/50 rounded-lg px-4 py-3 shadow-2xl">
              <div className="flex flex-col gap-1">
                <div className="text-xs font-bold text-cyan-400 uppercase tracking-wider">
                  {coords[hoveredPoint].date.toLocaleDateString('en-US', { 
                    month: 'short', 
                    day: 'numeric', 
                    year: 'numeric' 
                  })}
                </div>
                <div className="text-[10px] text-emerald-400 font-semibold uppercase">
                  {coords[hoveredPoint].action.replace(/_/g, ' ')}
                </div>
                <div className="text-lg font-bold text-white tabular-nums">
                  {formatCurrency(coords[hoveredPoint].value)}
                </div>
              </div>
              
              {/* Arrow pointing down */}
              <div className="absolute left-1/2 -bottom-2 w-4 h-4 bg-slate-900 border-r-2 border-b-2 border-cyan-400/50 transform rotate-45 -translate-x-1/2" />
            </div>
          </div>
        </motion.div>
      )}
    </div>
  )
}

export default function MalaaPortfolioRedesigned({ investment, userRole }: MalaaPortfolioRedesignedProps) {
  const [inv, setInv] = useState(investment)
  const [activeTab, setActiveTab] = useState<'performance' | 'zakat' | 'logs'>('performance')
  const [range, setRange] = useState<RangeKey>('month')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [showEditForm, setShowEditForm] = useState(false)
  const [showValueForm, setShowValueForm] = useState(false)
  const [showInvestForm, setShowInvestForm] = useState(false)
  const [showHoldingsForm, setShowHoldingsForm] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isSavingHoldings, setIsSavingHoldings] = useState(false)
  const [isSavingZakatBase, setIsSavingZakatBase] = useState(false)
  const [valueForm, setValueForm] = useState<{ date: string; currentValue: string }>({
    date: new Date().toISOString().split('T')[0],
    currentValue: '',
  })
  const [investForm, setInvestForm] = useState<{ date: string; amount: string }>({
    date: new Date().toISOString().split('T')[0],
    amount: '',
  })
  const [holdingsDraft, setHoldingsDraft] = useState<HoldingDraftRow[]>([])
  const [zakatBaseDraft, setZakatBaseDraft] = useState<Record<string, string>>({})
  const [showZakatPayForm, setShowZakatPayForm] = useState(false)
  const [zakatPayTarget, setZakatPayTarget] = useState<ZakatBreakdownRow | null>(null)
  const [zakatPayAmount, setZakatPayAmount] = useState('')
  const [zakatPayDate, setZakatPayDate] = useState(new Date().toISOString().split('T')[0])
  const [isPayingZakat, setIsPayingZakat] = useState(false)

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

  const points = useMemo(() => {
    const history: HistoryItem[] = Array.isArray(meta.history) ? meta.history : []
    const now = new Date()
    const start = getRangeStart(range, now)

    const parsed = history
      .map((h) => {
        const at = new Date(h.at)
        const value = Number(h.currentValue)
        const action = String(h.action || '')
        if (Number.isNaN(at.getTime()) || !Number.isFinite(value)) return null
        return { at, value, action }
      })
      .filter((x): x is { at: Date; value: number; action: string } => !!x)
      .sort((a, b) => a.at.getTime() - b.at.getTime())

    const filtered = start ? parsed.filter((p) => p.at >= start) : parsed
    return filtered
  }, [meta.history, range])

  const latestUpdateLabel = useMemo(() => {
    const history: HistoryItem[] = Array.isArray(meta.history) ? meta.history : []
    const last = history
      .map((h) => ({ at: new Date(h.at) }))
      .filter((x) => !Number.isNaN(x.at.getTime()))
      .sort((a, b) => a.at.getTime() - b.at.getTime())
      .at(-1)

    return last ? formatGregorianAndHijriDate(last.at) : ''
  }, [meta.history])

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
      let cursor = new Date(firstAt)
      while (cursor.getTime() <= lastAt.getTime() || cursor.getTime() <= now.getTime()) {
        const endAt = addDays(cursor, 354)
        periods.push({ startAt: cursor, endAt })
        cursor = addDays(cursor, 354)
        if (periods.length > 30) break
        if (cursor.getTime() > now.getTime() && cursor.getTime() > lastAt.getTime()) break
      }

      const getEndPoint = (startAt: Date, endAt: Date) => {
        for (let i = valuePoints.length - 1; i >= 0; i--) {
          const p = valuePoints[i]
          if (p.at.getTime() > endAt.getTime()) continue
          if (p.at.getTime() < startAt.getTime()) break
          return p
        }
        return null
      }

      const getStartPoint = (startAt: Date, endAt: Date) => {
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

  const openHoldingsEditor = () => {
    const holdings = Array.isArray((meta as any).holdings) ? ((meta as any).holdings as any[]) : []
    const next: HoldingDraftRow[] = holdings
      .map((h: any): HoldingDraftRow => ({
        id: typeof h?.id === 'string' && h.id ? h.id : crypto.randomUUID(),
        name: String(h?.name || ''),
        assetType: String(h?.assetType || ''),
        cost: String(safeNumber(h?.cost, 0)),
        currentValue: String(safeNumber(h?.currentValue, 0)),
      }))
      .filter((h) => h.assetType)

    setHoldingsDraft(next)
    setShowHoldingsForm(true)
  }

  const addHoldingDraft = () => {
    setHoldingsDraft((prev: HoldingDraftRow[]) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name: '',
        assetType: 'us_stocks',
        cost: '0',
        currentValue: '0',
      },
    ])
  }

  const removeHoldingDraft = (id: string) => {
    setHoldingsDraft((prev: HoldingDraftRow[]) => prev.filter((h: HoldingDraftRow) => h.id !== id))
  }

  const saveHoldings = async () => {
    if (!inv) return
    if (isSavingHoldings) return

    setIsSavingHoldings(true)
    try {
      const payload = holdingsDraft.map((h: HoldingDraftRow) => ({
        id: h.id,
        name: String(h.name || '').trim(),
        assetType: String(h.assetType || '').trim(),
        cost: Math.max(0, Number(h.cost) || 0),
        currentValue: Math.max(0, Number(h.currentValue) || 0),
      }))

      const response = await fetch('/api/sip/update-holdings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sipId: inv.id, holdings: payload }),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.error || 'Failed to save holdings')
      }

      const updated = await response.json()
      setInv(updated)
      setShowHoldingsForm(false)
    } catch (error) {
      console.error('Save holdings error:', error)
      alert(error instanceof Error ? error.message : 'Failed to save holdings')
    } finally {
      setIsSavingHoldings(false)
    }
  }

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

  const handleSubmitCurrentValue = async (e: FormEvent) => {
    e.preventDefault()
    if (!inv) return

    const value = parseFloat(valueForm.currentValue)
    if (!Number.isFinite(value) || value < 0) return

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
    if (!Number.isFinite(amount) || amount <= 0) return

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
        throw new Error(error.error || 'Failed to create portfolio')
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
        throw new Error(error.error || 'Failed to update portfolio')
      }
      const updated = await response.json()
      setInv(updated)
      setShowEditForm(false)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!inv) return
    const confirmed = window.confirm('Delete Malaa portfolio? This cannot be undone.')
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
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950 to-slate-950 p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-4xl mx-auto"
        >
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-purple-900/40 via-violet-900/40 to-fuchsia-900/40 border border-purple-500/20 p-12 backdrop-blur-xl">
            {/* Neon glow */}
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 via-transparent to-fuchsia-500/10" />
            <motion.div
              className="absolute -top-24 -right-24 w-48 h-48 bg-purple-500/30 rounded-full blur-3xl"
              animate={{
                scale: [1, 1.2, 1],
                opacity: [0.3, 0.5, 0.3],
              }}
              transition={{
                duration: 6,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />
            
            <div className="relative z-10 text-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', duration: 0.8 }}
                className="text-8xl mb-6"
              >
                🦊
              </motion.div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-400 via-fuchsia-400 to-pink-400 bg-clip-text text-transparent mb-4">
                Malaa Portfolio
              </h1>
              <p className="text-slate-300 text-lg mb-8">
                Track your investments with style 💰✨
              </p>
              {userRole === 'OWNER' && (
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setShowCreateForm(true)}
                  className="px-8 py-4 bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white rounded-full font-bold text-lg shadow-xl shadow-purple-500/50 hover:shadow-purple-500/70 transition-all"
                >
                  + Create Portfolio
                </motion.button>
              )}
            </div>
          </div>
        </motion.div>

        <AnimatePresence>
          {showCreateForm && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
              onClick={() => setShowCreateForm(false)}
            >
              <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-slate-900 border border-purple-500/30 rounded-2xl p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl"
              >
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-2xl font-bold text-white">Create Malaa Portfolio</h2>
                  <button
                    onClick={() => setShowCreateForm(false)}
                    className="text-slate-400 hover:text-white transition-colors text-2xl"
                  >
                    ✕
                  </button>
                </div>
                <SIPForm onSubmit={handleCreate} onCancel={() => setShowCreateForm(false)} isLoading={isLoading} />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950 to-slate-950 p-6">
      <FoxMascot profit={profit} isLoading={isLoading} />
      
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Hero Section */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-purple-900/40 via-violet-900/40 to-fuchsia-900/40 border border-purple-500/20 p-8 backdrop-blur-xl"
        >
          {/* Animated neon glow */}
          <motion.div
            className="absolute -top-24 -right-24 w-96 h-96 bg-purple-500/30 rounded-full blur-3xl"
            animate={{
              scale: [1, 1.3, 1],
              opacity: [0.2, 0.4, 0.2],
            }}
            transition={{
              duration: 8,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
          <motion.div
            className="absolute -bottom-24 -left-24 w-96 h-96 bg-fuchsia-500/20 rounded-full blur-3xl"
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.2, 0.3, 0.2],
            }}
            transition={{
              duration: 6,
              repeat: Infinity,
              ease: 'easeInOut',
              delay: 1,
            }}
          />

          <div className="relative z-10">
            <div className="flex items-start justify-between gap-8 flex-wrap">
              <div className="flex-1 min-w-[300px]">
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  <div className="text-sm text-purple-300 font-medium mb-2">💰 Portfolio Value</div>
                  <div className="text-5xl font-black text-white mb-4 tabular-nums tracking-tight">
                    {formatCurrency(currentValue)}
                  </div>
                  
                  <div className="flex items-center gap-4 flex-wrap">
                    <motion.div
                      className={`px-4 py-2 rounded-full ${
                        profit >= 0
                          ? 'bg-emerald-500/20 border border-emerald-500/30'
                          : 'bg-red-500/20 border border-red-500/30'
                      }`}
                      animate={{
                        boxShadow: profit >= 0
                          ? ['0 0 0px rgba(16,185,129,0.3)', '0 0 20px rgba(16,185,129,0.5)', '0 0 0px rgba(16,185,129,0.3)']
                          : ['0 0 0px rgba(239,68,68,0.3)', '0 0 20px rgba(239,68,68,0.5)', '0 0 0px rgba(239,68,68,0.3)'],
                      }}
                      transition={{ duration: 4, repeat: Infinity }}
                    >
                      <span className={`font-bold text-lg ${profit >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                        {profit >= 0 ? '+' : ''}{formatCurrency(profit)}
                      </span>
                    </motion.div>
                    
                    <div className="text-2xl font-bold text-slate-300">
                      ({returnPct >= 0 ? '+' : ''}{returnPct.toFixed(2)}%)
                    </div>
                  </div>

                  <div className="mt-6 space-y-2 text-sm text-slate-400">
                    <div className="flex items-center gap-2">
                      <span className="text-purple-400">📅</span>
                      <span className="text-slate-500">Started:</span>
                      <span className="text-slate-300">{formatGregorianAndHijriDate(inv.startDate) || '-'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-purple-400">🔄</span>
                      <span className="text-slate-500">Last update:</span>
                      <span className="text-slate-300">{latestUpdateLabel || '-'}</span>
                    </div>
                  </div>
                </motion.div>
              </div>

              {userRole === 'OWNER' && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 }}
                  className="flex flex-wrap gap-3 items-start"
                >
                  <motion.button
                    whileHover={{ scale: 1.05, boxShadow: '0 0 20px rgba(168,85,247,0.5)' }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setShowInvestForm(true)}
                    className="px-6 py-3 rounded-full bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white font-bold shadow-lg hover:shadow-purple-500/50 transition-all"
                  >
                    + Invest
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setShowValueForm(true)}
                    className="px-6 py-3 rounded-full bg-white/10 hover:bg-white/15 border border-white/20 text-white font-semibold backdrop-blur-sm transition-all"
                  >
                    Update Value
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setShowEditForm(true)}
                    className="px-6 py-3 rounded-full bg-white/10 hover:bg-white/15 border border-white/20 text-white font-semibold backdrop-blur-sm transition-all"
                  >
                    Edit
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.05, boxShadow: '0 0 20px rgba(239,68,68,0.5)' }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleDelete}
                    className="px-6 py-3 rounded-full bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-300 font-semibold transition-all"
                  >
                    Delete
                  </motion.button>
                </motion.div>
              )}
            </div>
          </div>
        </motion.div>

        {/* Chart Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900/90 via-purple-900/30 to-slate-900/90 border border-purple-500/20 p-6 backdrop-blur-xl"
        >
          <motion.div
            className="absolute top-0 right-0 w-64 h-64 bg-fuchsia-500/10 rounded-full blur-3xl"
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.1, 0.2, 0.1],
            }}
            transition={{
              duration: 6,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />

          <div className="relative z-10">
            <NeonLineChart points={points} range={range} />
            
            <div className="mt-6 flex justify-center">
              <div className="inline-flex gap-2 bg-slate-800/50 p-2 rounded-full border border-slate-700/50 backdrop-blur-sm">
                {([
                  { key: 'week', label: 'Week', icon: '📅' },
                  { key: 'month', label: 'Month', icon: '📊' },
                  { key: 'year', label: 'Year', icon: '📈' },
                  { key: 'all', label: 'All', icon: '🌟' },
                ] as const).map((opt) => (
                  <motion.button
                    key={opt.key}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setRange(opt.key)}
                    className={`px-6 py-2.5 rounded-full font-bold text-sm transition-all ${
                      range === opt.key
                        ? 'bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white shadow-lg shadow-purple-500/50'
                        : 'text-slate-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <span className="mr-2">{opt.icon}</span>
                    {opt.label}
                  </motion.button>
                ))}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { label: 'Average Purchase Cost', value: formatCurrency(investedAmount), icon: '💵', color: 'from-blue-500/20 to-cyan-500/20', border: 'border-blue-500/30' },
            { label: 'Unrealized Profit', value: formatCurrency(profit), icon: '📈', color: profit >= 0 ? 'from-emerald-500/20 to-green-500/20' : 'from-red-500/20 to-rose-500/20', border: profit >= 0 ? 'border-emerald-500/30' : 'border-red-500/30' },
            { label: 'Simple Return', value: `${returnPct >= 0 ? '+' : ''}${returnPct.toFixed(2)}%`, icon: '💹', color: returnPct >= 0 ? 'from-purple-500/20 to-fuchsia-500/20' : 'from-orange-500/20 to-red-500/20', border: returnPct >= 0 ? 'border-purple-500/30' : 'border-orange-500/30' },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 + i * 0.1 }}
              className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${stat.color} border ${stat.border} p-6 backdrop-blur-xl`}
            >
              <motion.div
                className="absolute -top-12 -right-12 w-32 h-32 bg-white/5 rounded-full blur-2xl"
                animate={{
                  scale: [1, 1.2, 1],
                  opacity: [0.2, 0.3, 0.2],
                }}
                transition={{
                  duration: 6,
                  repeat: Infinity,
                  delay: i * 0.5,
                }}
              />
              <div className="relative z-10">
                <div className="text-3xl mb-3">{stat.icon}</div>
                <div className="text-sm text-slate-400 font-medium mb-2">{stat.label}</div>
                <div className="text-2xl font-bold text-white tabular-nums">{stat.value}</div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Tabs Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900/90 via-purple-900/30 to-slate-900/90 border border-purple-500/20 p-6 backdrop-blur-xl"
        >
          <div className="relative z-10">
            {/* Tab Buttons */}
            <div className="flex gap-3 mb-6">
              {([
                { key: 'performance', label: 'Performance', icon: '📊' },
                { key: 'zakat', label: 'Zakat & Purif.', icon: '☪️' },
                { key: 'logs', label: 'Logs', icon: '📜' },
              ] as const).map((tab) => (
                <motion.button
                  key={tab.key}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-6 py-3 rounded-full font-bold text-sm transition-all ${
                    activeTab === tab.key
                      ? 'bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white shadow-lg shadow-purple-500/50'
                      : 'bg-slate-800/50 text-slate-400 hover:text-white hover:bg-slate-700/50 border border-slate-700/50'
                  }`}
                >
                  <span className="mr-2">{tab.icon}</span>
                  {tab.label}
                </motion.button>
              ))}
            </div>

            {/* Performance Tab */}
            {activeTab === 'performance' && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                {/* Holdings Section */}
                <div className="rounded-2xl bg-gradient-to-br from-slate-800/50 to-purple-900/20 border border-purple-500/20 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <span>📈</span> Holdings & Allocation
                      </h3>
                      <p className="text-sm text-slate-400 mt-1">Allocation % derived from holding values</p>
                    </div>
                    {userRole === 'OWNER' && (
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={openHoldingsEditor}
                        className="px-4 py-2 bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white rounded-lg font-semibold shadow-lg hover:shadow-purple-500/50 transition-all"
                      >
                        Edit Holdings
                      </motion.button>
                    )}
                  </div>

                  {holdingsSummary.rows.length === 0 ? (
                    <p className="text-slate-400 text-sm">No holdings yet.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs uppercase tracking-wider text-slate-500 border-b border-slate-700/50">
                            <th className="py-3 pr-4">Holding</th>
                            <th className="py-3 pr-4">Asset Type</th>
                            <th className="py-3 pr-4 text-right">Cost</th>
                            <th className="py-3 pr-4 text-right">Value</th>
                            <th className="py-3 text-right">Allocation</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/30">
                          {holdingsSummary.rows.map((h: HoldingRow) => (
                            <tr key={h.id || `${h.assetType}-${h.name}`} className="hover:bg-purple-500/5 transition-colors">
                              <td className="py-3 pr-4 font-medium text-white">{h.name || '-'}</td>
                              <td className="py-3 pr-4 text-slate-300">{h.assetType}</td>
                              <td className="py-3 pr-4 text-right tabular-nums text-slate-300">{formatCurrency(h.cost)}</td>
                              <td className="py-3 pr-4 text-right tabular-nums text-white font-semibold">{formatCurrency(h.currentValue)}</td>
                              <td className="py-3 text-right tabular-nums text-purple-400 font-semibold">{h.allocationPct.toFixed(2)}%</td>
                            </tr>
                          ))}
                          <tr className="font-bold border-t-2 border-purple-500/30">
                            <td className="py-3 pr-4 text-white" colSpan={2}>Total</td>
                            <td className="py-3 pr-4 text-right tabular-nums text-white">{formatCurrency(holdingsSummary.costTotal)}</td>
                            <td className="py-3 pr-4 text-right tabular-nums text-emerald-400">{formatCurrency(holdingsSummary.total)}</td>
                            <td className="py-3 text-right tabular-nums text-purple-400">100.00%</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* Zakat Tab */}
            {activeTab === 'zakat' && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                {/* Zakat Base */}
                <div className="rounded-2xl bg-gradient-to-br from-slate-800/50 to-purple-900/20 border border-purple-500/20 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <span>⚖️</span> Zakat Base % (by Asset Type)
                      </h3>
                      <p className="text-sm text-slate-400 mt-1">Edit when scholar guidance changes</p>
                    </div>
                    {userRole === 'OWNER' && (
                      <div className="flex gap-2">
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={openZakatBaseEditor}
                          className="px-4 py-2 bg-slate-700 text-white rounded-lg font-semibold hover:bg-slate-600 transition-all"
                        >
                          Reset
                        </motion.button>
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={saveZakatBase}
                          disabled={isSavingZakatBase}
                          className="px-4 py-2 bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white rounded-lg font-semibold shadow-lg hover:shadow-purple-500/50 transition-all disabled:opacity-50"
                        >
                          {isSavingZakatBase ? 'Saving...' : 'Save'}
                        </motion.button>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {zakatBaseRows.map((row: ZakatBaseRow) => {
                      const draftValue = zakatBaseDraft[row.key]
                      const shown = typeof draftValue === 'string' ? draftValue : String(row.value ?? 0)
                      return (
                        <div key={row.key} className="flex items-center justify-between bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
                          <span className="text-sm text-slate-300 font-medium">{row.label}</span>
                          {userRole === 'OWNER' ? (
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.01"
                              value={shown}
                              onChange={(e) =>
                                setZakatBaseDraft((prev) => ({
                                  ...prev,
                                  [row.key]: e.target.value,
                                }))
                              }
                              className="w-20 px-2 py-1 bg-slate-700 border border-slate-600 rounded text-white text-sm text-right focus:outline-none focus:ring-2 focus:ring-purple-500"
                            />
                          ) : (
                            <span className="text-slate-300 font-semibold tabular-nums">{Number(row.value ?? 0).toFixed(2)}%</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Zakat Breakdown */}
                <div className="rounded-2xl bg-gradient-to-br from-slate-800/50 to-purple-900/20 border border-purple-500/20 p-6">
                  <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
                    <span>📅</span> Hijri Yearly (Hawl) Breakdown
                  </h3>
                  <p className="text-sm text-slate-400 mb-4">
                    {zakatBreakdown.hasHistory
                      ? 'Uses your value history and calculates zakat based on end-of-year value.'
                      : 'Add value updates to generate yearly zakat breakdown.'}
                  </p>

                  {!zakatBreakdown.hasHoldings && (
                    <div className="mb-4 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-sm text-amber-300">
                      ⚠️ Effective zakat base is 0% because holdings/allocations are not set yet.
                    </div>
                  )}

                  {zakatBreakdown.rows.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs uppercase tracking-wider text-slate-500 border-b border-slate-700/50">
                            <th className="py-3 pr-4">Hijri Year</th>
                            <th className="py-3 pr-4">Start</th>
                            <th className="py-3 pr-4">End</th>
                            <th className="py-3 pr-4 text-right">Base %</th>
                            <th className="py-3 pr-4 text-right">End Value</th>
                            <th className="py-3 pr-4 text-right">Zakatable</th>
                            <th className="py-3 pr-4 text-right">Zakat</th>
                            <th className="py-3 pr-4 text-right">Paid</th>
                            <th className="py-3 text-right">Due</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/30">
                          {zakatBreakdown.rows.map((r: ZakatBreakdownRow) => (
                            <tr key={r.periodKey} className="hover:bg-purple-500/5 transition-colors">
                              <td className="py-3 pr-4 font-semibold text-white">{r.hijriYear}</td>
                              <td className="py-3 pr-4 text-slate-400 text-xs">{formatGregorianAndHijriDate(r.startAt) || '-'}</td>
                              <td className="py-3 pr-4 text-slate-400 text-xs">{formatGregorianAndHijriDate(r.endAt) || '-'}</td>
                              <td className="py-3 pr-4 text-right tabular-nums text-slate-300">{r.basePct.toFixed(2)}%</td>
                              <td className="py-3 pr-4 text-right tabular-nums text-white">{formatCurrency(r.endValue)}</td>
                              <td className="py-3 pr-4 text-right tabular-nums text-slate-300">{formatCurrency(r.zakatable)}</td>
                              <td className="py-3 pr-4 text-right tabular-nums text-purple-400">{formatCurrency(r.zakatDue)}</td>
                              <td className="py-3 pr-4 text-right tabular-nums text-slate-300">{formatCurrency(r.paidAmount)}</td>
                              <td className="py-3 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <span className={`font-semibold tabular-nums ${r.dueAfterPayment > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                                    {formatCurrency(r.dueAfterPayment)}
                                  </span>
                                  {userRole === 'OWNER' && r.canPay && (
                                    <motion.button
                                      whileHover={{ scale: 1.05 }}
                                      whileTap={{ scale: 0.95 }}
                                      onClick={() => openZakatPay(r)}
                                      className="px-2 py-1 bg-emerald-500/20 border border-emerald-500/30 rounded text-xs font-semibold text-emerald-300 hover:bg-emerald-500/30 transition-all"
                                    >
                                      Pay
                                    </motion.button>
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
              </motion.div>
            )}

            {/* Logs Tab */}
            {activeTab === 'logs' && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <div className="rounded-2xl bg-gradient-to-br from-slate-800/50 to-purple-900/20 border border-purple-500/20 p-6">
                  <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
                    <span>📜</span> Transaction Log
                  </h3>
                  <p className="text-sm text-slate-400 mb-4">
                    {transactionLogRows.length > 0 ? 'Latest 200 events.' : 'No history yet.'}
                  </p>

                  {transactionLogRows.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs uppercase tracking-wider text-slate-500 border-b border-slate-700/50">
                            <th className="py-3 pr-4">Date</th>
                            <th className="py-3 pr-4">Action</th>
                            <th className="py-3 pr-4 text-right">Amount</th>
                            <th className="py-3 pr-4 text-right">Invested</th>
                            <th className="py-3 text-right">Value</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/30">
                          {transactionLogRows.map((r) => (
                            <tr key={r.key} className="hover:bg-purple-500/5 transition-colors">
                              <td className="py-3 pr-4 text-slate-400 text-xs">{formatGregorianAndHijriDate(r.at) || '-'}</td>
                              <td className="py-3 pr-4 font-semibold text-white">{r.action || '-'}</td>
                              <td className="py-3 pr-4 text-right tabular-nums text-slate-300">{r.amount ? formatCurrency(r.amount) : '-'}</td>
                              <td className="py-3 pr-4 text-right tabular-nums text-slate-300">{Number.isFinite(r.investedAmount) ? formatCurrency(r.investedAmount) : '-'}</td>
                              <td className="py-3 text-right tabular-nums text-purple-400 font-semibold">{Number.isFinite(r.currentValue) ? formatCurrency(r.currentValue) : '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </div>
        </motion.div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showValueForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowValueForm(false)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-slate-900 border border-purple-500/30 rounded-2xl p-8 max-w-md w-full shadow-2xl"
            >
              <h2 className="text-2xl font-bold text-white mb-6">Update Portfolio Value</h2>
              <form onSubmit={handleSubmitCurrentValue} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Date</label>
                  <input
                    type="date"
                    value={valueForm.date}
                    onChange={(e) => setValueForm({ ...valueForm, date: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Current Value</label>
                  <input
                    type="number"
                    step="0.01"
                    value={valueForm.currentValue}
                    onChange={(e) => setValueForm({ ...valueForm, currentValue: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="Enter value"
                  />
                </div>
                <div className="flex gap-3 pt-4">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    type="submit"
                    disabled={isLoading}
                    className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white font-bold rounded-xl hover:shadow-lg hover:shadow-purple-500/50 transition-all disabled:opacity-50"
                  >
                    {isLoading ? 'Saving...' : 'Save'}
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    type="button"
                    onClick={() => setShowValueForm(false)}
                    className="flex-1 px-6 py-3 bg-slate-700 text-white font-semibold rounded-xl hover:bg-slate-600 transition-all"
                  >
                    Cancel
                  </motion.button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}

        {showInvestForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowInvestForm(false)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-slate-900 border border-purple-500/30 rounded-2xl p-8 max-w-md w-full shadow-2xl"
            >
              <h2 className="text-2xl font-bold text-white mb-6">Add Investment</h2>
              <form onSubmit={handleSubmitInvest} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Date</label>
                  <input
                    type="date"
                    value={investForm.date}
                    onChange={(e) => setInvestForm({ ...investForm, date: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    value={investForm.amount}
                    onChange={(e) => setInvestForm({ ...investForm, amount: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="Enter amount"
                  />
                </div>
                <div className="flex gap-3 pt-4">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    type="submit"
                    disabled={isLoading}
                    className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white font-bold rounded-xl hover:shadow-lg hover:shadow-purple-500/50 transition-all disabled:opacity-50"
                  >
                    {isLoading ? 'Adding...' : 'Add'}
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    type="button"
                    onClick={() => setShowInvestForm(false)}
                    className="flex-1 px-6 py-3 bg-slate-700 text-white font-semibold rounded-xl hover:bg-slate-600 transition-all"
                  >
                    Cancel
                  </motion.button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}

        {showEditForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowEditForm(false)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-slate-900 border border-purple-500/30 rounded-2xl p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-white">Edit Portfolio</h2>
                <button
                  onClick={() => setShowEditForm(false)}
                  className="text-slate-400 hover:text-white transition-colors text-2xl"
                >
                  ✕
                </button>
              </div>
              <SIPForm
                onSubmit={handleEdit}
                onCancel={() => setShowEditForm(false)}
                isLoading={isLoading}
                initialData={{
                  name: inv.name,
                  startDate: inv.startDate.split('T')[0],
                  accountId: inv.account.id,
                  notes: inv.notes,
                }}
              />
            </motion.div>
          </motion.div>
        )}

        {showHoldingsForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowHoldingsForm(false)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-slate-900 border border-purple-500/30 rounded-2xl p-8 max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-white">Edit Holdings</h2>
                <button
                  onClick={() => setShowHoldingsForm(false)}
                  className="text-slate-400 hover:text-white transition-colors text-2xl"
                >
                  ✕
                </button>
              </div>

              <div className="mb-4 rounded-lg border border-purple-500/30 bg-purple-900/20 p-3 text-sm text-slate-300">
                <div className="font-semibold text-white">💡 How this works</div>
                <div className="mt-1">- Holdings values represent your <span className="font-semibold text-purple-300">current market value</span> breakdown.</div>
                <div className="mt-1">- Invested amount is your <span className="font-semibold text-purple-300">cost basis</span> (can be different).</div>
              </div>

              <div className="flex justify-end mb-3">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={addHoldingDraft}
                  className="px-4 py-2 bg-slate-700 text-white rounded-lg font-semibold hover:bg-slate-600 transition-all"
                >
                  + Add Holding
                </motion.button>
              </div>

              <div className="space-y-3">
                {holdingsDraft.length === 0 ? (
                  <div className="text-sm text-slate-400">No holdings added yet.</div>
                ) : (
                  holdingsDraft.map((h: HoldingDraftRow, idx: number) => (
                    <div key={h.id} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end border border-purple-500/30 bg-slate-800/50 rounded-xl p-4">
                      <div className="md:col-span-4">
                        <label className="block text-xs font-semibold text-slate-400 mb-1">Name</label>
                        <input
                          value={h.name}
                          onChange={(e) =>
                            setHoldingsDraft((prev) =>
                              prev.map((x) => (x.id === h.id ? { ...x, name: e.target.value } : x))
                            )
                          }
                          className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/50"
                          placeholder="e.g., SPUS / REIT / Cash"
                        />
                      </div>

                      <div className="md:col-span-3">
                        <label className="block text-xs font-semibold text-slate-400 mb-1">Asset Type</label>
                        <select
                          value={h.assetType}
                          onChange={(e) =>
                            setHoldingsDraft((prev) =>
                              prev.map((x) => (x.id === h.id ? { ...x, assetType: e.target.value } : x))
                            )
                          }
                          className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/50"
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
                        <label className="block text-xs font-semibold text-slate-400 mb-1">Cost</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={h.cost}
                          onChange={(e) =>
                            setHoldingsDraft((prev) =>
                              prev.map((x) => (x.id === h.id ? { ...x, cost: e.target.value } : x))
                            )
                          }
                          className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/50"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-xs font-semibold text-slate-400 mb-1">Value</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={h.currentValue}
                          onChange={(e) =>
                            setHoldingsDraft((prev) =>
                              prev.map((x) => (x.id === h.id ? { ...x, currentValue: e.target.value } : x))
                            )
                          }
                          className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/50"
                        />
                      </div>

                      <div className="md:col-span-1 flex justify-end">
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => removeHoldingDraft(h.id)}
                          className="px-3 py-2 rounded-lg bg-red-500/20 border border-red-500/30 text-red-300 hover:bg-red-500/30 text-sm font-semibold transition-all"
                        >
                          Remove
                        </motion.button>
                      </div>

                      <div className="md:col-span-12 text-xs text-slate-500">Holding #{idx + 1}</div>
                    </div>
                  ))
                )}
              </div>

              <div className="flex justify-end gap-3 pt-6 border-t border-slate-700 mt-6">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setShowHoldingsForm(false)}
                  className="px-6 py-3 bg-slate-700 text-white font-semibold rounded-xl hover:bg-slate-600 transition-all"
                >
                  Cancel
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  disabled={isSavingHoldings}
                  onClick={saveHoldings}
                  className="px-6 py-3 bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white font-bold rounded-xl hover:shadow-lg hover:shadow-purple-500/50 transition-all disabled:opacity-50"
                >
                  {isSavingHoldings ? 'Saving...' : 'Save Holdings'}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {showZakatPayForm && zakatPayTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => !isPayingZakat && setShowZakatPayForm(false)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-slate-900 border border-purple-500/30 rounded-2xl p-8 max-w-md w-full shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-white">Pay Zakat</h2>
                <button
                  onClick={() => !isPayingZakat && setShowZakatPayForm(false)}
                  className="text-slate-400 hover:text-white transition-colors text-2xl"
                  disabled={isPayingZakat}
                >
                  ✕
                </button>
              </div>

              <form onSubmit={submitZakatPay} className="space-y-4">
                <div className="text-sm text-slate-300 bg-purple-900/20 border border-purple-500/30 rounded-lg p-3">
                  <span className="font-semibold text-purple-300">Period:</span> {formatGregorianAndHijriDate(zakatPayTarget.startAt)} → {formatGregorianAndHijriDate(zakatPayTarget.endAt)}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Date</label>
                  <input
                    type="date"
                    value={zakatPayDate}
                    onChange={(e) => setZakatPayDate(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Amount</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={zakatPayAmount}
                    onChange={(e) => setZakatPayAmount(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    type="button"
                    onClick={() => setShowZakatPayForm(false)}
                    disabled={isPayingZakat}
                    className="flex-1 px-6 py-3 bg-slate-700 text-white font-semibold rounded-xl hover:bg-slate-600 transition-all disabled:opacity-50"
                  >
                    Cancel
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    type="submit"
                    disabled={isPayingZakat}
                    className="flex-1 px-6 py-3 bg-gradient-to-r from-emerald-600 to-green-600 text-white font-bold rounded-xl hover:shadow-lg hover:shadow-emerald-500/50 transition-all disabled:opacity-50"
                  >
                    {isPayingZakat ? 'Paying...' : 'Pay'}
                  </motion.button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
