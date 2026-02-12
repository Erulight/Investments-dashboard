'use client'

import { useMemo, useState } from 'react'
import type { ChangeEvent, MouseEvent } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Table, TableHeader, TableBody, TableFooter, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import { Button } from '@/components/ui/Button'
import { SavingsForm } from './SavingsForm'
import { CreateSavingsInput } from '@/lib/validation'

interface CirclysClientProps {
  initialInvestments: any[]
  userRole: string
}

const parseRoscaMetadata = (inv: any) => {
  try { return JSON.parse(inv.metadata || '{}') } catch { return {} }
}

const addMonths = (date: Date, months: number) => {
  const d = new Date(date); d.setMonth(d.getMonth() + months); return d
}

const fmtMonth = (date: Date) => {
  const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${m[date.getMonth()]} ${date.getFullYear()}`
}

const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function getPlanStatus(meta: any): { label: string; color: string } {
  const total = Number(meta.totalMonths || 0)
  const paid = Number(meta.monthsPaid || 0)
  if (total > 0 && paid >= total) return { label: 'Completed', color: 'bg-emerald-50 text-emerald-700' }
  if (paid > 0) return { label: 'Ongoing', color: 'bg-blue-50 text-blue-700' }
  return { label: 'Pending', color: 'bg-amber-50 text-amber-700' }
}

function getStartYear(inv: any): number {
  return new Date(inv.startDate).getFullYear()
}

export function CirclysClient({ initialInvestments, userRole }: CirclysClientProps) {
  const [investments, setInvestments] = useState(initialInvestments)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingInvestment, setEditingInvestment] = useState<any | null>(null)
  const [deleteLoadingId, setDeleteLoadingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string>('')
  const [payLoadingKey, setPayLoadingKey] = useState<string | null>(null)
  const [payErrorByKey, setPayErrorByKey] = useState<Record<string, string>>({})
  const [payAmountByKey, setPayAmountByKey] = useState<Record<string, string>>({})
  const [payRewardByKey, setPayRewardByKey] = useState<Record<string, string>>({})
  const [receiveLoadingId, setReceiveLoadingId] = useState<string | null>(null)
  const [receiveError, setReceiveError] = useState<string>('')

  // Year filter
  const [yearFilter, setYearFilter] = useState<string>('all')
  // Checkbox selection for stats
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(initialInvestments.map((i: any) => i.id)))

  const years = useMemo(() => {
    const s = new Set(investments.map((i: any) => getStartYear(i)))
    return Array.from(s).sort()
  }, [investments])

  const filteredInvestments = useMemo(() => {
    if (yearFilter === 'all') return investments
    return investments.filter((i: any) => getStartYear(i) === Number(yearFilter))
  }, [investments, yearFilter])

  const tableTotals = useMemo(() => {
    if (filteredInvestments.length === 0) return null
    return filteredInvestments.reduce(
      (
        acc: {
          currency: string
          monthly: number
          reward: number
          bookingFee: number
        },
        inv: any
      ) => {
        const meta = parseRoscaMetadata(inv)
        acc.currency = acc.currency || String(inv.account?.currency || 'SAR')
        acc.monthly += Number(meta.monthlyContribution || 0)
        acc.reward += Number(meta.totalRewardPaid || 0)
        acc.bookingFee += Number(meta.bookingFee || 0)
        return acc
      },
      { currency: '', monthly: 0, reward: 0, bookingFee: 0 }
    )
  }, [filteredInvestments])

  // Stats based on selected (checked) plans within the filtered list
  const stats = useMemo(() => {
    const list = filteredInvestments.filter((i: any) => selectedIds.has(i.id))
    let totalSaved = 0, totalReward = 0
    list.forEach((inv: any) => {
      const meta = parseRoscaMetadata(inv)
      totalSaved += Number(meta.totalPaid) || 0
      totalReward += Number(meta.totalRewardPaid) || 0
    })
    const totalValue = totalSaved + totalReward
    const rewardPct = totalSaved > 0 ? (totalReward / totalSaved) * 100 : 0
    return { totalSaved, totalReward, totalValue, rewardPct, count: list.length }
  }, [filteredInvestments, selectedIds])

  const toggleSelected = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  const toggleAll = () => {
    const allIds = filteredInvestments.map((i: any) => i.id)
    const allSelected = allIds.every((id: string) => selectedIds.has(id))
    setSelectedIds(prev => {
      const next = new Set(prev)
      allIds.forEach((id: string) => allSelected ? next.delete(id) : next.add(id))
      return next
    })
  }

  const handleCreatePlan = async (data: CreateSavingsInput) => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/savings/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create savings plan')
      }
      const newPlan = await response.json()
      setInvestments((prevInvestments: any[]) => [newPlan, ...prevInvestments])
      setShowCreateForm(false)
    } catch (error: any) {
      console.error('Create plan error:', error)
      throw error
    } finally {
      setIsLoading(false)
    }
  }

  const handleUpdatePlan = async (investmentId: string, data: CreateSavingsInput) => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/savings/${investmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.error || 'Failed to update savings plan')
      }
      const updated = await response.json()
      setInvestments((prev: any[]) => prev.map((inv: any) => (inv.id === updated.id ? updated : inv)))
      setEditingInvestment(null)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeletePlan = async (investmentId: string) => {
    setDeleteError('')
    setDeleteLoadingId(investmentId)
    try {
      const response = await fetch(`/api/savings/${investmentId}`, { method: 'DELETE' })
      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.error || 'Failed to delete plan')
      }
      setInvestments((prev: any[]) => prev.filter((inv: any) => inv.id !== investmentId))
      if (expandedId === investmentId) setExpandedId(null)
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Failed to delete plan')
    } finally {
      setDeleteLoadingId(null)
    }
  }

  const expandedInvestment = useMemo(() => {
    if (!expandedId) return null
    return investments.find((inv: any) => inv.id === expandedId) || null
  }, [expandedId, investments])

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-2xl shadow-xl p-6 lg:p-8 text-white">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Circlys Savings</h1>
            <p className="text-sm text-slate-400 mt-1">Track your savings plans and rewards</p>
          </div>
          {(userRole === 'OWNER' || userRole === 'PARTNER') && (
            <Button variant="primary" onClick={() => setShowCreateForm(true)}>
              + New Plan
            </Button>
          )}
        </div>

        {/* Year filter pills */}
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          <span className="text-xs text-slate-400 mr-1 font-medium uppercase tracking-wider">Year:</span>
          <button
            onClick={() => setYearFilter('all')}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${yearFilter === 'all' ? 'bg-white text-slate-900' : 'bg-white/10 text-slate-300 hover:bg-white/20'}`}
          >
            All
          </button>
          {years.map((y) => (
            <button
              key={y}
              onClick={() => setYearFilter(String(y))}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${yearFilter === String(y) ? 'bg-white text-slate-900' : 'bg-white/10 text-slate-300 hover:bg-white/20'}`}
            >
              {y}
            </button>
          ))}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="bg-white/5 backdrop-blur rounded-xl p-4 border border-white/10">
            <p className="text-[11px] text-slate-400 uppercase tracking-wider mb-1">Total Saved</p>
            <p className="text-xl font-bold">SAR {fmt(stats.totalSaved)}</p>
          </div>
          <div className="bg-white/5 backdrop-blur rounded-xl p-4 border border-white/10">
            <p className="text-[11px] text-slate-400 uppercase tracking-wider mb-1">Total Reward</p>
            <p className="text-xl font-bold text-emerald-400">SAR {fmt(stats.totalReward)}</p>
          </div>
          <div className="bg-white/5 backdrop-blur rounded-xl p-4 border border-white/10">
            <p className="text-[11px] text-slate-400 uppercase tracking-wider mb-1">Current Value</p>
            <p className="text-xl font-bold">SAR {fmt(stats.totalValue)}</p>
          </div>
          <div className="bg-white/5 backdrop-blur rounded-xl p-4 border border-white/10">
            <p className="text-[11px] text-slate-400 uppercase tracking-wider mb-1">Reward %</p>
            <p className="text-xl font-bold text-emerald-400">{stats.rewardPct.toFixed(1)}%</p>
          </div>
          <div className="bg-white/5 backdrop-blur rounded-xl p-4 border border-white/10">
            <p className="text-[11px] text-slate-400 uppercase tracking-wider mb-1">Plans Selected</p>
            <p className="text-xl font-bold">{stats.count} / {filteredInvestments.length}</p>
          </div>
        </div>
      </div>

      {/* Plans table */}
      {filteredInvestments.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <h3 className="text-xl font-bold text-gray-900 mb-2">No Plans Found</h3>
            <p className="text-gray-500">
              {investments.length === 0
                ? (userRole === 'OWNER' ? 'Create your first Circlys plan to get started.' : 'No plans available.')
                : 'No plans match the selected year filter.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="w-10">
                      <input
                        type="checkbox"
                        checked={filteredInvestments.every((i: any) => selectedIds.has(i.id))}
                        onChange={toggleAll}
                        className="rounded border-gray-300 text-slate-800 focus:ring-slate-500"
                      />
                    </TableHead>
                    <TableHead className="font-semibold text-gray-700">Plan</TableHead>
                    <TableHead className="font-semibold text-gray-700">Account</TableHead>
                    <TableHead className="font-semibold text-gray-700 text-right">Monthly</TableHead>
                    <TableHead className="font-semibold text-gray-700 text-center">Progress</TableHead>
                    <TableHead className="font-semibold text-gray-700 text-center">Receipt</TableHead>
                    <TableHead className="font-semibold text-gray-700 text-right">Reward Earned</TableHead>
                    <TableHead className="font-semibold text-gray-700 text-right">Booking Fee</TableHead>
                    <TableHead className="font-semibold text-gray-700 text-center">Status</TableHead>
                    {userRole === 'OWNER' && <TableHead className="font-semibold text-gray-700 text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInvestments.map((inv: any) => {
                    const meta = parseRoscaMetadata(inv)
                    const monthsPaid = Number(meta.monthsPaid || 0)
                    const totalMo = Number(meta.totalMonths || 0)
                    const remainingMonths = totalMo - monthsPaid
                    const receiptMonth = meta.receiptMonth
                    const rewardEarned = Number(meta.totalRewardPaid) || 0
                    const bookingFee = Number(meta.bookingFee) || 0
                    const isExpanded = expandedId === inv.id
                    const status = getPlanStatus(meta)
                    const checked = selectedIds.has(inv.id)
                    const progressPct = totalMo > 0 ? Math.round((monthsPaid / totalMo) * 100) : 0

                    return (
                      <TableRow
                        key={inv.id}
                        className={`transition-colors duration-150 cursor-pointer ${isExpanded ? 'bg-slate-50' : 'hover:bg-gray-50'}`}
                        onClick={() => setExpandedId((prev: string | null) => (prev === inv.id ? null : inv.id))}
                      >
                        <TableCell onClick={(e: MouseEvent<HTMLTableCellElement>) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleSelected(inv.id)}
                            className="rounded border-gray-300 text-slate-800 focus:ring-slate-500"
                          />
                        </TableCell>
                        <TableCell className="font-semibold text-gray-900">
                          <div className="flex items-center gap-2">
                            <span className="truncate max-w-[160px]">{inv.name}</span>
                            <span className="text-[10px] text-gray-400">{isExpanded ? '▲' : '▼'}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs font-medium">
                            {inv.account?.name}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-medium text-gray-700 tabular-nums">
                          {inv.account?.currency} {meta.monthlyContribution?.toLocaleString() || 0}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col items-center gap-1">
                            <div className="w-full bg-gray-200 rounded-full h-1.5 max-w-[80px]">
                              <div
                                className={`h-1.5 rounded-full ${progressPct >= 100 ? 'bg-emerald-500' : 'bg-blue-500'}`}
                                style={{ width: `${Math.min(progressPct, 100)}%` }}
                              />
                            </div>
                            <span className="text-[11px] text-gray-500 tabular-nums">{monthsPaid}/{totalMo}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          {receiptMonth ? (
                            <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-medium">
                              Mo {receiptMonth}
                            </span>
                          ) : (
                            <span className="text-gray-400 text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {rewardEarned > 0 ? (
                            <span className="font-semibold text-emerald-600">
                              +{inv.account?.currency} {fmt(rewardEarned)}
                            </span>
                          ) : (
                            <span className="text-gray-400 text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {bookingFee > 0 ? (
                            <span className="text-red-600 font-medium">
                              {inv.account?.currency} {fmt(bookingFee)}
                            </span>
                          ) : (
                            <span className="text-gray-400 text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={`px-2.5 py-1 inline-flex items-center text-[11px] font-semibold rounded-full ${status.color}`}>
                            {status.label}
                          </span>
                        </TableCell>
                        {userRole === 'OWNER' && (
                          <TableCell
                            className="text-right"
                            onClick={(e: MouseEvent<HTMLTableCellElement>) => e.stopPropagation()}
                          >
                            <div className="flex justify-end gap-1">
                              <button
                                className="px-2 py-1 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded transition-colors"
                                onClick={() => setEditingInvestment(inv)}
                              >
                                Edit
                              </button>
                              <button
                                className="px-2 py-1 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded transition-colors"
                                disabled={deleteLoadingId === inv.id}
                                onClick={() => {
                                  const ok = window.confirm('Delete this plan? This will also delete any monthly zakat buckets created from its payments.')
                                  if (ok) void handleDeletePlan(inv.id)
                                }}
                              >
                                {deleteLoadingId === inv.id ? '...' : 'Delete'}
                              </button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    )
                  })}
                </TableBody>
                {tableTotals && (
                  <TableFooter>
                    <TableRow>
                      <TableCell className="w-10">{null}</TableCell>
                      <TableCell className="font-semibold text-gray-900">Total</TableCell>
                      <TableCell>{null}</TableCell>
                      <TableCell className="text-right font-semibold text-gray-900 tabular-nums whitespace-nowrap">
                        {tableTotals.currency} {fmt(tableTotals.monthly)}
                      </TableCell>
                      <TableCell>{null}</TableCell>
                      <TableCell>{null}</TableCell>
                      <TableCell className="text-right font-semibold text-emerald-700 tabular-nums whitespace-nowrap">
                        +{tableTotals.currency} {fmt(tableTotals.reward)}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-red-700 tabular-nums whitespace-nowrap">
                        {tableTotals.currency} {fmt(tableTotals.bookingFee)}
                      </TableCell>
                      <TableCell>{null}</TableCell>
                      {userRole === 'OWNER' && <TableCell>{null}</TableCell>}
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
            </div>

            {deleteError && (
              <div className="mx-4 mt-3 mb-2 text-sm text-red-600">{deleteError}</div>
            )}

            {/* Expanded monthly details */}
            {expandedInvestment && (() => {
              const meta = parseRoscaMetadata(expandedInvestment)
              const totalMonths = Number(meta.totalMonths || 0)
              const startDate = new Date(expandedInvestment.startDate)
              const payments: Record<string, any> = meta.payments && typeof meta.payments === 'object' ? meta.payments : {}
              const receiptMo = Number(meta.receiptMonth || 0)
              const hasReceived = Boolean(meta.received?.date)
              const receiveAmt = Number(meta.monthlyContribution || 0) * totalMonths
              const rcvLoading = receiveLoadingId === expandedInvestment.id

              const rows = Array.from({ length: totalMonths }, (_, i) => {
                const due = addMonths(startDate, i)
                return { monthIndex: i, due, label: fmtMonth(due), payment: payments[String(i)] || null }
              })

              const handleReceive = async () => {
                setReceiveError('')
                setReceiveLoadingId(expandedInvestment.id)
                try {
                  const res = await fetch(`/api/savings/${expandedInvestment.id}/receive`, { method: 'POST' })
                  if (!res.ok) {
                    const d = await res.json().catch(() => ({}))
                    throw new Error(d.error || 'Failed to receive')
                  }
                  const d = await res.json()
                  setInvestments((prev: any[]) => prev.map((inv: any) => inv.id === expandedInvestment.id ? d.investment : inv))
                } catch (e) {
                  setReceiveError(e instanceof Error ? e.message : 'Failed to receive')
                } finally { setReceiveLoadingId(null) }
              }

              const handleUndoReceive = async () => {
                setReceiveError('')
                setReceiveLoadingId(expandedInvestment.id)
                try {
                  const res = await fetch(`/api/savings/${expandedInvestment.id}/receive`, { method: 'DELETE' })
                  if (!res.ok) {
                    const d = await res.json().catch(() => ({}))
                    throw new Error(d.error || 'Failed to undo receive')
                  }
                  const d = await res.json()
                  setInvestments((prev: any[]) => prev.map((inv: any) => inv.id === expandedInvestment.id ? d.investment : inv))
                } catch (e) {
                  setReceiveError(e instanceof Error ? e.message : 'Failed to undo receive')
                } finally { setReceiveLoadingId(null) }
              }

              return (
                <div className="mx-4 mb-4 mt-2 rounded-xl border border-gray-200 bg-gray-50/50 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-bold text-gray-800">Monthly Contributions — {expandedInvestment.name}</h4>
                    <span className="text-[11px] text-gray-400">Click plan row to collapse</span>
                  </div>

                  {/* Receive payout banner */}
                  {receiptMo > 0 && (
                    <div className={`mb-3 rounded-lg p-3 border ${hasReceived ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="text-sm">
                          {hasReceived ? (
                            <span className="font-semibold text-emerald-800">
                              Received SAR {fmt(Number(meta.received.amount))} on {new Date(meta.received.date).toISOString().split('T')[0]}
                            </span>
                          ) : (
                            <span className="font-semibold text-amber-800">
                              Receipt due at Month {receiptMo} — SAR {fmt(receiveAmt)}
                            </span>
                          )}
                        </div>
                        {userRole === 'OWNER' && (
                          hasReceived ? (
                            <button
                              disabled={rcvLoading}
                              onClick={handleUndoReceive}
                              className="px-3 py-1 text-xs font-medium text-red-700 bg-red-100 hover:bg-red-200 rounded transition-colors disabled:opacity-50"
                            >
                              {rcvLoading ? '...' : 'Undo Receive'}
                            </button>
                          ) : (
                            <button
                              disabled={rcvLoading}
                              onClick={handleReceive}
                              className="px-3 py-1 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded transition-colors disabled:opacity-50"
                            >
                              {rcvLoading ? '...' : 'Receive Money'}
                            </button>
                          )
                        )}
                      </div>
                      {receiveError && <div className="text-xs text-red-600 mt-1">{receiveError}</div>}
                      {!hasReceived && (
                        <p className="text-[11px] text-amber-700 mt-1">
                          Receiving adds to your cash balance. Months after receipt will deduct from cash.
                        </p>
                      )}
                    </div>
                  )}

                  <div className="overflow-auto max-h-[400px]">
                    <table className="min-w-full text-sm">
                      <thead className="sticky top-0 bg-gray-50 z-10">
                        <tr className="text-left text-[11px] text-gray-500 border-b uppercase tracking-wider">
                          <th className="py-2 pr-3 font-semibold">Month</th>
                          <th className="py-2 pr-3 font-semibold">Due Date</th>
                          <th className="py-2 pr-3 font-semibold">Amount</th>
                          <th className="py-2 pr-3 font-semibold">Reward</th>
                          <th className="py-2 pr-3 font-semibold">Status</th>
                          <th className="py-2 text-right font-semibold">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {rows.map((r) => {
                          const key = `${expandedInvestment.id}-${r.monthIndex}`
                          const isPaid = Boolean(r.payment?.bucketId)
                          const loading = payLoadingKey === key
                          const defaultAmount = meta.monthlyContribution ? String(meta.monthlyContribution) : ''
                          const amountValue = payAmountByKey[key] ?? (isPaid ? String(r.payment.amount || '') : defaultAmount)
                          const rewardValue = payRewardByKey[key] ?? (isPaid ? String(r.payment.reward || 0) : '0')
                          const isReceiptRow = receiptMo > 0 && (r.monthIndex + 1) === receiptMo
                          const isPostReceiptRow = hasReceived && receiptMo > 0 && (r.monthIndex + 1) > receiptMo
                          const isPostReceiptPaid = r.payment?.postReceipt === true

                          return (
                            <tr
                              key={key}
                              className={`text-gray-700 ${
                                isReceiptRow ? 'bg-blue-50/60 border-l-2 border-l-blue-400' :
                                isPaid ? (isPostReceiptPaid ? 'bg-orange-50/40' : 'bg-emerald-50/40') :
                                isPostReceiptRow ? 'bg-orange-50/20' : ''
                              }`}
                            >
                              <td className="py-2 pr-3 whitespace-nowrap font-medium">
                                {r.label}
                                {isReceiptRow && (
                                  <span className="ml-1.5 px-1.5 py-0.5 text-[10px] font-bold bg-blue-100 text-blue-700 rounded">RECEIPT</span>
                                )}
                                {isPostReceiptRow && !isReceiptRow && (
                                  <span className="ml-1.5 px-1.5 py-0.5 text-[10px] font-medium bg-orange-100 text-orange-600 rounded">from cash</span>
                                )}
                              </td>
                              <td className="py-2 pr-3 whitespace-nowrap text-gray-500 tabular-nums">
                                {r.due.toISOString().split('T')[0]}
                              </td>
                              <td className="py-2 pr-3">
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  disabled={isPaid || userRole !== 'OWNER'}
                                  value={amountValue}
                                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                                    setPayAmountByKey((prev: Record<string, string>) => ({ ...prev, [key]: e.target.value }))
                                  }
                                  className="w-28 rounded border border-gray-200 px-2 py-1 text-sm tabular-nums disabled:bg-gray-100 disabled:text-gray-500"
                                />
                              </td>
                              <td className="py-2 pr-3">
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  disabled={isPaid || userRole !== 'OWNER'}
                                  value={rewardValue}
                                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                                    setPayRewardByKey((prev: Record<string, string>) => ({ ...prev, [key]: e.target.value }))
                                  }
                                  className="w-24 rounded border border-gray-200 px-2 py-1 text-sm tabular-nums disabled:bg-gray-100 disabled:text-gray-500"
                                />
                              </td>
                              <td className="py-2 pr-3 whitespace-nowrap">
                                {isPaid ? (
                                  <span className={`inline-flex items-center gap-1 font-semibold text-xs ${isPostReceiptPaid ? 'text-orange-700' : 'text-emerald-700'}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${isPostReceiptPaid ? 'bg-orange-500' : 'bg-emerald-500'}`}></span>
                                    {isPostReceiptPaid ? 'Deducted' : 'Paid'}
                                  </span>
                                ) : (
                                  <span className="text-gray-400 text-xs">Unpaid</span>
                                )}
                              </td>
                              <td className="py-2 text-right whitespace-nowrap">
                                {isPaid ? (
                                  userRole === 'OWNER' ? (
                                    <button
                                      disabled={loading}
                                      className="px-2.5 py-1 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded transition-colors disabled:opacity-50"
                                      onClick={async () => {
                                        setPayErrorByKey((prev: Record<string, string>) => {
                                          const next = { ...prev }; delete next[key]; return next
                                        })
                                        setPayLoadingKey(key)
                                        try {
                                          const response = await fetch(`/api/savings/${expandedInvestment.id}/pay`, {
                                            method: 'DELETE',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ monthIndex: r.monthIndex }),
                                          })
                                          if (!response.ok) {
                                            const data = await response.json().catch(() => ({}))
                                            throw new Error(data.error || 'Failed to undo')
                                          }
                                          const data = await response.json()
                                          setInvestments((prev: any[]) =>
                                            prev.map((inv: any) => inv.id === expandedInvestment.id ? data.investment : inv)
                                          )
                                        } catch (e) {
                                          setPayErrorByKey((prev: Record<string, string>) => ({
                                            ...prev, [key]: e instanceof Error ? e.message : 'Failed to undo',
                                          }))
                                        } finally { setPayLoadingKey(null) }
                                      }}
                                    >
                                      {loading ? '...' : 'Undo'}
                                    </button>
                                  ) : (
                                    <span className="text-xs text-gray-400">Paid</span>
                                  )
                                ) : userRole === 'OWNER' ? (
                                  <button
                                    disabled={loading}
                                    className={`px-2.5 py-1 text-xs font-medium rounded transition-colors disabled:opacity-50 ${
                                      isPostReceiptRow
                                        ? 'text-white bg-orange-600 hover:bg-orange-700'
                                        : 'text-white bg-slate-800 hover:bg-slate-700'
                                    }`}
                                    onClick={async () => {
                                      setPayErrorByKey((prev: Record<string, string>) => {
                                        const next = { ...prev }; delete next[key]; return next
                                      })
                                      setPayLoadingKey(key)
                                      try {
                                        const response = await fetch(`/api/savings/${expandedInvestment.id}/pay`, {
                                          method: 'POST',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({ monthIndex: r.monthIndex, amount: Number(amountValue), reward: Number(rewardValue) }),
                                        })
                                        if (!response.ok) {
                                          const data = await response.json().catch(() => ({}))
                                          throw new Error(data.error || 'Failed to pay month')
                                        }
                                        const data = await response.json()
                                        setInvestments((prev: any[]) =>
                                          prev.map((inv: any) => inv.id === expandedInvestment.id ? data.investment : inv)
                                        )
                                      } catch (e) {
                                        setPayErrorByKey((prev: Record<string, string>) => ({
                                          ...prev, [key]: e instanceof Error ? e.message : 'Failed to pay month',
                                        }))
                                      } finally { setPayLoadingKey(null) }
                                    }}
                                  >
                                    {loading ? '...' : isPostReceiptRow ? 'Pay (cash)' : 'Pay'}
                                  </button>
                                ) : (
                                  <span className="text-xs text-gray-400">—</span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-gray-50 border-t border-gray-200">
                          <td colSpan={2} className="py-2 pr-3 text-xs font-semibold text-gray-500">Total</td>
                          <td className="py-2 pr-3 text-xs font-bold text-gray-900 tabular-nums whitespace-nowrap">
                            SAR {fmt(rows.reduce((s: number, x: any) => s + (Number(x.payment?.amount) || 0), 0))}
                          </td>
                          <td className="py-2 pr-3 text-xs font-bold text-emerald-700 tabular-nums whitespace-nowrap">
                            SAR {fmt(rows.reduce((s: number, x: any) => s + (Number(x.payment?.reward) || 0), 0))}
                          </td>
                          <td className="py-2 pr-3"></td>
                          <td className="py-2"></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {Object.keys(payErrorByKey).some((k) => k.startsWith(`${expandedInvestment.id}-`)) && (
                    <div className="mt-3 text-sm text-red-600">
                      {Object.entries(payErrorByKey)
                        .filter(([k]) => k.startsWith(`${expandedInvestment.id}-`))
                        .map(([, msg]) => msg)
                        .slice(0, 1)[0]}
                    </div>
                  )}
                </div>
              )
            })()}
          </CardContent>
        </Card>
      )}

      {/* Create Plan Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <SavingsForm
              onSubmit={handleCreatePlan}
              onCancel={() => setShowCreateForm(false)}
              isLoading={isLoading}
            />
          </div>
        </div>
      )}

      {/* Edit Plan Modal */}
      {editingInvestment && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <SavingsForm
              initialData={(() => {
                const meta = parseRoscaMetadata(editingInvestment)
                return {
                  accountId: editingInvestment.accountId,
                  name: editingInvestment.name,
                  monthlyContribution: meta.monthlyContribution || 0,
                  totalMonths: meta.totalMonths || 12,
                  bookingFee: meta.bookingFee ?? 0,
                  rewardProgram: meta.rewardProgram ?? 'NONE',
                  rewardAmount: meta.rewardAmount ?? 0,
                  receiptMonth: meta.receiptMonth ?? undefined,
                  startDate: new Date(editingInvestment.startDate).toISOString().split('T')[0],
                  notes: editingInvestment.notes || '',
                  participants: [],
                }
              })()}
              onSubmit={(data) => handleUpdatePlan(editingInvestment.id, data)}
              onCancel={() => setEditingInvestment(null)}
              isLoading={isLoading}
            />
          </div>
        </div>
      )}
    </div>
  )
}
