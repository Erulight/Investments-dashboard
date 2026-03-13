'use client'

import { useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Card } from '@/components/ui/Card'
import { AnimatedCard } from '@/components/ui/AnimatedCard'
import { tabSwitch, staggerContainer, staggerItem, fadeInUp } from '@/lib/animations'
import { ReconciliationWarnings, type Warning } from './ReconciliationWarnings'
import { InvestmentBreakdown, type InvestmentBreakdownItem } from './InvestmentBreakdown'
import { HawlTimeline, type TimelineItem } from './HawlTimeline'
import { DrillDownModal, type DrillDownData } from './DrillDownModal'
import { ExportButtons } from './ExportButtons'

type BucketRow = {
  id: string
  bucketId: string
  periodIndex: number
  label?: string | null
  currency: string
  balance: number
  haulStartDate: string
  lastZakatPaidDate?: string | null
  haulCompleteDate: string
  idleBase: number
  receiptsTotal: number
  zakatDue: number
  isPaid: boolean
  haulCompleted: boolean
  source: string
  sourceGroup: string
  sourceType: string
  rowKind?: 'PROFIT' | 'COMMISSION' | 'IDLE' | 'PRINCIPAL' | 'RECEIPT' | 'REWARD'
  why?: string | null
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

export interface AuditInvestment {
  id: string
  name: string
  principalAmount: number
  currentValue: number
  maturityDate: string | null
  isActive: boolean
  isMature: boolean
  accountType: string
  fundingSources: Array<{
    bucketLabel: string
    amount: number
    haulDate: string
    bucketId?: string
  }>
}

interface ZakatAuditClientProps {
  rows: BucketRow[]
  investments: AuditInvestment[]
  warnings: Warning[]
  totalWealth: number
  totalPaidThisYear: number
  displayCurrency: string
}

const tabs = [
  { id: 'overview', label: 'Overview', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { id: 'investments', label: 'Investments', icon: 'M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z' },
  { id: 'timeline', label: 'Timeline', icon: 'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5' },
  { id: 'warnings', label: 'Warnings', icon: 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z' },
  { id: 'export', label: 'Export', icon: 'M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3' },
]

export function ZakatAuditClient({
  rows,
  investments,
  warnings,
  totalWealth,
  totalPaidThisYear,
  displayCurrency,
}: ZakatAuditClientProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState('overview')
  const [drillDownRowId, setDrillDownRowId] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const currency = displayCurrency || 'SAR'
  const money = useCallback((v: number) => {
    const absVal = Math.abs(v)
    if (absVal >= 1000000) return `${currency} ${(v / 1000000).toFixed(2)}M`
    if (absVal >= 1000) return `${currency} ${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    return `${currency} ${v.toFixed(2)}`
  }, [currency])

  const totalDue = useMemo(() =>
    rows.reduce((s, r) => s + (r.isPaid ? 0 : Math.max(0, r.zakatDue)), 0),
    [rows]
  )

  const remainingToPay = useMemo(() => Math.max(0, totalDue), [totalDue])

  const nextDueDate = useMemo(() => {
    const now = new Date()
    const upcomingDates = rows
      .filter(r => !r.isPaid && !r.haulCompleted)
      .map(r => r.haulCompleteDate)
      .filter(Boolean)
      .map(d => new Date(d))
      .filter(d => !isNaN(d.getTime()) && d > now)
      .sort((a, b) => a.getTime() - b.getTime())
    return upcomingDates[0]?.toISOString().split('T')[0] || null
  }, [rows])

  const systemHealth = warnings.length === 0 ? 'ALL_CLEAR' as const : 'WARNINGS' as const

  const investmentBreakdowns: InvestmentBreakdownItem[] = useMemo(() => {
    return investments.map(inv => {
      const invRows = rows.filter(r =>
        r.source === inv.name ||
        r.sourceGroup.includes(inv.name) ||
        r.dueReceipts.some(dr => dr.investmentName === inv.name)
      )
      const zakatRows = invRows.map(r => ({
        type: (r.rowKind === 'PROFIT' ? 'profit' : r.rowKind === 'PRINCIPAL' ? 'principal' : r.rowKind === 'RECEIPT' ? 'receipt' : r.rowKind === 'REWARD' ? 'reward' : 'idle') as 'principal' | 'profit' | 'idle' | 'receipt' | 'reward',
        label: r.label || r.source,
        amount: r.zakatDue,
        status: (r.isPaid ? 'paid' : r.zakatDue > 0 ? 'due' : 'upcoming') as 'paid' | 'due' | 'upcoming',
        period: `${r.haulStartDate} → ${r.haulCompleteDate}`,
        rowId: r.id,
      }))
      const totalZakat = zakatRows.reduce((s, r) => s + r.amount, 0)
      return {
        id: inv.id, name: inv.name, totalPrincipal: inv.principalAmount, currentValue: inv.currentValue,
        maturityDate: inv.maturityDate, isActive: inv.isActive, isMature: inv.isMature,
        fundingSources: inv.fundingSources, zakatRows, totalZakat,
      }
    }).filter(inv => inv.zakatRows.length > 0)
  }, [investments, rows])

  const timelineItems: TimelineItem[] = useMemo(() => {
    return rows.map(r => ({
      id: r.id, source: r.source || 'General Cash', sourceType: r.sourceType,
      haulStart: r.haulStartDate, haulEnd: r.haulCompleteDate,
      status: (r.isPaid ? 'paid' : r.zakatDue > 0 && r.haulCompleted ? 'due' : 'upcoming') as 'paid' | 'due' | 'upcoming',
      zakatAmount: r.zakatDue, balance: r.idleBase + r.receiptsTotal,
      rowKind: r.rowKind || undefined, nextDueDate: r.haulCompleted ? null : r.haulCompleteDate,
    }))
  }, [rows])

  const drillDownData: DrillDownData | null = useMemo(() => {
    if (!drillDownRowId) return null
    const row = rows.find(r => r.id === drillDownRowId)
    if (!row) return null
    const firstReceipt = row.dueReceipts[0]
    return {
      rowId: row.id, sourceBucket: row.label || row.source, bucketAmount: row.balance,
      firstContributionDate: null, receiptDate: firstReceipt?.date || null,
      hawlStart: row.haulStartDate, hawlEnd: row.haulCompleteDate,
      amountHeld: row.idleBase + row.receiptsTotal,
      amountWithdrawn: Math.max(0, row.balance - (row.idleBase + row.receiptsTotal)),
      taxableAmount: row.zakatDue > 0 ? row.zakatDue / 0.025 : 0,
      zakatRate: 0.025, zakatDue: row.zakatDue, isPaid: row.isPaid,
      lastPaymentDate: row.lastPayment?.date || null,
      lastPaymentAmount: row.lastPayment?.amount || null,
      investmentName: firstReceipt?.investmentName || (row.source !== 'General' ? row.source : null),
      investmentStatus: row.haulCompleted ? 'Hawl Completed' : 'In Progress',
      rowKind: row.rowKind || null, why: row.why || null, dueReceipts: row.dueReceipts,
    }
  }, [drillDownRowId, rows])

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true)
    router.refresh()
    setTimeout(() => setIsRefreshing(false), 1000)
  }, [router])

  // Summary stats for the Overview cards
  const paidCount = rows.filter(r => r.isPaid).length
  const dueCount = rows.filter(r => !r.isPaid && r.zakatDue > 0 && r.haulCompleted).length
  const upcomingCount = rows.filter(r => !r.isPaid && !r.haulCompleted).length

  const summaryCards = [
    { label: 'Total Wealth', value: money(totalWealth), sub: `${rows.length} tracked rows`, color: 'text-blue-400', bg: 'dark:bg-blue-500/10', border: 'dark:border-blue-500/20' },
    { label: 'Zakat Due', value: money(totalDue), sub: `${dueCount} due now`, color: 'text-amber-400', bg: 'dark:bg-amber-500/10', border: 'dark:border-amber-500/20' },
    { label: 'Paid This Year', value: money(totalPaidThisYear), sub: `${paidCount} rows paid`, color: 'text-emerald-400', bg: 'dark:bg-emerald-500/10', border: 'dark:border-emerald-500/20' },
    { label: 'Remaining', value: money(remainingToPay), sub: remainingToPay > 0 ? 'Action needed' : 'All clear', color: remainingToPay > 0 ? 'text-red-400' : 'text-emerald-400', bg: remainingToPay > 0 ? 'dark:bg-red-500/10' : 'dark:bg-emerald-500/10', border: remainingToPay > 0 ? 'dark:border-red-500/20' : 'dark:border-emerald-500/20' },
    { label: 'Next Due Date', value: nextDueDate || 'None', sub: `${upcomingCount} upcoming`, color: 'text-purple-400', bg: 'dark:bg-purple-500/10', border: 'dark:border-purple-500/20' },
    { label: 'System Health', value: systemHealth === 'ALL_CLEAR' ? 'All Clear' : `${warnings.length} Warning${warnings.length !== 1 ? 's' : ''}`, sub: systemHealth === 'ALL_CLEAR' ? 'No issues found' : 'Review needed', color: systemHealth === 'ALL_CLEAR' ? 'text-emerald-400' : 'text-red-400', bg: systemHealth === 'ALL_CLEAR' ? 'dark:bg-emerald-500/10' : 'dark:bg-red-500/10', border: systemHealth === 'ALL_CLEAR' ? 'dark:border-emerald-500/20' : 'dark:border-red-500/20' },
  ]

  return (
    <div className="space-y-6">
      {/* ── Tab Bar ── */}
      <div className="flex items-center gap-1 border-b border-white/10 overflow-x-auto pb-px">
        {tabs.map((tab) => (
          <motion.button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`relative flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? 'text-[#c9a84c]'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d={tab.icon} />
            </svg>
            {tab.label}
            {tab.id === 'warnings' && warnings.length > 0 && (
              <span className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500/20 text-[10px] font-bold text-red-400">
                {warnings.length}
              </span>
            )}
            {activeTab === tab.id && (
              <motion.div
                layoutId="auditActiveTab"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#c9a84c]"
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              />
            )}
          </motion.button>
        ))}

        {/* Refresh button at right end */}
        <div className="ml-auto pl-2 shrink-0">
          <motion.button
            onClick={handleRefresh}
            disabled={isRefreshing}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors disabled:opacity-50"
          >
            <svg className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </motion.button>
        </div>
      </div>

      {/* ── Tab Content ── */}
      <AnimatePresence mode="wait">
        {/* ─── OVERVIEW TAB ─── */}
        {activeTab === 'overview' && (
          <motion.div key="overview" initial="hidden" animate="visible" exit="exit" variants={tabSwitch}>
            <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
              {summaryCards.map((card, i) => (
                <motion.div key={i} variants={staggerItem}>
                  <AnimatedCard index={i} className={`!p-5 ${card.bg} ${card.border}`}>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">{card.label}</p>
                    <p className={`text-xl font-bold tabular-nums ${card.color}`}>{card.value}</p>
                    <p className="text-[11px] text-slate-500 mt-1">{card.sub}</p>
                  </AnimatedCard>
                </motion.div>
              ))}
            </motion.div>

            {/* Quick health banner */}
            {warnings.length === 0 ? (
              <motion.div variants={fadeInUp} initial="hidden" animate="visible">
                <Card className="!bg-emerald-500/5 !border-emerald-500/20">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/15">
                      <svg className="h-5 w-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-emerald-300">All Calculations Verified</p>
                      <p className="text-xs text-emerald-400/60">No reconciliation warnings found. Zakat data is consistent.</p>
                    </div>
                  </div>
                </Card>
              </motion.div>
            ) : (
              <motion.div variants={fadeInUp} initial="hidden" animate="visible">
                <div
                  className="rounded-xl p-6 bg-red-500/5 border border-red-500/20 cursor-pointer hover:bg-red-500/[0.07] transition-colors"
                  onClick={() => setActiveTab('warnings')}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/15">
                        <svg className="h-5 w-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-red-300">{warnings.length} Warning{warnings.length !== 1 ? 's' : ''} Found</p>
                        <p className="text-xs text-red-400/60">Click to view details and auto-fix options</p>
                      </div>
                    </div>
                    <svg className="h-5 w-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Quick row summary table */}
            <motion.div variants={fadeInUp} initial="hidden" animate="visible" className="mt-6">
              <Card>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-slate-200">Recent Zakat Rows</h3>
                  <span className="text-xs text-slate-500">{rows.length} total</span>
                </div>
                <div className="overflow-x-auto -mx-6 px-6">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-white/5 text-slate-500">
                        <th className="text-left py-2 pr-4 font-semibold">Source</th>
                        <th className="text-left py-2 pr-4 font-semibold">Type</th>
                        <th className="text-left py-2 pr-4 font-semibold">Period</th>
                        <th className="text-right py-2 pr-4 font-semibold">Balance</th>
                        <th className="text-right py-2 pr-4 font-semibold">Zakat Due</th>
                        <th className="text-center py-2 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, 10).map((row, i) => (
                        <tr
                          key={row.id}
                          className="border-b border-white/[0.03] hover:bg-white/[0.02] cursor-pointer transition-colors"
                          onClick={() => setDrillDownRowId(row.id)}
                        >
                          <td className="py-2.5 pr-4 text-slate-300 max-w-[200px] truncate">{row.source}</td>
                          <td className="py-2.5 pr-4">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              row.rowKind === 'PROFIT' ? 'bg-emerald-500/15 text-emerald-300'
                              : row.rowKind === 'COMMISSION' ? 'bg-blue-500/15 text-blue-300'
                              : row.rowKind === 'REWARD' ? 'bg-violet-500/15 text-violet-300'
                              : row.rowKind === 'RECEIPT' ? 'bg-teal-500/15 text-teal-300'
                              : row.rowKind === 'PRINCIPAL' ? 'bg-sky-500/15 text-sky-300'
                              : 'bg-amber-500/15 text-amber-300'
                            }`}>
                              {row.rowKind || 'IDLE'}
                            </span>
                          </td>
                          <td className="py-2.5 pr-4 text-slate-500 tabular-nums">{row.haulStartDate} → {row.haulCompleteDate}</td>
                          <td className="py-2.5 pr-4 text-right text-slate-300 tabular-nums">{money(row.balance)}</td>
                          <td className="py-2.5 pr-4 text-right font-semibold tabular-nums text-[#c9a84c]">{money(row.zakatDue)}</td>
                          <td className="py-2.5 text-center">
                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              row.isPaid ? 'bg-emerald-500/15 text-emerald-300'
                              : row.zakatDue > 0 ? 'bg-amber-500/15 text-amber-300'
                              : 'bg-slate-500/15 text-slate-400'
                            }`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${row.isPaid ? 'bg-emerald-400' : row.zakatDue > 0 ? 'bg-amber-400' : 'bg-slate-500'}`} />
                              {row.isPaid ? 'Paid' : row.zakatDue > 0 ? 'Due' : 'Upcoming'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {rows.length > 10 && (
                    <p className="text-center text-xs text-slate-500 py-3">Showing 10 of {rows.length} rows. Click any row for details.</p>
                  )}
                </div>
              </Card>
            </motion.div>
          </motion.div>
        )}

        {/* ─── INVESTMENTS TAB ─── */}
        {activeTab === 'investments' && (
          <motion.div key="investments" initial="hidden" animate="visible" exit="exit" variants={tabSwitch}>
            <InvestmentBreakdown
              investments={investmentBreakdowns}
              money={money}
              onDrillDown={(rowId) => setDrillDownRowId(rowId)}
            />
          </motion.div>
        )}

        {/* ─── TIMELINE TAB ─── */}
        {activeTab === 'timeline' && (
          <motion.div key="timeline" initial="hidden" animate="visible" exit="exit" variants={tabSwitch}>
            <HawlTimeline items={timelineItems} money={money} />
          </motion.div>
        )}

        {/* ─── WARNINGS TAB ─── */}
        {activeTab === 'warnings' && (
          <motion.div key="warnings" initial="hidden" animate="visible" exit="exit" variants={tabSwitch}>
            <ReconciliationWarnings warnings={warnings} onRefresh={handleRefresh} />
          </motion.div>
        )}

        {/* ─── EXPORT TAB ─── */}
        {activeTab === 'export' && (
          <motion.div key="export" initial="hidden" animate="visible" exit="exit" variants={tabSwitch}>
            <Card>
              <h3 className="text-sm font-semibold text-slate-200 mb-4">Export Zakat Data</h3>
              <p className="text-xs text-slate-400 mb-6">
                Generate reports for your records. The PDF includes a full summary with all zakat rows, investment breakdown, and reconciliation status. The CSV exports raw ledger data.
              </p>
              <ExportButtons
                rows={rows}
                totalWealth={totalWealth}
                totalDue={totalDue}
                totalPaidThisYear={totalPaidThisYear}
                remainingToPay={remainingToPay}
                warningCount={warnings.length}
                money={money}
              />
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Drill Down Modal ── */}
      <DrillDownModal
        isOpen={!!drillDownRowId}
        onClose={() => setDrillDownRowId(null)}
        data={drillDownData}
        money={money}
      />
    </div>
  )
}
