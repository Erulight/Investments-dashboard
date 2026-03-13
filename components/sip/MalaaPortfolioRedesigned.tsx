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

function NeonLineChart({ points, range }: { points: { at: Date; value: number }[]; range: RangeKey }) {
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
    return { x, y, value: p.value, date: p.at }
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

        {/* Data points */}
        {coords.map((coord, i) => (
          <motion.g
            key={i}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.5 + i * 0.05, duration: 0.3 }}
          >
            <circle
              cx={coord.x}
              cy={coord.y}
              r="6"
              fill={neonColor}
              opacity="0.3"
            />
            <motion.circle
              cx={coord.x}
              cy={coord.y}
              r="4"
              fill={neonColor}
              animate={{
                scale: i === coords.length - 1 ? [1, 1.3, 1] : 1,
              }}
              transition={{
                duration: 2,
                repeat: i === coords.length - 1 ? Infinity : 0,
                ease: 'easeInOut',
              }}
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
          duration: 2,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />
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
  const [isLoading, setIsLoading] = useState(false)
  const [valueForm, setValueForm] = useState<{ date: string; currentValue: string }>({
    date: new Date().toISOString().split('T')[0],
    currentValue: '',
  })
  const [investForm, setInvestForm] = useState<{ date: string; amount: string }>({
    date: new Date().toISOString().split('T')[0],
    amount: '',
  })

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
        if (Number.isNaN(at.getTime()) || !Number.isFinite(value)) return null
        return { at, value }
      })
      .filter((x): x is { at: Date; value: number } => !!x)
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
                duration: 4,
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
              duration: 5,
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
              duration: 4,
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
                      transition={{ duration: 2, repeat: Infinity }}
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
              duration: 3,
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
                  duration: 3,
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
      </AnimatePresence>
    </div>
  )
}
