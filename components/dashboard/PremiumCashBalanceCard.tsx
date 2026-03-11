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
  settingDelta?: number
  trend?: number
  sparklineData?: number[]
  index: number
  role?: 'OWNER' | 'PARTNER'
  currencyPrefix?: string
}

interface PartnerOption {
  id: string
  name: string
}

export function PremiumCashBalanceCard({
  initialCash,
  settingDelta,
  trend,
  sparklineData,
  index,
  role = 'OWNER',
  currencyPrefix = 'SAR',
}: PremiumCashBalanceCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })
  const [isHovered, setIsHovered] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [cashBalance, setCashBalance] = useState(initialCash)
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [direction, setDirection] = useState<'IN' | 'OUT' | 'TRANSFER'>('IN')
  const [transferDirection, setTransferDirection] = useState<'TO_PARTNER' | 'FROM_PARTNER'>('TO_PARTNER')
  const [selectedPartnerId, setSelectedPartnerId] = useState('')
  const [partners, setPartners] = useState<PartnerOption[]>([])
  const [partnersLoading, setPartnersLoading] = useState(false)
  const [partnersError, setPartnersError] = useState('')
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

  useEffect(() => {
    const loadPartners = async () => {
      if (role !== 'OWNER') return
      if (!showForm || direction !== 'TRANSFER') return
      if (partners.length > 0 || partnersLoading) return

      setPartnersLoading(true)
      setPartnersError('')
      try {
        const res = await fetch('/api/partners')
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(data.error || 'Failed to load partners')
        }
        const items = Array.isArray(data.partners) ? data.partners : []
        setPartners(items.map((p: any) => ({ id: p.id, name: p.name })))
      } catch (err) {
        setPartnersError(err instanceof Error ? err.message : 'Failed to load partners')
      } finally {
        setPartnersLoading(false)
      }
    }

    loadPartners()
  }, [role, showForm, direction, partners.length, partnersLoading])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const isoDate = toIsoDateInput(entryDate)
      if (!isoDate) throw new Error('Invalid date format')

      const parsedAmount = Number(amount)
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        throw new Error('Amount must be greater than 0')
      }

      if (direction === 'TRANSFER') {
        if (role !== 'OWNER') {
          throw new Error('Only owner can transfer from this card')
        }
        if (!selectedPartnerId) {
          throw new Error('Please select a partner')
        }

        const res = await fetch('/api/cash/transfer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: parsedAmount,
            direction: transferDirection,
            partnerPersonId: selectedPartnerId,
            date: isoDate,
            notes,
          }),
        })

        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || 'Failed to transfer cash')

        if (typeof data.ownerCashBalance === 'number') {
          setCashBalance(data.ownerCashBalance)
        }

        setAmount('')
        setNotes('')
        setSelectedPartnerId('')
        setShowForm(false)
        router.refresh()
        return
      }

      const res = await fetch('/api/cash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          direction,
          amount: parsedAmount,
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
      setSelectedPartnerId('')
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
              <motion.span>{rounded}</motion.span> {currencyPrefix}
            </motion.div>
            <p className="text-xs text-slate-500">Available liquidity</p>
            {role === 'OWNER' && typeof settingDelta === 'number' && Math.abs(settingDelta) > 0.01 && (
              <p className="text-[11px] text-amber-300">
                Sync drift: {settingDelta > 0 ? '+' : ''}
                {settingDelta.toFixed(2)}
              </p>
            )}
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
              {role === 'OWNER' && (
                <button
                  onClick={() => { setDirection('TRANSFER'); setShowForm(true) }}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-xs font-semibold transition-all"
                >
                  <ArrowLeftRight className="w-3 h-3" />
                  Transfer
                </button>
              )}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              {direction === 'TRANSFER' && role === 'OWNER' && (
                <div className="space-y-2">
                  <select
                    value={transferDirection}
                    onChange={(e) => setTransferDirection(e.target.value as 'TO_PARTNER' | 'FROM_PARTNER')}
                    className="w-full rounded-lg border border-slate-600 bg-slate-800/50 px-3 py-2 text-sm text-white focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none"
                  >
                    <option value="TO_PARTNER">Send to Partner</option>
                    <option value="FROM_PARTNER">Receive from Partner</option>
                  </select>
                  <select
                    value={selectedPartnerId}
                    onChange={(e) => setSelectedPartnerId(e.target.value)}
                    className="w-full rounded-lg border border-slate-600 bg-slate-800/50 px-3 py-2 text-sm text-white focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none"
                  >
                    <option value="">{partnersLoading ? 'Loading partners...' : 'Select partner'}</option>
                    {partners.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  {partnersError && <p className="text-xs text-red-400">{partnersError}</p>}
                </div>
              )}
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
                  onClick={() => {
                    setShowForm(false)
                    setError('')
                    setSelectedPartnerId('')
                    setTransferDirection('TO_PARTNER')
                  }}
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
