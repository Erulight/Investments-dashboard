'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

interface Transaction {
  id: string
  type: string
  amount: number
  date: string
  description: string | null
  createdAt: string
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
}

const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-CA')

export function CashLedgerClient() {
  const [data, setData] = useState<LedgerData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [typeFilter, setTypeFilter] = useState('')
  const [activeTab, setActiveTab] = useState<'transactions' | 'buckets'>('transactions')

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ page: String(page), limit: '50' })
      if (typeFilter) params.set('type', typeFilter)
      const res = await fetch(`/api/cash/ledger?${params}`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Failed to load ledger')
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load ledger')
    } finally {
      setLoading(false)
    }
  }, [page, typeFilter])

  useEffect(() => { loadData() }, [loadData])

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
      </div>

      {/* Tab Toggle */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setActiveTab('transactions')}
          className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'transactions'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Transactions ({data?.totalCount ?? 0})
        </button>
        <button
          onClick={() => setActiveTab('buckets')}
          className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'buckets'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
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
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-bold text-gray-800">Transaction History</CardTitle>
              <div className="flex items-center gap-2">
                {data?.transactionTypes && data.transactionTypes.length > 0 && (
                  <select
                    value={typeFilter}
                    onChange={(e) => { setTypeFilter(e.target.value); setPage(1) }}
                    className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700 focus:border-slate-500 focus:ring-1 focus:ring-slate-500 outline-none"
                  >
                    <option value="">All types</option>
                    {data.transactionTypes.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                )}
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
                          <td className="py-2.5 px-4 text-gray-600 truncate max-w-[300px]">{tx.description || '—'}</td>
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
                          <td colSpan={3} className="py-2.5 px-4 text-xs font-semibold text-gray-500">Total (this page)</td>
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
