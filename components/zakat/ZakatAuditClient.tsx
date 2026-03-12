'use client'

import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { formatCurrencyAmount, type DisplayCurrency } from '@/lib/currency'

type Payment = {
  id: string
  amount: number
  date: string
  notes: string | null
  bucketId: string
  bucketLabel: string | null
  bucketCurrency: string
  personId: string | null
  personName: string | null
  investmentId: string | null
  investmentName: string | null
  investmentType: string | null
  createdAt: string
}

const ROWS_PER_PAGE = 25

export function ZakatAuditClient({
  payments,
  totalPaid,
  paidThisYear,
  displayCurrency,
}: {
  payments: Payment[]
  totalPaid: number
  paidThisYear: number
  displayCurrency: DisplayCurrency
}) {
  const [search, setSearch] = useState('')
  const [yearFilter, setYearFilter] = useState<number | 'all'>('all')
  const [page, setPage] = useState(1)

  const money = (n: number) => formatCurrencyAmount(n, displayCurrency, 'SAR')

  const hijriEpochStart = new Date(2022, 6, 30)
  const hijriEpochYear = 1444

  const getHijriYear = (d: Date) => {
    const diffDays = Math.floor((d.getTime() - hijriEpochStart.getTime()) / 86400000)
    const idx = diffDays >= 0 ? Math.floor(diffDays / 354) : -Math.ceil(Math.abs(diffDays) / 354)
    return hijriEpochYear + idx
  }

  const fmtDate = (d: string) => {
    const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/)
    return m ? `${m[3]}-${m[2]}-${m[1].slice(2)}` : d
  }

  const parseRowId = (notes: string | null) => {
    if (!notes) return null
    return notes.match(/ZAKAT_ROW=([^\s|]+)/)?.[1] || null
  }

  const availableYears = useMemo(() => {
    const s = new Set(payments.map((p) => new Date(p.date).getFullYear()))
    return Array.from(s).sort((a, b) => b - a)
  }, [payments])

  const hijriSummaries = useMemo(() => {
    const map = new Map<number, { year: number; total: number; count: number }>()
    for (const p of payments) {
      const y = getHijriYear(new Date(p.date))
      const e = map.get(y) || { year: y, total: 0, count: 0 }
      e.total += p.amount
      e.count++
      map.set(y, e)
    }
    return Array.from(map.values()).sort((a, b) => b.year - a.year)
  }, [payments])

  const filtered = useMemo(() => {
    let list = payments
    if (yearFilter !== 'all') list = list.filter((p) => new Date(p.date).getFullYear() === yearFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (p) =>
          (p.bucketLabel || '').toLowerCase().includes(q) ||
          (p.investmentName || '').toLowerCase().includes(q) ||
          (p.personName || '').toLowerCase().includes(q) ||
          (p.notes || '').toLowerCase().includes(q),
      )
    }
    return list
  }, [payments, yearFilter, search])

  const totalPages = Math.ceil(filtered.length / ROWS_PER_PAGE)
  const paginated = filtered.slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE)

  const stats = [
    { label: 'Total Paid (All Time)', value: money(totalPaid), color: 'cyan', glow: 'rgba(6,182,212,0.35)' },
    { label: 'Paid This Year', value: money(paidThisYear), color: 'emerald', glow: 'rgba(16,185,129,0.35)' },
    { label: 'Total Payments', value: String(payments.length), color: 'violet', glow: 'rgba(139,92,246,0.35)' },
    {
      label: 'Last Payment',
      value: payments[0]?.date ? fmtDate(payments[0].date) : '—',
      color: 'amber',
      glow: 'rgba(251,191,36,0.25)',
    },
  ]

  const colorClass: Record<string, string> = {
    cyan: 'text-cyan-400 border-cyan-500/30',
    emerald: 'text-emerald-400 border-emerald-500/30',
    violet: 'text-violet-400 border-violet-500/30',
    amber: 'text-amber-400 border-amber-500/30',
  }

  return (
    <div className="space-y-6">
      <style>{`
        @keyframes neon-border-pulse {
          0%,100% { box-shadow: 0 0 8px rgba(6,182,212,0.2), inset 0 0 8px rgba(6,182,212,0.05); }
          50% { box-shadow: 0 0 22px rgba(6,182,212,0.45), inset 0 0 12px rgba(6,182,212,0.08); }
        }
        @keyframes scanline {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(100%); }
        }
        .neon-pulse { animation: neon-border-pulse 3s ease-in-out infinite; }
        .scanline::after {
          content: '';
          position: absolute;
          left: 0; right: 0;
          height: 2px;
          background: linear-gradient(to right, transparent, rgba(6,182,212,0.18), transparent);
          animation: scanline 4s linear infinite;
          pointer-events: none;
        }
      `}</style>

      {/* Hero Header */}
      <motion.div
        initial={{ opacity: 0, y: -18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: 'easeOut' }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-7 border border-cyan-500/20 neon-pulse scanline"
      >
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(6,182,212,0.08),transparent_60%)]" />
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-400 to-transparent opacity-70" />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-500 to-transparent opacity-40" />
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <span className="text-3xl">🕌</span>
              <h1
                className="text-3xl font-extrabold tracking-tight"
                style={{
                  background: 'linear-gradient(90deg,#22d3ee,#34d399,#818cf8)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  textShadow: 'none',
                }}
              >
                Zakat Audit Trail
              </h1>
            </div>
            <p className="text-sm text-slate-400 ml-11">
              Full payment history — every Zakat paid, by whom, for what period
            </p>
          </div>
          <div className="hidden sm:flex flex-col items-end gap-1 shrink-0">
            <span className="text-[11px] font-semibold text-cyan-400/70 uppercase tracking-widest">
              Records
            </span>
            <span className="text-2xl font-bold text-cyan-300 tabular-nums">{payments.length}</span>
          </div>
        </div>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 22, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.1 + i * 0.08 }}
            className={`rounded-xl bg-slate-900/90 p-4 border ${colorClass[s.color]}`}
            style={{ boxShadow: `0 0 18px ${s.glow}` }}
          >
            <div className="text-[11px] text-slate-500 font-medium mb-1.5">{s.label}</div>
            <div className={`text-xl font-bold tabular-nums ${colorClass[s.color].split(' ')[0]}`}>
              {s.value}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Hijri Year Breakdown */}
      {hijriSummaries.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.35 }}
          className="rounded-xl bg-slate-900/90 border border-slate-700/60 overflow-hidden"
        >
          <div className="px-5 py-3 border-b border-slate-800 flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-200">By Hijri Year</span>
            <span className="text-[11px] text-slate-500">({hijriSummaries.length} year{hijriSummaries.length !== 1 ? 's' : ''})</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-800">
            {hijriSummaries.map((s) => (
              <div key={s.year} className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-800/30 transition-colors">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ background: 'rgba(6,182,212,0.8)', boxShadow: '0 0 6px rgba(6,182,212,0.7)' }}
                  />
                  <span className="text-sm font-semibold text-slate-200">{s.year} AH</span>
                  <span className="text-xs text-slate-500">{s.count} paid</span>
                </div>
                <span className="text-sm font-bold text-emerald-400 tabular-nums">{money(s.total)}</span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.35, delay: 0.45 }}
        className="flex flex-col sm:flex-row gap-3 items-start sm:items-center"
      >
        <div className="flex gap-1.5 flex-wrap">
          {(['all', ...availableYears] as (number | 'all')[]).map((yr) => (
            <button
              key={String(yr)}
              onClick={() => { setYearFilter(yr); setPage(1) }}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${
                yearFilter === yr
                  ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/50'
                  : 'bg-slate-800/80 text-slate-400 border-slate-700/60 hover:border-slate-600 hover:text-slate-300'
              }`}
              style={yearFilter === yr ? { boxShadow: '0 0 10px rgba(6,182,212,0.2)' } : {}}
            >
              {yr === 'all' ? 'All Years' : yr}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Search source, investment, person…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          className="flex-1 min-w-0 px-3.5 py-1.5 text-sm rounded-lg bg-slate-800/80 border border-slate-700/60 text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/40 transition-all"
          style={{ boxShadow: search ? '0 0 10px rgba(6,182,212,0.1)' : 'none' }}
        />
        {filtered.length !== payments.length && (
          <span className="text-xs text-slate-500 shrink-0">
            {filtered.length} / {payments.length}
          </span>
        )}
      </motion.div>

      {/* Payment Table */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.5 }}
        className="rounded-xl bg-slate-900/90 border border-slate-700/50 overflow-hidden"
        style={{ boxShadow: '0 0 30px rgba(6,182,212,0.06)' }}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/80 bg-slate-800/50">
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Date</th>
                <th className="text-right px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Amount</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Source Bucket</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider hidden md:table-cell">Investment</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider hidden lg:table-cell">Person</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider hidden xl:table-cell">Row ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              <AnimatePresence mode="sync">
                {paginated.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-14 text-slate-500 text-sm">
                      No payments found
                    </td>
                  </tr>
                ) : (
                  paginated.map((p, i) => {
                    const rowId = parseRowId(p.notes)
                    return (
                      <motion.tr
                        key={p.id}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.18, delay: i * 0.018 }}
                        className="hover:bg-slate-800/35 transition-colors group"
                      >
                        <td className="px-4 py-3 font-mono text-xs text-slate-300">{fmtDate(p.date)}</td>
                        <td className="px-4 py-3 text-right">
                          <span
                            className="font-bold tabular-nums text-emerald-400 text-sm"
                            style={{ textShadow: '0 0 8px rgba(16,185,129,0.35)' }}
                          >
                            {money(p.amount)}
                          </span>
                        </td>
                        <td className="px-4 py-3 max-w-[180px]">
                          <span className="text-xs text-slate-300 truncate block" title={p.bucketLabel || 'General Cash'}>
                            {p.bucketLabel || 'General Cash'}
                          </span>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell max-w-[160px]">
                          {p.investmentName ? (
                            <span className="text-xs text-cyan-400/80 truncate block" title={p.investmentName}>
                              {p.investmentName}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-600">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell text-xs text-slate-400">
                          {p.personName || <span className="text-slate-600">Owner</span>}
                        </td>
                        <td className="px-4 py-3 hidden xl:table-cell">
                          {rowId ? (
                            <span
                              className="font-mono text-[10px] text-slate-500 bg-slate-800 px-2 py-0.5 rounded border border-slate-700/60 group-hover:border-cyan-500/20 transition-colors"
                              title={rowId}
                            >
                              {rowId.length > 22 ? rowId.slice(0, 22) + '…' : rowId}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-600">—</span>
                          )}
                        </td>
                      </motion.tr>
                    )
                  })
                )}
              </AnimatePresence>
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-800 bg-slate-900/60">
            <span className="text-xs text-slate-500">
              {filtered.length} record{filtered.length !== 1 ? 's' : ''}
            </span>
            <div className="flex items-center gap-1">
              <button
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-2.5 py-1 text-xs rounded-lg bg-slate-800 border border-slate-700/60 text-slate-300 hover:bg-slate-700 disabled:opacity-35 disabled:cursor-not-allowed transition-all"
              >
                ←
              </button>
              <span className="px-3 py-1 text-xs text-slate-400 tabular-nums">
                {page} / {totalPages}
              </span>
              <button
                disabled={page === totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-2.5 py-1 text-xs rounded-lg bg-slate-800 border border-slate-700/60 text-slate-300 hover:bg-slate-700 disabled:opacity-35 disabled:cursor-not-allowed transition-all"
              >
                →
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  )
}
