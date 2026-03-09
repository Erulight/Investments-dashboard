'use client'

import { motion, useMotionValue, useTransform, animate } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { AreaChart, Area, ResponsiveContainer } from 'recharts'
import { TrendingUp, TrendingDown, Plus, Minus, ArrowLeftRight } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { DateInput } from '@/components/ui/DateInput'
import { formatDateInput, toIsoDateInput } from '@/lib/date'

interface PremiumCashBalanceCardProps {
  initialCash: number
  trend?: number
  sparklineData?: number[]
  index: number
}

export function PremiumCashBalanceCard({
  initialCash,
  trend,
  sparklineData,
  index,
}: PremiumCashBalanceCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })
  const [isHovered, setIsHovered] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [cashBalance, setCashBalance] = useState(initialCash)
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [direction, setDirection] = useState<'IN' | 'OUT' | 'TRANSFER'>('IN')
  const [entryDate, setEntryDate] = useState(formatDateInput(new Date()))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  
  const router = useRouter()
  const searchParams = useSearchParams()
  const selectedYear = searchParams?.get('year') || new Date().getFullYear().toString()
  
  const displayValue = useMotionValue(initialCash)
  const rounded = useTransform(displayValue, (latest) => Math.round(latest))

  const colors = {
    primary: '#38bdf8',
    gradient: 'from-sky-500/20 to-cyan-600/20',
    glow: 'rgba(56, 189, 248, 0.3)',
    sparkline: '#38bdf8',
  }

  useEffect(() => {
    const controls = animate(displayValue, cashBalance, {
      duration: 2,
      ease: 'easeOut',
      delay: index * 0.1,
    })
    return controls.stop
  }, [cashBalance, displayValue, index])

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return
    const rect = cardRef.current.getBoundingClientRect()
    setMousePosition({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    })
  }

  const chartData = sparklineData?.map((val, idx) => ({ value: val, index: idx })) || []

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const isoDate = toIsoDateInput(entryDate)
      if (!isoDate) throw new Error('Invalid date format')

      const res = await fetch('/api/cash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          direction: direction === 'TRANSFER' ? 'OUT' : direction,
          amount: Number(amount),
          date: isoDate,
          notes,
          haulStartDate: direction === 'IN' ? isoDate : undefined,
        }),
      })
      
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to update cash balance')
      
      setCashBalance(data.cashBalance ?? 0)
      setAmount('')
      setNotes('')
      setShowForm(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update')
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.6,
        delay: index * 0.15,
        ease: [0.22, 1, 0.36, 1],
      }}
      whileHover={{ scale: 1.02, y: -4 }}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="relative group cursor-pointer"
      style={{
        transformStyle: 'preserve-3d',
      }}
    >
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-800/40 to-slate-900/60 backdrop-blur-xl border border-slate-700/50 shadow-2xl">
        <motion.div
          className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r ${colors.gradient}`}
          initial={{ x: '-100%' }}
          animate={{ x: '100%' }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: 'linear',
            delay: index * 0.2,
          }}
        />

        {isHovered && (
          <motion.div
            className="absolute pointer-events-none"
            style={{
              left: mousePosition.x,
              top: mousePosition.y,
              width: 300,
              height: 300,
              background: `radial-gradient(circle, ${colors.glow} 0%, transparent 70%)`,
              transform: 'translate(-50%, -50%)',
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
          />
        )}

        <div className="relative p-6 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Cash Balance
              </p>
            </div>
            {trend !== undefined && (
              <div
                className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold ${
                  trend >= 0
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-red-500/20 text-red-400'
                }`}
              >
                {trend >= 0 ? (
                  <TrendingUp className="w-3 h-3" />
                ) : (
                  <TrendingDown className="w-3 h-3" />
                )}
                {Math.abs(trend).toFixed(1)}%
              </div>
            )}
          </div>

          <div className="space-y-1">
            <motion.div
              className="text-3xl font-bold text-white tabular-nums"
              style={{ color: colors.primary }}
            >
              SAR <motion.span>{rounded}</motion.span>
            </motion.div>
            <p className="text-xs text-slate-500">Available liquidity</p>
          </div>

          {!showForm ? (
            <div className="flex gap-2">
              <button
                onClick={() => { setDirection('IN'); setShowForm(true) }}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-semibold transition-all"
              >
                <Plus className="w-3 h-3" />
                Add
              </button>
              <button
                onClick={() => { setDirection('OUT'); setShowForm(true) }}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-semibold transition-all"
              >
                <Minus className="w-3 h-3" />
                Withdraw
              </button>
              <button
                onClick={() => { setDirection('TRANSFER'); setShowForm(true) }}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-xs font-semibold transition-all"
              >
                <ArrowLeftRight className="w-3 h-3" />
                Transfer
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full rounded-lg border border-slate-600 bg-slate-800/50 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none"
                placeholder="Amount"
                required
              />
              <DateInput
                value={entryDate}
                onChange={setEntryDate}
                ariaLabel="Transaction date"
              />
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded-lg border border-slate-600 bg-slate-800/50 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none"
                placeholder="Notes (optional)"
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-3 py-2 rounded-lg bg-sky-500 hover:bg-sky-600 text-white text-xs font-semibold disabled:opacity-50 transition-all"
                >
                  {loading ? 'Saving...' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setError('') }}
                  className="px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-semibold transition-all"
                >
                  Cancel
                </button>
              </div>
              {error && <p className="text-xs text-red-400">{error}</p>}
            </form>
          )}

          {chartData.length > 0 && !showForm && (
            <div className="h-12 -mx-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="gradient-cash" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={colors.sparkline} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={colors.sparkline} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke={colors.sparkline}
                    strokeWidth={2}
                    fill="url(#gradient-cash)"
                    isAnimationActive={true}
                    animationDuration={1500}
                    animationBegin={index * 100}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <motion.div
          className="absolute inset-0 rounded-2xl pointer-events-none"
          style={{
            boxShadow: isHovered
              ? `0 0 30px ${colors.glow}, inset 0 0 20px ${colors.glow}`
              : 'none',
          }}
          animate={{
            opacity: isHovered ? 1 : 0,
          }}
          transition={{ duration: 0.3 }}
        />
      </div>
    </motion.div>
  )
}
