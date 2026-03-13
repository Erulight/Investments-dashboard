'use client'

import { motion, useMotionValue, useTransform, animate, AnimatePresence } from 'framer-motion'
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
  isHidden?: boolean
  onToggleHide?: () => void
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
  isHidden = false,
  onToggleHide,
}: PremiumCashBalanceCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })
  const [isHovered, setIsHovered] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [localHidden, setLocalHidden] = useState(false)
  
  const hidden = onToggleHide ? isHidden : localHidden
  const toggleHidden = onToggleHide || (() => setLocalHidden(!localHidden))
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
    primary: '#22d3ee',
    gradient: 'from-cyan-400/30 to-sky-500/30',
    glow: 'rgba(34, 211, 238, 0.5)',
    sparkline: '#22d3ee',
    border: 'border-cyan-400/40',
    shadow: 'shadow-cyan-500/30',
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
      whileHover={showForm ? {} : { scale: 1.02, y: -4 }}
      onMouseMove={showForm ? undefined : handleMouseMove}
      onMouseEnter={showForm ? undefined : () => setIsHovered(true)}
      onMouseLeave={showForm ? undefined : () => setIsHovered(false)}
      className={`relative group ${showForm ? '' : 'cursor-pointer'}`}
      style={{
        transformStyle: 'preserve-3d',
      }}
    >
      <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 backdrop-blur-xl border-2 ${colors.border} shadow-2xl ${colors.shadow} hover:shadow-3xl transition-all duration-500`}>
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 via-transparent to-purple-500/5 pointer-events-none" />
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
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
            <div className="flex-1">
              <p className="text-xs font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent uppercase tracking-wider drop-shadow-lg">
                Cash Balance
              </p>
            </div>
            <motion.button
              onClick={toggleHidden}
              className="group relative p-1.5 rounded-lg bg-slate-800/50 border border-cyan-500/30 hover:border-cyan-400/60 transition-all duration-300 ml-2"
              whileTap={{ scale: 0.95 }}
              whileHover={{ scale: 1.05 }}
            >
              <motion.div
                animate={{ rotate: hidden ? 0 : 360 }}
                transition={{ duration: 0.5, ease: "easeInOut" }}
              >
                {hidden ? (
                  <svg className="w-4 h-4 text-cyan-400 drop-shadow-[0_0_6px_rgba(34,211,238,0.6)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 text-cyan-400 drop-shadow-[0_0_6px_rgba(34,211,238,0.6)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </motion.div>
              <div className="absolute inset-0 rounded-lg bg-cyan-400/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </motion.button>
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
            <AnimatePresence mode="wait">
              {hidden ? (
                <motion.div
                  key="hidden"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.3 }}
                  className="text-3xl font-bold tabular-nums"
                  style={{ color: colors.primary }}
                >
                  •••••••
                </motion.div>
              ) : (
                <motion.div
                  key="visible"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.3 }}
                  className="text-3xl font-bold text-white tabular-nums drop-shadow-[0_0_10px_rgba(34,211,238,0.3)]"
                  style={{ color: colors.primary }}
                >
                  <motion.span>{rounded}</motion.span> {currencyPrefix}
                </motion.div>
              )}
            </AnimatePresence>
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
