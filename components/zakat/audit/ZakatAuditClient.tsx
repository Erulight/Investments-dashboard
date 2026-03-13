'use client'

import { useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { SummaryCards } from './SummaryCards'
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

export function ZakatAuditClient({
  rows,
  investments,
  warnings,
  totalWealth,
  totalPaidThisYear,
  displayCurrency,
}: ZakatAuditClientProps) {
  const router = useRouter()
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

  // Build investment breakdown from rows
  const investmentBreakdowns: InvestmentBreakdownItem[] = useMemo(() => {
    return investments.map(inv => {
      const invRows = rows.filter(r =>
        r.source === inv.name ||
        r.sourceGroup.includes(inv.name) ||
        r.dueReceipts.some(dr => dr.investmentName === inv.name)
      )

      const zakatRows = invRows.map(r => ({
        type: (r.rowKind === 'PROFIT' ? 'profit' :
               r.rowKind === 'PRINCIPAL' ? 'principal' :
               r.rowKind === 'RECEIPT' ? 'receipt' :
               r.rowKind === 'REWARD' ? 'reward' : 'idle') as 'principal' | 'profit' | 'idle' | 'receipt' | 'reward',
        label: r.label || r.source,
        amount: r.zakatDue,
        status: (r.isPaid ? 'paid' : r.zakatDue > 0 ? 'due' : 'upcoming') as 'paid' | 'due' | 'upcoming',
        period: `${r.haulStartDate} → ${r.haulCompleteDate}`,
        rowId: r.id,
      }))

      const totalZakat = zakatRows.reduce((s, r) => s + r.amount, 0)

      return {
        id: inv.id,
        name: inv.name,
        totalPrincipal: inv.principalAmount,
        currentValue: inv.currentValue,
        maturityDate: inv.maturityDate,
        isActive: inv.isActive,
        isMature: inv.isMature,
        fundingSources: inv.fundingSources,
        zakatRows,
        totalZakat,
      }
    }).filter(inv => inv.zakatRows.length > 0)
  }, [investments, rows])

  // Build timeline items from rows
  const timelineItems: TimelineItem[] = useMemo(() => {
    return rows.map(r => ({
      id: r.id,
      source: r.source || 'General Cash',
      sourceType: r.sourceType,
      haulStart: r.haulStartDate,
      haulEnd: r.haulCompleteDate,
      status: (r.isPaid ? 'paid' : r.zakatDue > 0 && r.haulCompleted ? 'due' : 'upcoming') as 'paid' | 'due' | 'upcoming',
      zakatAmount: r.zakatDue,
      balance: r.idleBase + r.receiptsTotal,
      rowKind: r.rowKind || undefined,
      nextDueDate: r.haulCompleted ? null : r.haulCompleteDate,
    }))
  }, [rows])

  // Build drill-down data
  const drillDownData: DrillDownData | null = useMemo(() => {
    if (!drillDownRowId) return null
    const row = rows.find(r => r.id === drillDownRowId)
    if (!row) return null

    const firstReceipt = row.dueReceipts[0]

    return {
      rowId: row.id,
      sourceBucket: row.label || row.source,
      bucketAmount: row.balance,
      firstContributionDate: null,
      receiptDate: firstReceipt?.date || null,
      hawlStart: row.haulStartDate,
      hawlEnd: row.haulCompleteDate,
      amountHeld: row.idleBase + row.receiptsTotal,
      amountWithdrawn: Math.max(0, row.balance - (row.idleBase + row.receiptsTotal)),
      taxableAmount: row.zakatDue > 0 ? row.zakatDue / 0.025 : 0,
      zakatRate: 0.025,
      zakatDue: row.zakatDue,
      isPaid: row.isPaid,
      lastPaymentDate: row.lastPayment?.date || null,
      lastPaymentAmount: row.lastPayment?.amount || null,
      investmentName: firstReceipt?.investmentName || (row.source !== 'General' ? row.source : null),
      investmentStatus: row.haulCompleted ? 'Hawl Completed' : 'In Progress',
      rowKind: row.rowKind || null,
      why: row.why || null,
      dueReceipts: row.dueReceipts,
    }
  }, [drillDownRowId, rows])

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true)
    router.refresh()
    setTimeout(() => setIsRefreshing(false), 1000)
  }, [router])

  return (
    <div className="space-y-8">
      <style jsx global>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Header with Export + Refresh */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Zakat Audit & Verification</h1>
          <p className="text-sm text-slate-400 mt-1">
            Complete review of all zakat calculations, hawl timelines, and reconciliation checks.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ExportButtons
            rows={rows}
            totalWealth={totalWealth}
            totalDue={totalDue}
            totalPaidThisYear={totalPaidThisYear}
            remainingToPay={remainingToPay}
            warningCount={warnings.length}
            money={money}
          />
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-2 rounded-lg bg-slate-700/40 border border-slate-600/40 px-3 py-2.5 text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-700/60 transition-colors disabled:opacity-50"
          >
            <svg className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Section 1: Summary Cards */}
      <SummaryCards
        totalWealth={totalWealth}
        totalDue={totalDue}
        totalPaidThisYear={totalPaidThisYear}
        remainingToPay={remainingToPay}
        nextDueDate={nextDueDate}
        systemHealth={systemHealth}
        warningCount={warnings.length}
        money={money}
      />

      {/* Section 4: Reconciliation Warnings */}
      <ReconciliationWarnings warnings={warnings} onRefresh={handleRefresh} />

      {/* Section 2: Per Investment Breakdown */}
      <InvestmentBreakdown
        investments={investmentBreakdowns}
        money={money}
        onDrillDown={(rowId) => setDrillDownRowId(rowId)}
      />

      {/* Section 3: Hawl Timeline View */}
      <HawlTimeline items={timelineItems} money={money} />

      {/* Section 5: Drill Down Modal */}
      <DrillDownModal
        isOpen={!!drillDownRowId}
        onClose={() => setDrillDownRowId(null)}
        data={drillDownData}
        money={money}
      />
    </div>
  )
}
