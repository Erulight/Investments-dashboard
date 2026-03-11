'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { formatDisplayDate } from '@/lib/date'

interface Transaction {
  id: string
  type: string
  amount: number
  date: string
  description: string | null
  createdAt: string
  investmentId?: string | null
  investmentName?: string | null
  investmentCategory?: string | null
  personId?: string | null
  personName?: string | null
  metadataSource?: string | null
  direction?: 'IN' | 'OUT'
  moneyFrom?: string | null
  moneyTo?: string | null
}

interface Bucket {
  id: string
  label: string | null
  balance: number
  currency: string
  haulStartDate: string
  lastZakatPaidDate: string | null
  createdAt: string
}

interface LedgerData {
  cashBalance: number
  transactions: Transaction[]
  totalCount: number
  page: number
  limit: number
  totalPages: number
  buckets: Bucket[]
  transactionTypes: string[]
  availableYears: number[]
  summary?: {
    inflow: number
    outflow: number
    net: number
    count: number
  }
  userRole?: 'OWNER' | 'PARTNER' | string
}

const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtDate = (d: string) => formatDisplayDate(d)
const MONTHS = [
  { value: '1', label: 'Jan' },
  { value: '2', label: 'Feb' },
  { value: '3', label: 'Mar' },
  { value: '4', label: 'Apr' },
  { value: '5', label: 'May' },
  { value: '6', label: 'Jun' },
  { value: '7', label: 'Jul' },
  { value: '8', label: 'Aug' },
  { value: '9', label: 'Sep' },
  { value: '10', label: 'Oct' },
  { value: '11', label: 'Nov' },
  { value: '12', label: 'Dec' },
]

export function CashLedgerClient() {
  const [data, setData] = useState<LedgerData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [typeFilter, setTypeFilter] = useState('')
  const [flowFilter, setFlowFilter] = useState<'ALL' | 'IN' | 'OUT'>('ALL')
  const [yearFilter, setYearFilter] = useState('')
  const [monthFilter, setMonthFilter] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [searchFilter, setSearchFilter] = useState('')
  const [activeTab, setActiveTab] = useState<'transactions' | 'buckets'>('transactions')
  const [sendAmount, setSendAmount] = useState('')
  const [sendDate, setSendDate] = useState('')
  const [sendNotes, setSendNotes] = useState('')
  const [sendLoading, setSendLoading] = useState(false)
  const [sendMessage, setSendMessage] = useState('')
  const [sendError, setSendError] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ page: String(page), limit: '50' })
      if (typeFilter) params.set('type', typeFilter)
      if (flowFilter !== 'ALL') params.set('flow', flowFilter)
      if (yearFilter) params.set('year', yearFilter)
      if (monthFilter) params.set('month', monthFilter)
      if (searchFilter) params.set('q', searchFilter)
      const res = await fetch(`/api/cash/ledger?${params}`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Failed to load ledger')
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load ledger')
    } finally {
      setLoading(false)
    }
  }, [page, typeFilter, flowFilter, yearFilter, monthFilter, searchFilter])

  useEffect(() => { loadData() }, [loadData])

  const runSearch = () => {
    setPage(1)
    setSearchFilter(searchInput.trim())
  }

  const clearAllFilters = () => {
    setTypeFilter('')
    setFlowFilter('ALL')
    setYearFilter('')
    setMonthFilter('')
    setSearchInput('')
    setSearchFilter('')
    setPage(1)
  }

  const exportCsv = () => {
    const params = new URLSearchParams({ export: 'csv' })
    if (typeFilter) params.set('type', typeFilter)
    if (flowFilter !== 'ALL') params.set('flow', flowFilter)
    if (yearFilter) params.set('year', yearFilter)
    if (monthFilter) params.set('month', monthFilter)
    if (searchFilter) params.set('q', searchFilter)
    window.open(`/api/cash/ledger?${params.toString()}`, '_blank', 'noopener,noreferrer')
  }

  // Compute running balance for transactions (most recent first)
  const transactionsWithBalance = (() => {
    if (!data) return []
    // We need total of all amounts AFTER this page to compute running balance
    // For simplicity, we'll show cumulative from top of current page
    let runningBal = data.cashBalance
    // Adjust: if we're not on page 1, we don't have the exact starting balance
    // but for page 1, cashBalance is the current total
    if (data.page > 1) {
      // Can't compute exact running balance without server support, show amounts only
      return data.transactions.map((tx: Transaction) => ({ ...tx, runningBalance: null as number | null }))
    }
    // Page 1: current balance, walk backwards
    const result = data.transactions.map((tx: Transaction) => {
      const bal = runningBal
      runningBal -= tx.amount
      return { ...tx, runningBalance: bal }
    })
    return result
  })()

  const txPageTotals = useMemo(() => {
    if (!data || transactionsWithBalance.length === 0) return null
    const debit = transactionsWithBalance.reduce(
      (s: number, tx: Transaction & { runningBalance?: number | null }) => s + (tx.amount < 0 ? Math.abs(tx.amount) : 0),
      0
    )
    const credit = transactionsWithBalance.reduce(
      (s: number, tx: Transaction & { runningBalance?: number | null }) => s + (tx.amount >= 0 ? tx.amount : 0),
      0
    )
    return { debit, credit }
  }, [data, transactionsWithBalance])

  const activeBuckets = data?.buckets.filter((b: Bucket) => b.balance > 0) || []
  const depletedBuckets = data?.buckets.filter((b: Bucket) => b.balance <= 0) || []
  const totalBucketBalance = activeBuckets.reduce((s: number, b: Bucket) => s + b.balance, 0)
  const totalDepletedBalance = depletedBuckets.reduce((s: number, b: Bucket) => s + b.balance, 0)
  const activeFilterCount = [
    Boolean(typeFilter),
    flowFilter !== 'ALL',
    Boolean(yearFilter),
    Boolean(monthFilter),
    Boolean(searchFilter),
  ].filter(Boolean).length
  const summary = data?.summary || { inflow: 0, outflow: 0, net: 0, count: 0 }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-xl shadow-md p-6 text-white">
        <h1 className="text-2xl font-bold">Cash Ledger</h1>
        <p className="text-sm text-slate-400 mt-1">Complete record of all cash movements and haul buckets</p>
        {data && (
          <div className="flex items-center gap-8 mt-4">
            <div>
              <div className="text-[11px] text-slate-400 uppercase tracking-wider">Current Balance</div>
              <div className="text-xl font-bold tabular-nums">SAR {fmt(data.cashBalance)}</div>
            </div>
            <div>
              <div className="text-[11px] text-slate-400 uppercase tracking-wider">Active Buckets</div>
              <div className="text-xl font-bold tabular-nums">{activeBuckets.length}</div>
            </div>
            <div>
              <div className="text-[11px] text-slate-400 uppercase tracking-wider">Bucket Balance</div>
              <div className="text-xl font-bold tabular-nums">SAR {fmt(totalBucketBalance)}</div>
            </div>
            <div>
              <div className="text-[11px] text-slate-400 uppercase tracking-wider">Total Entries</div>
              <div className="text-xl font-bold tabular-nums">{data.totalCount}</div>
            </div>
          </div>
        )}
        {data && (data as any).userRole === 'PARTNER' && (
          <div className="mt-4 bg-white/5 rounded-lg p-4 flex flex-col gap-2 max-w-md">
            <div className="text-xs font-semibold text-slate-200 uppercase tracking-wider">Send to Owner</div>
            <div className="flex gap-2 items-center">
              <input
                type="number"
                min="0"
                step="0.01"
                value={sendAmount}
                onChange={(e) => setSendAmount(e.target.value)}
                className="flex-1 rounded-md border border-slate-500/40 bg-slate-900/30 px-2 py-1.5 text-xs text-white placeholder-slate-400 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 outline-none"
                placeholder="Amount (SAR)"
              />
              <input
                type="date"
                value={sendDate}
                onChange={(e) => setSendDate(e.target.value)}
                className="rounded-md border border-slate-500/40 bg-slate-900/30 px-2 py-1.5 text-xs text-white placeholder-slate-400 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 outline-none"
              />
            </div>
            <input
              type="text"
              value={sendNotes}
              onChange={(e) => setSendNotes(e.target.value)}
              className="rounded-md border border-slate-500/40 bg-slate-900/30 px-2 py-1.5 text-xs text-white placeholder-slate-400 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 outline-none"
              placeholder="Notes (optional)"
            />
            <div className="flex items-center gap-2 mt-1">
              <Button
                size="sm"
                variant="primary"
                disabled={sendLoading}
                onClick={async () => {
                  setSendLoading(true)
                  setSendError('')
                  setSendMessage('')
                  try {
                    const amount = Number(sendAmount)
                    if (!Number.isFinite(amount) || amount <= 0) {
                      throw new Error('Amount must be greater than 0')
                    }
                    const date = sendDate || new Date().toISOString().slice(0, 10)
                    const res = await fetch('/api/cash/transfer', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        amount,
                        direction: 'FROM_PARTNER',
                        date,
                        notes: sendNotes,
                      }),
                    })
                    const json = await res.json().catch(() => ({}))
                    if (!res.ok) {
                      throw new Error(json.error || 'Failed to transfer cash')
                    }
                    setSendAmount('')
                    setSendNotes('')
                    setSendDate('')
                    setSendMessage('Transfer recorded')
                    await loadData()
                  } catch (err) {
                    setSendError(err instanceof Error ? err.message : 'Failed to transfer cash')
                  } finally {
                    setSendLoading(false)
                  }
                }}
              >
                {sendLoading ? 'Sending...' : 'Send to Owner'}
              </Button>
              {sendMessage && <span className="text-[11px] text-emerald-300">{sendMessage}</span>}
              {sendError && <span className="text-[11px] text-red-300">{sendError}</span>}
            </div>
          </div>
        )}
      </div>

      {/* Period summary cards */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-4 transition-transform duration-200 hover:-translate-y-0.5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">Inflow</div>
          <div className="mt-1 text-lg font-bold tabular-nums text-emerald-800">SAR {fmt(summary.inflow)}</div>
          <div className="mt-1 text-[11px] text-emerald-700/80">Filtered period receipts</div>
        </div>
        <div className="rounded-xl border border-rose-100 bg-rose-50/70 p-4 transition-transform duration-200 hover:-translate-y-0.5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-rose-700">Outflow</div>
          <div className="mt-1 text-lg font-bold tabular-nums text-rose-800">SAR {fmt(summary.outflow)}</div>
          <div className="mt-1 text-[11px] text-rose-700/80">Filtered period deductions</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 transition-transform duration-200 hover:-translate-y-0.5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Net Flow</div>
          <div className={`mt-1 text-lg font-bold tabular-nums ${summary.net >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
            SAR {fmt(Math.abs(summary.net))} {summary.net >= 0 ? '↑' : '↓'}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">Inflow - Outflow</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 transition-transform duration-200 hover:-translate-y-0.5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Filtered Entries</div>
          <div className="mt-1 text-lg font-bold tabular-nums text-slate-900">{summary.count}</div>
          <div className="mt-1 text-[11px] text-slate-500">Transactions after applied filters</div>
        </div>
      </div>

      {/* Tab Toggle */}
      <div className="flex w-fit items-center gap-1 rounded-lg bg-gray-100 p-1 dark:bg-slate-900/60">
        <button
          onClick={() => setActiveTab('transactions')}
          className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'transactions'
              ? 'bg-white text-gray-900 shadow-sm dark:bg-slate-100 dark:text-slate-900'
              : 'text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          Transactions ({data?.totalCount ?? 0})
        </button>
        <button
          onClick={() => setActiveTab('buckets')}
          className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'buckets'
              ? 'bg-white text-gray-900 shadow-sm dark:bg-slate-100 dark:text-slate-900'
              : 'text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          Haul Buckets ({data?.buckets.length ?? 0})
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 border border-red-200">{error}</div>
      )}

      {/* Transactions Tab */}
      {activeTab === 'transactions' && (
        <Card>
          <CardHeader>
            <div className="space-y-3">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                <CardTitle className="text-sm font-bold text-gray-800">Transaction History</CardTitle>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="secondary" onClick={clearAllFilters}>
                    Reset ({activeFilterCount})
                  </Button>
                  <Button size="sm" variant="primary" onClick={exportCsv}>
                    Download CSV
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-2 lg:grid-cols-12">
                <div className="lg:col-span-4">
                  <div className="flex gap-2">
                    <input
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          runSearch()
                        }
                      }}
                      placeholder="Search type, notes, deal, person"
                      className="w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-500"
                    />
                    <Button size="sm" variant="secondary" onClick={runSearch}>Apply</Button>
                  </div>
                </div>
                <div className="lg:col-span-2">
                  <select
                    value={flowFilter}
                    onChange={(e) => { setFlowFilter(e.target.value as 'ALL' | 'IN' | 'OUT'); setPage(1) }}
                    className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-500"
                  >
                    <option value="ALL">All flows</option>
                    <option value="IN">Inflow only</option>
                    <option value="OUT">Outflow only</option>
                  </select>
                </div>
                <div className="lg:col-span-2">
                  <select
                    value={yearFilter}
                    onChange={(e) => {
                      setYearFilter(e.target.value)
                      setMonthFilter('')
                      setPage(1)
                    }}
                    className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-500"
                  >
                    <option value="">All years</option>
                    {(data?.availableYears || []).map((year) => (
                      <option key={year} value={String(year)}>{year}</option>
                    ))}
                  </select>
                </div>
                <div className="lg:col-span-2">
                  <select
                    value={monthFilter}
                    onChange={(e) => { setMonthFilter(e.target.value); setPage(1) }}
                    disabled={!yearFilter}
                    className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-500 disabled:opacity-60"
                  >
                    <option value="">All months</option>
                    {MONTHS.map((month) => (
                      <option key={month.value} value={month.value}>{month.label}</option>
                    ))}
                  </select>
                </div>
                <div className="lg:col-span-2">
                  <select
                    value={typeFilter}
                    onChange={(e) => { setTypeFilter(e.target.value); setPage(1) }}
                    className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-500"
                  >
                    <option value="">All types</option>
                    {(data?.transactionTypes || []).map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-6 text-center text-sm text-gray-400">Loading...</div>
            ) : transactionsWithBalance.length === 0 ? (
              <div className="p-6 text-center text-sm text-gray-400">No transactions found.</div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-left text-xs text-gray-500 border-b border-gray-200">
                        <th className="py-2.5 px-4 font-medium">Date</th>
                        <th className="py-2.5 px-4 font-medium">Type</th>
                        <th className="py-2.5 px-4 font-medium">Investment</th>
                        <th className="py-2.5 px-4 font-medium">Counterparty</th>
                        <th className="py-2.5 px-4 font-medium">Flow</th>
                        <th className="py-2.5 px-4 font-medium">Money Trail</th>
                        <th className="py-2.5 px-4 font-medium">Description</th>
                        <th className="py-2.5 px-4 font-medium text-right">Debit</th>
                        <th className="py-2.5 px-4 font-medium text-right">Credit</th>
                        {page === 1 && <th className="py-2.5 px-4 font-medium text-right">Balance</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {transactionsWithBalance.map((tx: Transaction & { runningBalance?: number | null }) => (
                        <tr key={tx.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="py-2.5 px-4 text-gray-600 whitespace-nowrap tabular-nums">{fmtDate(tx.date)}</td>
                          <td className="py-2.5 px-4">
                            <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-medium ${
                              tx.amount >= 0
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-red-50 text-red-700'
                            }`}>
                              {tx.type}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-gray-700">
                            <div className="font-medium text-gray-700">{tx.investmentName || '—'}</div>
                            {tx.investmentCategory && (
                              <div className="text-[11px] text-gray-500">{tx.investmentCategory}</div>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-gray-600">
                            {tx.personName || tx.metadataSource || '—'}
                          </td>
                          <td className="py-2.5 px-4 text-gray-600">
                            <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-medium ${
                              tx.amount >= 0
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-rose-50 text-rose-700'
                            }`}>
                              {tx.amount >= 0 ? 'IN' : 'OUT'}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-[12px] text-gray-600 min-w-[220px]">
                            <div><span className="font-medium">From:</span> {tx.moneyFrom || '—'}</div>
                            <div><span className="font-medium">To:</span> {tx.moneyTo || '—'}</div>
                          </td>
                          <td className="py-2.5 px-4 text-gray-600 min-w-[240px]">
                            <div className="truncate max-w-[320px]">{tx.description || '—'}</div>
                            {tx.metadataSource && (
                              <div className="mt-0.5 text-[11px] text-gray-500">Source: {tx.metadataSource}</div>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-right tabular-nums text-red-600 whitespace-nowrap">
                            {tx.amount < 0 ? fmt(Math.abs(tx.amount)) : ''}
                          </td>
                          <td className="py-2.5 px-4 text-right tabular-nums text-emerald-600 whitespace-nowrap">
                            {tx.amount >= 0 ? fmt(tx.amount) : ''}
                          </td>
                          {page === 1 && (
                            <td className="py-2.5 px-4 text-right font-medium tabular-nums text-gray-900 whitespace-nowrap">
                              {typeof tx.runningBalance === 'number' && Number.isFinite(tx.runningBalance)
                                ? `SAR ${fmt(tx.runningBalance)}`
                                : '—'}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                    {txPageTotals && (
                      <tfoot>
                        <tr className="bg-gray-50 border-t border-gray-200">
                          <td colSpan={7} className="py-2.5 px-4 text-xs font-semibold text-gray-500">Total (this page)</td>
                          <td className="py-2.5 px-4 text-right font-bold tabular-nums text-red-700 whitespace-nowrap">
                            {fmt(txPageTotals.debit)}
                          </td>
                          <td className="py-2.5 px-4 text-right font-bold tabular-nums text-emerald-700 whitespace-nowrap">
                            {fmt(txPageTotals.credit)}
                          </td>
                          {page === 1 && <td className="py-2.5 px-4"></td>}
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>

                {/* Pagination */}
                {data && data.totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                    <span className="text-xs text-gray-500">
                      Page {data.page} of {data.totalPages} ({data.totalCount} entries)
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={page <= 1}
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                      >
                        Previous
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={page >= data.totalPages}
                        onClick={() => setPage(p => p + 1)}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Buckets Tab */}
      {activeTab === 'buckets' && (
        <div className="space-y-4">
          {/* Active Buckets */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-bold text-gray-800">
                Active Buckets ({activeBuckets.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {activeBuckets.length === 0 ? (
                <div className="p-6 text-center text-sm text-gray-400">No active buckets.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-left text-xs text-gray-500 border-b border-gray-200">
                        <th className="py-2.5 px-4 font-medium">ID</th>
                        <th className="py-2.5 px-4 font-medium">Label</th>
                        <th className="py-2.5 px-4 font-medium">Haul Start</th>
                        <th className="py-2.5 px-4 font-medium">Last Zakat Paid</th>
                        <th className="py-2.5 px-4 font-medium text-right">Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {activeBuckets.map((b: Bucket) => (
                        <tr key={b.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="py-2.5 px-4 text-gray-500 font-mono text-xs">{b.id.slice(0, 8)}</td>
                          <td className="py-2.5 px-4 text-gray-700 truncate max-w-[200px]">{b.label || '—'}</td>
                          <td className="py-2.5 px-4 text-gray-600 tabular-nums whitespace-nowrap">{fmtDate(b.haulStartDate)}</td>
                          <td className="py-2.5 px-4 text-gray-600 tabular-nums whitespace-nowrap">
                            {b.lastZakatPaidDate ? fmtDate(b.lastZakatPaidDate) : '—'}
                          </td>
                          <td className="py-2.5 px-4 text-right font-semibold text-gray-900 tabular-nums whitespace-nowrap">
                            {b.currency} {fmt(b.balance)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-50 border-t border-gray-200">
                        <td colSpan={4} className="py-2.5 px-4 text-xs font-semibold text-gray-500">Total</td>
                        <td className="py-2.5 px-4 text-right font-bold text-gray-900 tabular-nums whitespace-nowrap">
                          SAR {fmt(totalBucketBalance)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Depleted Buckets */}
          {depletedBuckets.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-bold text-gray-400">
                  Depleted Buckets ({depletedBuckets.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-left text-xs text-gray-400 border-b border-gray-200">
                        <th className="py-2 px-4 font-medium">ID</th>
                        <th className="py-2 px-4 font-medium">Label</th>
                        <th className="py-2 px-4 font-medium">Haul Start</th>
                        <th className="py-2 px-4 font-medium text-right">Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {depletedBuckets.map((b: Bucket) => (
                        <tr key={b.id} className="text-gray-400">
                          <td className="py-2 px-4 font-mono text-xs">{b.id.slice(0, 8)}</td>
                          <td className="py-2 px-4 truncate max-w-[200px]">{b.label || '—'}</td>
                          <td className="py-2 px-4 tabular-nums whitespace-nowrap">{fmtDate(b.haulStartDate)}</td>
                          <td className="py-2 px-4 text-right tabular-nums whitespace-nowrap">
                            {b.currency} {fmt(b.balance)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-50 border-t border-gray-200">
                        <td colSpan={3} className="py-2 px-4 text-xs font-semibold text-gray-400">Total</td>
                        <td className="py-2 px-4 text-right font-bold text-gray-500 tabular-nums whitespace-nowrap">
                          SAR {fmt(totalDepletedBalance)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
