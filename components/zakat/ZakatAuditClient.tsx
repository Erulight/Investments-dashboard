'use client'

import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'

function getWarningExplanation(type: string): string {
  const explanations: Record<string, string> = {
    MISSING_HAUL_START: "This cash bucket doesn't have a hawl start date (haulStartDate). Without this anchor, the system cannot determine when the 354-day zakat cycle begins, making accurate zakat calculation impossible.",
    DEBT_BUCKET_LEAKING: "This bucket is marked as a debt bucket (borrowed money) but is still included in zakat calculations. Borrowed money should be excluded from zakat because it's not truly owned wealth—it's a liability that must be repaid.",
    DOUBLE_COUNTING: "This bucket is allocated to multiple active investments simultaneously. This can cause the same funds to be counted multiple times in zakat calculations, inflating your total zakatable assets incorrectly.",
    MISSING_SAVINGS_HAUL: "A ROSCA savings bucket is missing its hawl continuity anchor. When ROSCA money is reinvested (e.g., into Sukuk), the hawl anchor should carry forward to prevent resetting the 354-day cycle.",
    HAWL_JUMPED_BACKWARDS: "The hawl start date moved backwards in time, which violates the zakat clock's forward-only progression. This can happen from data corruption or incorrect manual edits."
  }
  return explanations[type] || "Unknown warning type."
}

function getWarningSolution(type: string): string {
  const solutions: Record<string, string> = {
    MISSING_HAUL_START: "Go to the Cash Buckets page, find this bucket, and set its 'Hawl Start Date' to the date when you first acquired these funds. If you're unsure, use the earliest transaction date associated with this bucket.",
    DEBT_BUCKET_LEAKING: "Go to the Debts page, find the original debt entry, and ensure it's properly linked to this bucket. If the debt is fully repaid, the bucket should be converted to a regular cash bucket. If the debt is still active, ensure the bucket's 'Exclude from Zakat' flag is enabled.",
    DOUBLE_COUNTING: "Review the bucket's allocations on the Cash Buckets page. If multiple investments are using the same bucket, you need to either: (1) Split the bucket into separate buckets for each investment, or (2) Mark one investment as fully withdrawn and close its allocation.",
    MISSING_SAVINGS_HAUL: "Check the ROSCA investment details and ensure the 'savingsHaulStartDate' is properly set in the investment metadata. If this was funded from Circlys rewards, verify the reward receipt date and first contribution date are correct.",
    HAWL_JUMPED_BACKWARDS: "This indicates data corruption. Review the bucket's transaction history on the Cash Buckets page. The hawl start date should never move backwards—only forward when new hawl cycles complete. You may need to manually correct the haulStartDate to the proper forward-progressing date."
  }
  return solutions[type] || "Contact support for assistance with this issue."
}

import { useState, useMemo } from 'react'
import { formatCurrencyAmount, type DisplayCurrency } from '@/lib/currency'

type WarningType = {
  id: string
  type: string
  message: string
  bucketLabel?: string | null
  bucketId?: string
  balance?: number
  debtId?: string
  debtAmount?: number
  allocations?: Array<{ investmentName: string; principalRemaining: number; investmentId: string }>
  investmentId?: string
  investmentName?: string
  metadata?: any
}

function WarningItem({ warning, index, onFix }: { warning: WarningType; index: number; onFix?: (warningId: string, action: string) => Promise<void> }) {
  const [expanded, setExpanded] = useState(false)
  const [fixing, setFixing] = useState(false)
  const [showOptions, setShowOptions] = useState(false)
  const explanation = getWarningExplanation(warning.type)
  const solution = getWarningSolution(warning.type)

  const handleFix = async (action: string) => {
    if (!onFix) return
    setFixing(true)
    try {
      await onFix(warning.id, action)
    } finally {
      setFixing(false)
      setShowOptions(false)
    }
  }

  const renderRealDataExample = () => {
    if (warning.type === 'MISSING_HAUL_START' && warning.bucketLabel && warning.balance !== undefined) {
      return (
        <div className="mt-2 p-2 rounded bg-slate-800/40 border border-slate-700/50">
          <div className="text-[10px] font-semibold text-amber-400 mb-1">📊 YOUR DATA</div>
          <div className="text-[11px] text-slate-300 space-y-0.5">
            <div>• Bucket: <span className="text-cyan-400 font-mono">{warning.bucketLabel}</span></div>
            <div>• Balance: <span className="text-emerald-400 font-mono">{warning.balance.toLocaleString()} SAR</span></div>
            <div>• Hawl Start: <span className="text-red-400 font-mono">MISSING ⚠️</span></div>
          </div>
        </div>
      )
    }

    if (warning.type === 'DEBT_BUCKET_LEAKING' && warning.bucketLabel && warning.debtAmount !== undefined) {
      return (
        <div className="mt-2 p-2 rounded bg-slate-800/40 border border-slate-700/50">
          <div className="text-[10px] font-semibold text-amber-400 mb-1">📊 YOUR DATA</div>
          <div className="text-[11px] text-slate-300 space-y-0.5">
            <div>• Bucket: <span className="text-cyan-400 font-mono">{warning.bucketLabel}</span></div>
            <div>• Debt Amount: <span className="text-red-400 font-mono">{warning.debtAmount.toLocaleString()} SAR</span></div>
            <div>• Current Balance: <span className="text-emerald-400 font-mono">{(warning.balance || 0).toLocaleString()} SAR</span></div>
            <div>• Exclude from Zakat: <span className="text-red-400 font-mono">NOT SET ⚠️</span></div>
          </div>
        </div>
      )
    }

    if (warning.type === 'DOUBLE_COUNTING' && warning.allocations && warning.allocations.length > 0) {
      return (
        <div className="mt-2 p-2 rounded bg-slate-800/40 border border-slate-700/50">
          <div className="text-[10px] font-semibold text-amber-400 mb-1">📊 YOUR DATA</div>
          <div className="text-[11px] text-slate-300 space-y-0.5">
            <div>• Bucket: <span className="text-cyan-400 font-mono">{warning.bucketLabel}</span></div>
            <div>• Balance: <span className="text-emerald-400 font-mono">{(warning.balance || 0).toLocaleString()} SAR</span></div>
            <div className="text-[10px] font-semibold text-red-400 mt-1">⚠️ Allocated to {warning.allocations.length} investments:</div>
            {warning.allocations.map((a, i) => (
              <div key={i} className="ml-2">→ {a.investmentName}: <span className="text-amber-400 font-mono">{a.principalRemaining.toLocaleString()} SAR</span></div>
            ))}
          </div>
        </div>
      )
    }

    if (warning.type === 'MISSING_SAVINGS_HAUL' && warning.investmentName && warning.metadata?.roscaBuckets) {
      return (
        <div className="mt-2 p-2 rounded bg-slate-800/40 border border-slate-700/50">
          <div className="text-[10px] font-semibold text-amber-400 mb-1">📊 YOUR DATA</div>
          <div className="text-[11px] text-slate-300 space-y-0.5">
            <div>• Investment: <span className="text-cyan-400 font-mono">{warning.investmentName}</span></div>
            <div>• ROSCA Buckets: {warning.metadata.roscaBuckets.map((b: string, i: number) => (
              <div key={i} className="ml-2 text-purple-400 font-mono">→ {b}</div>
            ))}</div>
            <div>• Savings Hawl Start: <span className="text-red-400 font-mono">MISSING ⚠️</span></div>
          </div>
        </div>
      )
    }

    return null
  }

  const renderFixOptions = () => {
    if (warning.type === 'DEBT_BUCKET_LEAKING') {
      return (
        <div className="mt-2 space-y-1.5">
          <div className="text-[10px] font-semibold text-violet-400 uppercase tracking-wide">🛠️ AUTO-FIX OPTIONS</div>
          <button
            onClick={() => handleFix('exclude-from-zakat')}
            disabled={fixing}
            className="w-full text-left px-3 py-2 rounded bg-gradient-to-r from-emerald-600/20 to-emerald-700/20 border border-emerald-500/40 hover:border-emerald-400/60 text-slate-200 text-[11px] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="font-semibold">✅ Option 1: Mark bucket as "Exclude from Zakat"</div>
            <div className="text-slate-400 mt-0.5">Sets excludeFromZakat=true for this debt bucket</div>
          </button>
        </div>
      )
    }

    if (warning.type === 'DOUBLE_COUNTING' && warning.allocations && warning.allocations.length > 1) {
      return (
        <div className="mt-2 space-y-1.5">
          <div className="text-[10px] font-semibold text-violet-400 uppercase tracking-wide">🛠️ FIX OPTIONS (Manual Review Required)</div>
          <div className="px-3 py-2 rounded bg-amber-600/10 border border-amber-500/40 text-slate-300 text-[11px]">
            <div className="font-semibold mb-1">⚠️ This requires manual review</div>
            <div className="text-slate-400 space-y-1">
              <div>You need to decide which allocation is correct:</div>
              {warning.allocations.map((a, i) => (
                <div key={i} className="ml-2">• {a.investmentName} ({a.principalRemaining.toLocaleString()} SAR)</div>
              ))}
              <div className="mt-2 text-amber-400">→ Go to Cash Buckets page to split or close allocations</div>
            </div>
          </div>
        </div>
      )
    }

    if (warning.type === 'MISSING_HAUL_START') {
      return (
        <div className="mt-2 space-y-1.5">
          <div className="text-[10px] font-semibold text-violet-400 uppercase tracking-wide">🛠️ FIX OPTIONS (Manual Input Required)</div>
          <div className="px-3 py-2 rounded bg-blue-600/10 border border-blue-500/40 text-slate-300 text-[11px]">
            <div className="font-semibold mb-1">ℹ️ You need to provide the hawl start date</div>
            <div className="text-slate-400 space-y-1">
              <div>Options:</div>
              <div className="ml-2">• Use earliest transaction date</div>
              <div className="ml-2">• Use first contribution date</div>
              <div className="ml-2">• Set manually in Cash Buckets page</div>
            </div>
          </div>
        </div>
      )
    }

    if (warning.type === 'MISSING_SAVINGS_HAUL') {
      return (
        <div className="mt-2 space-y-1.5">
          <div className="text-[10px] font-semibold text-violet-400 uppercase tracking-wide">🛠️ AUTO-FIX OPTIONS</div>
          <button
            onClick={() => handleFix('sync-rosca-haul')}
            disabled={fixing}
            className="w-full text-left px-3 py-2 rounded bg-gradient-to-r from-emerald-600/20 to-emerald-700/20 border border-emerald-500/40 hover:border-emerald-400/60 text-slate-200 text-[11px] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="font-semibold">✅ Option 1: Auto-sync from ROSCA bucket</div>
            <div className="text-slate-400 mt-0.5">Sets savingsHaulStartDate from reward/savings receipt anchor</div>
          </button>
        </div>
      )
    }

    return null
  }

  return (
    <motion.div
      key={warning.id}
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.04 }}
      className="text-xs"
    >
      <div className="px-4 py-3 text-slate-300 flex items-start gap-2">
        <span className="text-slate-600 font-mono shrink-0">
          {String(index + 1).padStart(2, '0')}.
        </span>
        <div className="flex-1">
          <div className="flex items-start justify-between gap-3">
            <span className="flex-1">{warning.message}</span>
            <div className="flex gap-1.5">
              <button
                onClick={() => setExpanded(!expanded)}
                className="shrink-0 px-2 py-1 rounded bg-slate-700/50 hover:bg-slate-700 text-cyan-400 text-[10px] font-semibold transition-colors"
              >
                {expanded ? 'Hide' : 'Review'}
              </button>
              {(warning.type === 'DEBT_BUCKET_LEAKING' || warning.type === 'MISSING_SAVINGS_HAUL') && (
                <button
                  onClick={() => { setExpanded(true); setShowOptions(true); }}
                  disabled={fixing}
                  className="shrink-0 px-2 py-1 rounded bg-gradient-to-r from-emerald-600/50 to-emerald-700/50 hover:from-emerald-600/70 hover:to-emerald-700/70 text-white text-[10px] font-semibold transition-all disabled:opacity-50"
                >
                  {fixing ? 'Fixing...' : '🛠️ Fix'}
                </button>
              )}
            </div>
          </div>

          {expanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-3 space-y-2 border-l-2 border-cyan-500/30 pl-3"
            >
              <div className="space-y-1">
                <div className="text-[10px] font-semibold text-cyan-400 uppercase tracking-wide">
                  📖 Explanation
                </div>
                <div className="text-slate-400 leading-relaxed">{explanation}</div>
              </div>

              {renderRealDataExample()}

              <div className="space-y-1">
                <div className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wide">
                  ✅ Solution Steps
                </div>
                <div className="text-slate-400 leading-relaxed">{solution}</div>
              </div>

              {showOptions && renderFixOptions()}
            </motion.div>
          )}
        </div>
      </div>
    </motion.div>
  )
}

type Payment = {
  id: string
  amount: number
  date: string
  notes: string | null
  bucketId: string
  bucketLabel: string | null
  bucketCurrency: string
  personName: string | null
  investmentName: string | null
  investmentType: string | null
}

type InvAllocation = {
  bucketId: string
  bucketLabel: string | null
  haulStartDate: string
  principalAllocated: number
  principalRemaining: number
}

type InvCard = {
  id: string
  name: string
  principal: number
  status: 'ACTIVE' | 'CLOSED'
  maturityDate: string | null
  startDate: string
  savingsHaulStartDate: string | null
  allocations: InvAllocation[]
  zakatEstimate: number
}

type TimelineItem = {
  id: string
  label: string
  haulStart: string
  haulEnd: string
  progressPct: number
  remainingDays: number
  status: 'PAID' | 'DUE' | 'UPCOMING'
  zakatAmount: number
}

type Tab = 'overview' | 'investments' | 'timeline' | 'warnings' | 'history' | 'fixes'

const ROWS_PER_PAGE = 25
const ZAKAT_RATE = 0.025

export function ZakatAuditClient({
  displayCurrency,
  wealthCash,
  wealthActiveSukuk,
  wealthSavings,
  wealthRewards,
  wealthCrypto,
  zakatPaidThisYear,
  nextDueDate,
  investmentCards,
  timelines,
  warnings,
  payments,
  totalPaid,
  paidThisYear,
  isOwner,
}: {
  displayCurrency: DisplayCurrency
  wealthCash: number
  wealthActiveSukuk: number
  wealthSavings: number
  wealthRewards: number
  wealthCrypto: number
  zakatPaidThisYear: number
  nextDueDate: string | null
  investmentCards: InvCard[]
  timelines: TimelineItem[]
  warnings: WarningType[]
  payments: Payment[]
  totalPaid: number
  paidThisYear: number
  isOwner: boolean
}) {
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [search, setSearch] = useState('')
  const [yearFilter, setYearFilter] = useState<number | 'all'>('all')
  const [page, setPage] = useState(1)
  const [expandedInv, setExpandedInv] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [fixHistory, setFixHistory] = useState<Array<{ fixId: string; warningId: string; message: string }>>([])

  const handleFix = async (warningId: string, action: string) => {
    const warning = warnings.find(w => w.id === warningId)
    if (!warning) return

    try {
      const response = await fetch('/api/zakat/fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          warningId,
          action,
          bucketId: warning.bucketId,
          investmentId: warning.investmentId,
          debtId: warning.debtId,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to apply fix')
      }

      setToast({ message: result.message || 'Fix applied successfully!', type: 'success' })
      setFixHistory(prev => [...prev, { fixId: result.fixId, warningId, message: result.message }])

      // Reload page after short delay to show updated warnings
      setTimeout(() => window.location.reload(), 1500)
    } catch (error: any) {
      setToast({ message: error.message || 'Failed to apply fix', type: 'error' })
    }
  }

  const handleUndo = async (fixId: string) => {
    try {
      const response = await fetch(`/api/zakat/fix?fixId=${fixId}`, { method: 'DELETE' })
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to undo fix')
      }

      setToast({ message: 'Fix undone successfully!', type: 'success' })
      setFixHistory(prev => prev.filter(f => f.fixId !== fixId))

      // Reload page after short delay
      setTimeout(() => window.location.reload(), 1500)
    } catch (error: any) {
      setToast({ message: error.message || 'Failed to undo fix', type: 'error' })
    }
  }

  // Auto-dismiss toast after 5 seconds
  React.useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [toast])

  const money = (n: number) => formatCurrencyAmount(n, displayCurrency, 'SAR')
  const fmtDate = (d: string | null | undefined) => {
    if (!d) return '—'
    const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/)
    return m ? `${m[3]}-${m[2]}-${m[1].slice(2)}` : d
  }

  const hijriEpochStart = new Date(2022, 6, 30)
  const hijriEpochYear = 1444
  const getHijriYear = (d: Date) => {
    const idx = Math.floor((d.getTime() - hijriEpochStart.getTime()) / (354 * 86400000))
    return hijriEpochYear + Math.max(0, idx)
  }

  const totalWealth = wealthCash + wealthActiveSukuk + wealthSavings + wealthRewards + wealthCrypto
  const zakatEstimateTotal = (wealthCash + wealthRewards) * ZAKAT_RATE

  const wealthBreakdown = [
    { label: 'Cash Holdings', value: wealthCash, color: '#22d3ee', glow: 'rgba(34,211,238,0.3)' },
    { label: 'Active Sukuk', value: wealthActiveSukuk, color: '#818cf8', glow: 'rgba(129,140,248,0.3)' },
    { label: 'Circlys Savings', value: wealthSavings, color: '#34d399', glow: 'rgba(52,211,153,0.3)' },
    { label: 'Rewards', value: wealthRewards, color: '#fb923c', glow: 'rgba(251,146,60,0.3)' },
    { label: 'Crypto', value: wealthCrypto, color: '#f472b6', glow: 'rgba(244,114,182,0.3)' },
  ]

  const hijriSummaries = useMemo(() => {
    const map = new Map<number, { year: number; total: number; count: number }>()
    for (const p of payments) {
      const y = getHijriYear(new Date(p.date))
      const e = map.get(y) || { year: y, total: 0, count: 0 }
      e.total += p.amount; e.count++
      map.set(y, e)
    }
    return Array.from(map.values()).sort((a, b) => b.year - a.year)
  }, [payments])

  const filteredPayments = useMemo(() => {
    let list = payments
    if (yearFilter !== 'all') list = list.filter((p) => new Date(p.date).getFullYear() === yearFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((p) =>
        (p.bucketLabel || '').toLowerCase().includes(q) ||
        (p.investmentName || '').toLowerCase().includes(q) ||
        (p.personName || '').toLowerCase().includes(q)
      )
    }
    return list
  }, [payments, yearFilter, search])

  const availableYears = useMemo(() => {
    const s = new Set(payments.map((p) => new Date(p.date).getFullYear()))
    return Array.from(s).sort((a, b) => b - a)
  }, [payments])

  const totalHistoryPages = Math.ceil(filteredPayments.length / ROWS_PER_PAGE)
  const paginatedPayments = filteredPayments.slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE)

  const toggleInv = (id: string) => {
    setExpandedInv((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const warningColor = (type: string) => {
    if (type === 'MISSING_HAUL_START') return { border: 'border-red-500/40', bg: 'bg-red-500/5', dot: 'bg-red-500', text: 'text-red-400' }
    if (type === 'DEBT_BUCKET_LEAKING') return { border: 'border-orange-500/40', bg: 'bg-orange-500/5', dot: 'bg-orange-400', text: 'text-orange-400' }
    if (type === 'DOUBLE_COUNTING') return { border: 'border-yellow-500/40', bg: 'bg-yellow-500/5', dot: 'bg-yellow-400', text: 'text-yellow-400' }
    return { border: 'border-amber-500/40', bg: 'bg-amber-500/5', dot: 'bg-amber-400', text: 'text-amber-400' }
  }

  const TABS: { id: Tab; label: string; badge?: number }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'investments', label: 'Investments', badge: investmentCards.length },
    { id: 'timeline', label: 'Timeline', badge: timelines.length },
    { id: 'warnings', label: 'Warnings', badge: warnings.length },
    { id: 'history', label: 'Payment History', badge: payments.length },
    ...(fixHistory.length > 0 ? [{ id: 'fixes', label: '🛠️ Fixes', badge: fixHistory.length }] : []),
  ]

  return (
    <div className="space-y-5">
      <style>{`
        @keyframes neon-pulse { 0%,100%{box-shadow:0 0 8px rgba(6,182,212,.2),inset 0 0 8px rgba(6,182,212,.05)}50%{box-shadow:0 0 22px rgba(6,182,212,.45),inset 0 0 12px rgba(6,182,212,.08)} }
        @keyframes scan { 0%{transform:translateY(-100%)}100%{transform:translateY(100%)} }
        .neon-pulse{animation:neon-pulse 3s ease-in-out infinite}
        .scan-line::after{content:'';position:absolute;left:0;right:0;height:2px;background:linear-gradient(to right,transparent,rgba(6,182,212,.15),transparent);animation:scan 5s linear infinite;pointer-events:none}
        @keyframes bar-fill{from{width:0}to{width:var(--w)}}
        .bar-fill{animation:bar-fill .9s cubic-bezier(.4,0,.2,1) forwards}
        @keyframes hawl-prog{from{width:0}to{width:var(--p)}}
        .hawl-prog{animation:hawl-prog 1.2s cubic-bezier(.4,0,.2,1) forwards}
      `}</style>

      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6 border border-cyan-500/20 neon-pulse scan-line"
      >
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(6,182,212,.08),transparent_55%)]" />
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-cyan-400 to-transparent opacity-60" />
        <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-emerald-500 to-transparent opacity-35" />
        <div className="relative flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <span className="text-2xl">🕌</span>
              <h1 className="text-2xl font-extrabold tracking-tight" style={{ background: 'linear-gradient(90deg,#22d3ee,#34d399,#818cf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                Zakat Audit &amp; Verification
              </h1>
            </div>
            <p className="text-xs text-slate-400 ml-10">Comprehensive audit trail — wealth snapshot, hawl timelines, reconciliation checks</p>
          </div>
          <div className="hidden sm:flex flex-col items-end gap-0.5 shrink-0">
            <span className="text-[10px] text-cyan-400/60 uppercase tracking-widest font-semibold">Total Wealth</span>
            <span className="text-xl font-bold text-cyan-300 tabular-nums">{money(totalWealth)}</span>
          </div>
        </div>
      </motion.div>

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-900/80 border border-slate-700/50">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-200 ${
              activeTab === tab.id
                ? 'bg-gradient-to-r from-cyan-500/20 to-emerald-500/10 text-cyan-300 border border-cyan-500/30'
                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'
            }`}
            style={activeTab === tab.id ? { boxShadow: '0 0 12px rgba(6,182,212,0.15)' } : {}}
          >
            {tab.label}
            {tab.badge !== undefined && tab.badge > 0 && (
              <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${
                tab.id === 'warnings' && tab.badge > 0 ? 'bg-red-500/20 text-red-400' : 'bg-slate-700 text-slate-400'
              }`}>{tab.badge}</span>
            )}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">

        {/* ─── OVERVIEW TAB ─────────────────────────────── */}
        {activeTab === 'overview' && (
          <motion.div key="overview" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }} className="space-y-5">

            {/* Wealth Breakdown */}
            <div className="rounded-xl bg-slate-900/80 border border-slate-700/50 p-5">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-semibold text-slate-200">Wealth Breakdown</span>
                <span className="text-xs text-slate-500">Zakatable wealth as of today</span>
              </div>
              <div className="space-y-3">
                {wealthBreakdown.map((item, i) => {
                  const pct = totalWealth > 0 ? (item.value / totalWealth) * 100 : 0
                  return (
                    <motion.div key={item.label} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.07 }}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: item.color, boxShadow: `0 0 5px ${item.glow}` }} />
                          <span className="text-xs text-slate-400">{item.label}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-slate-500">{pct.toFixed(1)}%</span>
                          <span className="text-sm font-semibold tabular-nums" style={{ color: item.color }}>{money(item.value)}</span>
                        </div>
                      </div>
                      <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                        <div className="h-full rounded-full bar-fill" style={{ '--w': `${pct}%`, background: item.color, opacity: 0.7 } as any} />
                      </div>
                    </motion.div>
                  )
                })}
              </div>
              <div className="mt-4 pt-4 border-t border-slate-800 flex items-center justify-between">
                <span className="text-sm text-slate-400">Total Zakatable Wealth</span>
                <span className="text-lg font-bold text-cyan-300 tabular-nums">{money(totalWealth)}</span>
              </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {[
                { label: 'Zakat Estimate', val: money(zakatEstimateTotal), color: 'text-amber-400', border: 'border-amber-500/25', glow: 'rgba(251,191,36,.2)' },
                { label: 'Paid This Year', val: money(paidThisYear), color: 'text-emerald-400', border: 'border-emerald-500/25', glow: 'rgba(16,185,129,.2)' },
                { label: 'Paid All Time', val: money(totalPaid), color: 'text-cyan-400', border: 'border-cyan-500/25', glow: 'rgba(6,182,212,.2)' },
                { label: 'Next Due', val: nextDueDate ? fmtDate(nextDueDate) : '—', color: 'text-violet-400', border: 'border-violet-500/25', glow: 'rgba(139,92,246,.2)' },
                { label: 'Total Payments', val: String(payments.length), color: 'text-pink-400', border: 'border-pink-500/25', glow: 'rgba(244,114,182,.2)' },
              ].map((c, i) => (
                <motion.div key={c.label} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.06 }}
                  className={`rounded-xl bg-slate-900/80 border ${c.border} p-4`} style={{ boxShadow: `0 0 14px ${c.glow}` }}>
                  <div className="text-[10px] text-slate-500 font-medium mb-1.5 uppercase tracking-wider">{c.label}</div>
                  <div className={`text-lg font-bold tabular-nums ${c.color}`}>{c.val}</div>
                </motion.div>
              ))}
            </div>

            {/* Hijri Breakdown */}
            {hijriSummaries.length > 0 && (
              <div className="rounded-xl bg-slate-900/80 border border-slate-700/50 overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-800 text-sm font-semibold text-slate-200">By Hijri Year</div>
                <div className="divide-y divide-slate-800">
                  {hijriSummaries.map((s) => (
                    <div key={s.year} className="flex items-center justify-between px-5 py-3 hover:bg-slate-800/30 transition-colors">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ background: '#22d3ee', boxShadow: '0 0 5px rgba(34,211,238,.6)' }} />
                        <span className="text-sm font-semibold text-slate-200">{s.year} AH</span>
                        <span className="text-xs text-slate-500">{s.count} payment{s.count !== 1 ? 's' : ''}</span>
                      </div>
                      <span className="text-sm font-bold text-emerald-400 tabular-nums">{money(s.total)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Reconciliation Status */}
            <div className={`rounded-xl border p-4 flex items-center gap-3 ${warnings.length === 0 ? 'bg-emerald-500/5 border-emerald-500/25' : 'bg-red-500/5 border-red-500/25'}`}>
              <span className={`text-2xl ${warnings.length === 0 ? '' : ''}`}>{warnings.length === 0 ? '✅' : '⚠️'}</span>
              <div>
                <div className={`text-sm font-semibold ${warnings.length === 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {warnings.length === 0 ? 'All checks passed — system is clean' : `${warnings.length} reconciliation warning${warnings.length !== 1 ? 's' : ''} detected`}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {warnings.length === 0 ? 'No hawl anchor issues, no double counting, no leaked buckets' : 'Switch to the Warnings tab for details'}
                </div>
              </div>
              {warnings.length > 0 && (
                <button onClick={() => setActiveTab('warnings')} className="ml-auto text-xs text-red-400 hover:text-red-300 border border-red-500/30 px-3 py-1.5 rounded-lg transition-colors">
                  View Warnings
                </button>
              )}
            </div>
          </motion.div>
        )}

        {/* ─── INVESTMENTS TAB ──────────────────────────── */}
        {activeTab === 'investments' && (
          <motion.div key="investments" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }} className="space-y-3">
            {investmentCards.length === 0 ? (
              <div className="rounded-xl bg-slate-900/80 border border-slate-700/50 p-10 text-center text-slate-500 text-sm">No Sukuk investments found</div>
            ) : investmentCards.map((inv, i) => {
              const isExpanded = expandedInv.has(inv.id)
              return (
                <motion.div key={inv.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                  className={`rounded-xl border overflow-hidden ${inv.status === 'ACTIVE' ? 'border-emerald-500/25 bg-emerald-500/3' : 'border-slate-700/50 bg-slate-900/80'}`}
                  style={inv.status === 'ACTIVE' ? { boxShadow: '0 0 16px rgba(52,211,153,.07)' } : {}}>
                  <button onClick={() => toggleInv(inv.id)} className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/2 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${inv.status === 'ACTIVE' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-700 text-slate-400'}`}>
                        {inv.status}
                      </span>
                      <span className="text-sm font-semibold text-slate-100">{inv.name}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right hidden sm:block">
                        <div className="text-[10px] text-slate-500">Principal</div>
                        <div className="text-sm font-semibold text-slate-200 tabular-nums">{money(inv.principal)}</div>
                      </div>
                      {inv.zakatEstimate > 0 && (
                        <div className="text-right hidden sm:block">
                          <div className="text-[10px] text-slate-500">Zakat Est.</div>
                          <div className="text-sm font-semibold text-amber-400 tabular-nums">{money(inv.zakatEstimate)}</div>
                        </div>
                      )}
                      <span className="text-slate-500 text-sm">{isExpanded ? '▾' : '▸'}</span>
                    </div>
                  </button>
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }}
                        className="overflow-hidden border-t border-slate-700/40">
                        <div className="px-5 py-4 space-y-4">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                            {[
                              { label: 'Start Date', val: fmtDate(inv.startDate) },
                              { label: 'Maturity', val: inv.maturityDate ? fmtDate(inv.maturityDate) : '—' },
                              { label: 'Haul Anchor', val: inv.savingsHaulStartDate ? fmtDate(inv.savingsHaulStartDate) : '—' },
                              { label: 'Funding Sources', val: String(inv.allocations.length) },
                            ].map((f) => (
                              <div key={f.label} className="rounded-lg bg-slate-800/50 px-3 py-2">
                                <div className="text-slate-500 mb-0.5">{f.label}</div>
                                <div className="font-semibold text-slate-200 font-mono">{f.val}</div>
                              </div>
                            ))}
                          </div>
                          {inv.allocations.length > 0 && (
                            <div>
                              <div className="text-xs font-semibold text-slate-400 mb-2">Bucket Allocations</div>
                              <div className="space-y-2">
                                {inv.allocations.map((a, ai) => (
                                  <div key={ai} className="flex items-center justify-between rounded-lg bg-slate-800/40 px-3 py-2 text-xs">
                                    <div className="flex items-center gap-2">
                                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400/70 flex-shrink-0" style={{ boxShadow: '0 0 4px rgba(34,211,238,.5)' }} />
                                      <span className="text-slate-300 max-w-[200px] truncate">{a.bucketLabel || `Bucket ${a.bucketId.slice(0, 8)}`}</span>
                                    </div>
                                    <div className="flex items-center gap-4">
                                      <span className="text-slate-500">Haul: <span className="font-mono text-slate-400">{fmtDate(a.haulStartDate)}</span></span>
                                      <span className="text-slate-500">Alloc: <span className="text-violet-400 font-semibold">{money(a.principalAllocated)}</span></span>
                                      <span className="text-slate-500">Remaining: <span className={`font-semibold ${a.principalRemaining > 0 ? 'text-emerald-400' : 'text-slate-600'}`}>{money(a.principalRemaining)}</span></span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {inv.zakatEstimate > 0 && (
                            <div className="rounded-lg bg-amber-500/8 border border-amber-500/20 px-4 py-3 text-xs">
                              <span className="text-amber-400/80">Estimated zakat on closed principal (2.5%): </span>
                              <span className="font-bold text-amber-300">{money(inv.zakatEstimate)}</span>
                              <span className="text-slate-500 ml-2">— verify on main Zakat page for exact hawl periods</span>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )
            })}
          </motion.div>
        )}

        {/* ─── TIMELINE TAB ─────────────────────────────── */}
        {activeTab === 'timeline' && (
          <motion.div key="timeline" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }} className="space-y-2">
            <div className="text-xs text-slate-500 px-1 mb-3">Hawl progress for each cash bucket (354 days from haulStartDate)</div>
            {timelines.length === 0 ? (
              <div className="rounded-xl bg-slate-900/80 border border-slate-700/50 p-10 text-center text-slate-500 text-sm">No active buckets with balance found</div>
            ) : timelines.map((t, i) => {
              const color = t.status === 'PAID' ? '#34d399' : t.status === 'DUE' ? '#fbbf24' : '#818cf8'
              const glowColor = t.status === 'PAID' ? 'rgba(52,211,153,.2)' : t.status === 'DUE' ? 'rgba(251,191,36,.2)' : 'rgba(129,140,248,.2)'
              return (
                <motion.div key={t.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
                  className="rounded-xl bg-slate-900/80 border border-slate-700/40 px-5 py-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color, boxShadow: `0 0 6px ${glowColor}` }} />
                      <span className="text-xs text-slate-300 truncate max-w-[260px]">{t.label}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-2">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${color}18`, color, border: `1px solid ${color}35` }}>
                        {t.status}
                      </span>
                      <span className="text-xs text-amber-300 font-semibold tabular-nums">{money(t.zakatAmount)}</span>
                    </div>
                  </div>
                  <div className="h-2.5 rounded-full bg-slate-800 overflow-hidden mb-2 relative">
                    <div className="h-full rounded-full hawl-prog absolute top-0 left-0"
                      style={{ '--p': `${t.progressPct}%`, background: `linear-gradient(90deg, ${color}90, ${color})`, boxShadow: `0 0 8px ${glowColor}` } as any} />
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-500">
                    <span className="font-mono">{fmtDate(t.haulStart)}</span>
                    <span className={`font-semibold ${t.status === 'DUE' ? 'text-amber-400' : 'text-slate-400'}`}>
                      {t.status === 'PAID' ? '✓ Paid' : t.status === 'DUE' ? 'DUE NOW' : `${t.remainingDays}d remaining`}
                    </span>
                    <span className="font-mono">{fmtDate(t.haulEnd)}</span>
                  </div>
                </motion.div>
              )
            })}
          </motion.div>
        )}

        {/* ─── WARNINGS TAB ─────────────────────────────── */}
        {activeTab === 'warnings' && (
          <motion.div key="warnings" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }} className="space-y-3">
            {warnings.length === 0 ? (
              <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/25 p-10 text-center">
                <div className="text-3xl mb-2">✅</div>
                <div className="text-sm font-semibold text-emerald-400">No reconciliation warnings</div>
                <div className="text-xs text-slate-500 mt-1">All hawl anchors, bucket allocations, and debt checks passed</div>
              </div>
            ) : (
              <>
                <div className="text-xs text-slate-500 px-1">
                  {warnings.length} warning{warnings.length !== 1 ? 's' : ''} found — review each and correct as needed
                </div>
                {[
                  { type: 'MISSING_HAUL_START', label: 'Missing Haul Start' },
                  { type: 'DEBT_BUCKET_LEAKING', label: 'Debt Bucket Leaking' },
                  { type: 'DOUBLE_COUNTING', label: 'Double Counting' },
                  { type: 'MISSING_SAVINGS_HAUL', label: 'Missing Savings Haul' },
                  { type: 'HAWL_JUMPED_BACKWARDS', label: 'Hawl Clock Jumped' },
                ].filter(g => warnings.some(w => w.type === g.type)).map((group) => {
                  const groupWarnings = warnings.filter((w) => w.type === group.type)
                  const c = warningColor(group.type)
                  return (
                    <div key={group.type} className={`rounded-xl border ${c.border} ${c.bg} overflow-hidden`}>
                      <div className={`px-4 py-3 border-b ${c.border} flex items-center gap-2`}>
                        <span className={`w-2 h-2 rounded-full ${c.dot}`} />
                        <span className={`text-xs font-semibold ${c.text}`}>{group.label}</span>
                        <span className="text-xs text-slate-500 ml-auto">{groupWarnings.length} item{groupWarnings.length !== 1 ? 's' : ''}</span>
                      </div>
                      <div className="divide-y divide-slate-800/40">
                      {groupWarnings.map((w, wi) => (
                        <WarningItem key={w.id} warning={w} index={wi} onFix={handleFix} />
                      ))}
                    </div>
                    </div>
                  )
                })}
              </>
            )}
          </motion.div>
        )}

        {/* ─── HISTORY TAB ──────────────────────────────── */}
        {activeTab === 'history' && (
          <motion.div key="history" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }} className="space-y-4">
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex gap-1.5 flex-wrap">
                {(['all', ...availableYears] as (number | 'all')[]).map((yr) => (
                  <button key={String(yr)} onClick={() => { setYearFilter(yr); setPage(1) }}
                    className={`px-2.5 py-1.5 rounded-full text-xs font-semibold border transition-all ${yearFilter === yr ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40' : 'bg-slate-800/70 text-slate-500 border-slate-700/50 hover:text-slate-300'}`}>
                    {yr === 'all' ? 'All Years' : yr}
                  </button>
                ))}
              </div>
              <input type="text" placeholder="Search…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                className="flex-1 min-w-0 px-3 py-1.5 text-xs rounded-lg bg-slate-800/70 border border-slate-700/50 text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/40" />
            </div>
            <div className="rounded-xl bg-slate-900/80 border border-slate-700/50 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-700/80 bg-slate-800/50">
                      {['Date', 'Amount', 'Source Bucket', 'Investment', 'Person'].map((h) => (
                        <th key={h} className={`px-4 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider ${h === 'Amount' ? 'text-right' : 'text-left'}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/40">
                    <AnimatePresence mode="sync">
                      {paginatedPayments.length === 0 ? (
                        <tr><td colSpan={5} className="text-center py-12 text-slate-500">No payments found</td></tr>
                      ) : paginatedPayments.map((p, i) => (
                        <motion.tr key={p.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.015 }}
                          className="hover:bg-slate-800/25 transition-colors">
                          <td className="px-4 py-3 font-mono text-slate-400">{fmtDate(p.date)}</td>
                          <td className="px-4 py-3 text-right font-bold tabular-nums text-emerald-400" style={{ textShadow: '0 0 8px rgba(52,211,153,.3)' }}>{money(p.amount)}</td>
                          <td className="px-4 py-3 max-w-[160px]"><span className="text-slate-300 truncate block">{p.bucketLabel || 'General Cash'}</span></td>
                          <td className="px-4 py-3 max-w-[140px]"><span className="text-cyan-400/80 truncate block">{p.investmentName || '—'}</span></td>
                          <td className="px-4 py-3 text-slate-500">{p.personName || 'Owner'}</td>
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>
              {totalHistoryPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-slate-800">
                  <span className="text-[10px] text-slate-500">{filteredPayments.length} record{filteredPayments.length !== 1 ? 's' : ''}</span>
                  <div className="flex items-center gap-1">
                    <button disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="px-2.5 py-1 text-xs rounded-lg bg-slate-800 border border-slate-700/50 text-slate-300 disabled:opacity-30">←</button>
                    <span className="px-2.5 py-1 text-xs text-slate-400 tabular-nums">{page}/{totalHistoryPages}</span>
                    <button disabled={page === totalHistoryPages} onClick={() => setPage((p) => p + 1)} className="px-2.5 py-1 text-xs rounded-lg bg-slate-800 border border-slate-700/50 text-slate-300 disabled:opacity-30">→</button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* ─── FIXES TAB ──────────────────────────────── */}
        {activeTab === 'fixes' && fixHistory.length > 0 && (
          <motion.div key="fixes" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }} className="space-y-3">
            <div className="rounded-xl bg-gradient-to-br from-violet-500/10 to-purple-500/10 border border-violet-500/30 p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">🛠️</span>
                <h3 className="text-sm font-semibold text-violet-300">Applied Fixes</h3>
              </div>
              <p className="text-xs text-slate-400">
                These automatic fixes have been applied to resolve zakat audit warnings. You can undo any fix to revert the changes.
              </p>
            </div>

            {fixHistory.map((fix, index) => (
              <motion.div
                key={fix.fixId}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="rounded-xl bg-slate-900/80 border border-slate-700/50 p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-emerald-400 text-sm">✅</span>
                      <span className="text-xs font-mono text-slate-500">Fix #{index + 1}</span>
                    </div>
                    <p className="text-sm text-slate-200">{fix.message}</p>
                    <p className="text-xs text-slate-500 mt-1">Warning ID: {fix.warningId}</p>
                  </div>
                  <button
                    onClick={() => handleUndo(fix.fixId)}
                    className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-600/20 border border-amber-500/40 text-amber-300 text-xs font-semibold hover:bg-amber-600/30 transition-all"
                  >
                    ↩️ Undo
                  </button>
                </div>
              </motion.div>
            ))}

            <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3">
              <div className="flex items-start gap-2 text-xs text-slate-300">
                <span className="text-amber-400">⚠️</span>
                <div>
                  <span className="font-semibold text-amber-400">Note:</span> Undoing a fix will revert the database changes. 
                  The page will reload to show the restored warning.
                </div>
              </div>
            </div>
          </motion.div>
        )}

      </AnimatePresence>

      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-4 right-4 z-50 max-w-md"
          >
            <div className={`rounded-lg px-4 py-3 shadow-lg border ${
              toast.type === 'success'
                ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                : 'bg-red-500/20 border-red-500/40 text-red-300'
            }`}>
              <div className="flex items-start gap-3">
                <span className="text-xl">{toast.type === 'success' ? '✅' : '❌'}</span>
                <div className="flex-1">
                  <div className="text-sm font-semibold">{toast.type === 'success' ? 'Success!' : 'Error'}</div>
                  <div className="text-xs mt-0.5 opacity-90">{toast.message}</div>
                </div>
                <button
                  onClick={() => setToast(null)}
                  className="text-slate-400 hover:text-slate-200 transition-colors"
                >
                  ✕
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
