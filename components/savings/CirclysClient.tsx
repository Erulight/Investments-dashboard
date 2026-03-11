'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, MouseEvent } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Table, TableHeader, TableBody, TableFooter, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import { Button } from '@/components/ui/Button'
import { SavingsForm } from './SavingsForm'
import { CreateSavingsInput } from '@/lib/validation'
import { formatDisplayDate } from '@/lib/date'
import {
  formatCurrencyAmount,
  getCurrencyPrefix,
  type DisplayCurrency,
  normalizeDisplayCurrency,
} from '@/lib/currency'

interface CirclysClientProps {
  initialInvestments: any[]
  userRole: string
  displayCurrency: DisplayCurrency
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
  if (total > 0 && paid >= total) return { label: 'Completed', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300' }
  if (paid > 0) return { label: 'Ongoing', color: 'bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300' }
  return { label: 'Pending', color: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300' }
}

function getStartYear(inv: any): number {
  return new Date(inv.startDate).getFullYear()
}

export function CirclysClient({ initialInvestments, userRole, displayCurrency }: CirclysClientProps) {
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
  const [showReceiveModal, setShowReceiveModal] = useState<string | null>(null)
  const [receiveModalDate, setReceiveModalDate] = useState<string>('')
  const [receiveModalAmount, setReceiveModalAmount] = useState<string>('')

  // Year filter
  const [yearFilter, setYearFilter] = useState<string>('all')
  // Checkbox selection for stats
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(initialInvestments.map((i: any) => i.id)))

  const [animatedStats, setAnimatedStats] = useState(() => ({
    totalSaved: 0,
    totalReward: 0,
    totalValue: 0,
    rewardPct: 0,
    avgValuePerPlan: 0,
    completionRate: 0,
  }))
  const animatedStatsRef = useRef(animatedStats)
  const money = (value: number, sourceCurrency: DisplayCurrency = 'SAR') =>
    formatCurrencyAmount(value, displayCurrency, sourceCurrency)
  const baseSarSymbol = getCurrencyPrefix('SAR')

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
    let completedCount = 0
    let receivedCount = 0
    list.forEach((inv: any) => {
      const meta = parseRoscaMetadata(inv)
      totalSaved += Number(meta.totalPaid) || 0
      totalReward += Number(meta.totalRewardPaid) || 0

      const totalMo = Number(meta.totalMonths || 0)
      const monthsPaid = Number(meta.monthsPaid || 0)
      if (totalMo > 0 && monthsPaid >= totalMo) completedCount += 1
      if (meta?.received?.date) receivedCount += 1
    })
    const totalValue = totalSaved + totalReward
    const count = list.length
    const rewardPct = totalSaved > 0 ? (totalReward / totalSaved) * 100 : 0
    const avgValuePerPlan = count > 0 ? (totalValue / count) : 0
    const completionRate = count > 0 ? (completedCount / count) * 100 : 0
    return { totalSaved, totalReward, totalValue, rewardPct, count, completedCount, receivedCount, avgValuePerPlan, completionRate }
  }, [filteredInvestments, selectedIds])

  useEffect(() => {
    const from = animatedStatsRef.current
    const to = {
      totalSaved: stats.totalSaved,
      totalReward: stats.totalReward,
      totalValue: stats.totalValue,
      rewardPct: stats.rewardPct,
      avgValuePerPlan: stats.avgValuePerPlan,
      completionRate: stats.completionRate,
    }

    let frameId = 0
    const duration = 700
    const start = performance.now()

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)

      const next = {
        totalSaved: from.totalSaved + ((to.totalSaved - from.totalSaved) * eased),
        totalReward: from.totalReward + ((to.totalReward - from.totalReward) * eased),
        totalValue: from.totalValue + ((to.totalValue - from.totalValue) * eased),
        rewardPct: from.rewardPct + ((to.rewardPct - from.rewardPct) * eased),
        avgValuePerPlan: from.avgValuePerPlan + ((to.avgValuePerPlan - from.avgValuePerPlan) * eased),
        completionRate: from.completionRate + ((to.completionRate - from.completionRate) * eased),
      }

      setAnimatedStats(next)

      if (t < 1) {
        frameId = requestAnimationFrame(tick)
      } else {
        animatedStatsRef.current = to
      }
    }

    frameId = requestAnimationFrame(tick)

    return () => {
      if (frameId) cancelAnimationFrame(frameId)
    }
  }, [
    stats.totalSaved,
    stats.totalReward,
    stats.totalValue,
    stats.rewardPct,
    stats.avgValuePerPlan,
    stats.completionRate,
  ])

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
          <div className="bg-white/5 backdrop-blur rounded-xl p-4 border border-white/10 transition-transform duration-300 hover:-translate-y-0.5">
            <p className="text-[11px] text-slate-400 uppercase tracking-wider mb-1">Total Saved</p>
            <p className="text-xl font-bold">{money(animatedStats.totalSaved)}</p>
          </div>
          <div className="bg-white/5 backdrop-blur rounded-xl p-4 border border-white/10 transition-transform duration-300 hover:-translate-y-0.5">
            <p className="text-[11px] text-slate-400 uppercase tracking-wider mb-1">Total Reward</p>
            <p className="text-xl font-bold text-emerald-400">{money(animatedStats.totalReward)}</p>
          </div>
          <div className="bg-white/5 backdrop-blur rounded-xl p-4 border border-white/10 transition-transform duration-300 hover:-translate-y-0.5">
            <p className="text-[11px] text-slate-400 uppercase tracking-wider mb-1">Current Value</p>
            <p className="text-xl font-bold">{money(animatedStats.totalValue)}</p>
          </div>
          <div className="bg-white/5 backdrop-blur rounded-xl p-4 border border-white/10 transition-transform duration-300 hover:-translate-y-0.5">
            <p className="text-[11px] text-slate-400 uppercase tracking-wider mb-1">Reward %</p>
            <p className="text-xl font-bold text-emerald-400">{animatedStats.rewardPct.toFixed(1)}%</p>
          </div>
          <div className="bg-white/5 backdrop-blur rounded-xl p-4 border border-white/10 transition-transform duration-300 hover:-translate-y-0.5">
            <p className="text-[11px] text-slate-400 uppercase tracking-wider mb-1">Plans Selected</p>
            <p className="text-xl font-bold">{stats.count} / {filteredInvestments.length}</p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
            <p className="text-[11px] text-slate-400 uppercase tracking-wider mb-1">Avg Value / Plan</p>
            <p className="text-lg font-semibold text-slate-100">{money(animatedStats.avgValuePerPlan)}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
            <p className="text-[11px] text-slate-400 uppercase tracking-wider mb-1">Received Plans</p>
            <p className="text-lg font-semibold text-blue-300">{stats.receivedCount} / {stats.count}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
            <div className="flex items-center justify-between gap-2 mb-1">
              <p className="text-[11px] text-slate-400 uppercase tracking-wider">Completion Rate</p>
              <p className="text-sm font-semibold text-emerald-300">{animatedStats.completionRate.toFixed(0)}%</p>
            </div>
            <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-400 transition-all duration-700"
                style={{ width: `${Math.min(100, Math.max(0, animatedStats.completionRate))}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Plans table */}
      {filteredInvestments.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <h3 className="mb-2 text-xl font-bold text-slate-900 dark:text-slate-100">No Plans Found</h3>
            <p className="text-slate-500 dark:text-slate-400">
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
                  <TableRow className="bg-slate-50 dark:bg-slate-900/70">
                    <TableHead className="w-10">
                      <input
                        type="checkbox"
                        checked={filteredInvestments.every((i: any) => selectedIds.has(i.id))}
                        onChange={toggleAll}
                        className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 dark:border-white/10 dark:bg-slate-900 dark:text-emerald-400"
                      />
                    </TableHead>
                    <TableHead className="font-semibold text-slate-700 dark:text-slate-200">Plan</TableHead>
                    <TableHead className="font-semibold text-slate-700 dark:text-slate-200">Account</TableHead>
                    <TableHead className="text-right font-semibold text-slate-700 dark:text-slate-200">Monthly</TableHead>
                    <TableHead className="text-center font-semibold text-slate-700 dark:text-slate-200">Progress</TableHead>
                    <TableHead className="text-center font-semibold text-slate-700 dark:text-slate-200">Receipt</TableHead>
                    <TableHead className="text-right font-semibold text-slate-700 dark:text-slate-200">Reward Earned</TableHead>
                    <TableHead className="text-right font-semibold text-slate-700 dark:text-slate-200">Booking Fee</TableHead>
                    <TableHead className="text-center font-semibold text-slate-700 dark:text-slate-200">Status</TableHead>
                    {userRole === 'OWNER' && <TableHead className="text-right font-semibold text-slate-700 dark:text-slate-200">Actions</TableHead>}
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
                        className={`cursor-pointer transition-colors duration-150 ${isExpanded ? 'bg-slate-50 dark:bg-white/5' : 'hover:bg-slate-50 dark:hover:bg-white/5'}`}
                        onClick={() => setExpandedId((prev: string | null) => (prev === inv.id ? null : inv.id))}
                      >
                        <TableCell onClick={(e: MouseEvent<HTMLTableCellElement>) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleSelected(inv.id)}
                            className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 dark:border-white/10 dark:bg-slate-900 dark:text-emerald-400"
                          />
                        </TableCell>
                        <TableCell className="font-semibold text-slate-900 dark:text-slate-100">
                          <div className="flex items-center gap-2">
                            <span className="truncate max-w-[160px]">{inv.name}</span>
                            <span className="text-[10px] text-slate-400 dark:text-slate-500">{isExpanded ? '▲' : '▼'}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="rounded px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200">
                            {inv.account?.name}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums text-slate-700 dark:text-slate-200">
                          {money(
                            Number(meta.monthlyContribution || 0),
                            normalizeDisplayCurrency(inv.account?.currency),
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col items-center gap-1">
                            <div className="h-1.5 w-full max-w-[80px] rounded-full bg-slate-200 dark:bg-white/10">
                              <div
                                className={`h-1.5 rounded-full ${progressPct >= 100 ? 'bg-emerald-500' : 'bg-blue-500'}`}
                                style={{ width: `${Math.min(progressPct, 100)}%` }}
                              />
                            </div>
                            <span className="text-[11px] tabular-nums text-slate-500 dark:text-slate-400">{monthsPaid}/{totalMo}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          {receiptMonth ? (
                            <span className="rounded px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300">
                              Mo {receiptMonth}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400 dark:text-slate-500">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {rewardEarned > 0 ? (
                            <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                              +{money(rewardEarned, normalizeDisplayCurrency(inv.account?.currency))}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400 dark:text-slate-500">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {bookingFee > 0 ? (
                            <span className="font-medium text-red-700 dark:text-red-300">
                              {money(bookingFee, normalizeDisplayCurrency(inv.account?.currency))}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400 dark:text-slate-500">—</span>
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
                                className="rounded px-2 py-1 text-xs font-medium transition-colors bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-white/10 dark:text-slate-200 dark:hover:bg-white/15"
                                onClick={() => setEditingInvestment(inv)}
                              >
                                Edit
                              </button>
                              <button
                                className="rounded px-2 py-1 text-xs font-medium transition-colors bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-500/15 dark:text-red-300 dark:hover:bg-red-500/25"
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
                      <TableCell className="font-semibold text-slate-900 dark:text-slate-100">Total</TableCell>
                      <TableCell>{null}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums whitespace-nowrap text-slate-900 dark:text-slate-100">
                        {money(tableTotals.monthly, normalizeDisplayCurrency(tableTotals.currency))}
                      </TableCell>
                      <TableCell>{null}</TableCell>
                      <TableCell>{null}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums whitespace-nowrap text-emerald-700 dark:text-emerald-300">
                        +{money(tableTotals.reward, normalizeDisplayCurrency(tableTotals.currency))}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums whitespace-nowrap text-red-700 dark:text-red-300">
                        {money(tableTotals.bookingFee, normalizeDisplayCurrency(tableTotals.currency))}
                      </TableCell>
                      <TableCell>{null}</TableCell>
                      {userRole === 'OWNER' && <TableCell>{null}</TableCell>}
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
            </div>

            {deleteError && (
              <div className="mx-4 mt-3 mb-2 text-sm text-red-600 dark:text-red-300">{deleteError}</div>
            )}

            {/* Expanded monthly details */}
            {expandedInvestment && (() => {
              const meta = parseRoscaMetadata(expandedInvestment)
              const totalMonths = Number(meta.totalMonths || 0)
              const startDate = new Date(expandedInvestment.startDate)
              const payments: Record<string, any> = meta.payments && typeof meta.payments === 'object' ? meta.payments : {}
              const rewardAmountRaw = Number(meta.rewardAmount || 0)
              const rewardAmount = Number.isFinite(rewardAmountRaw) ? Math.max(0, rewardAmountRaw) : 0
              const rewardProgram = String(meta.rewardProgram || 'NONE')
              const monthlyContributionRaw = Number(meta.monthlyContribution || 0)
              const monthlyContribution = Number.isFinite(monthlyContributionRaw)
                ? Math.max(0, monthlyContributionRaw)
                : 0
              const configuredRewardPerMonth = rewardAmount > 0
                ? rewardProgram === 'PERCENTAGE'
                  ? monthlyContribution * (rewardAmount / 100)
                  : rewardAmount
                : 0
              const receiptMo = Number(meta.receiptMonth || 0)
              const hasReceived = Boolean(meta.received?.date)
              const receiveAmt = Number(meta.monthlyContribution || 0) * totalMonths
              const rcvLoading = receiveLoadingId === expandedInvestment.id

              const rows = Array.from({ length: totalMonths }, (_, i) => {
                const due = addMonths(startDate, i)
                return { monthIndex: i, due, label: fmtMonth(due), payment: payments[String(i)] || null }
              })

              const handleReceive = () => {
                // FIX 2: Open modal to ask for receipt date and amount
                setShowReceiveModal(expandedInvestment.id)
                setReceiveError('')
                // Pre-fill with today's date and calculated amount
                const today = new Date().toISOString().split('T')[0]
                setReceiveModalDate(today)
                const calculatedAmount = Number(meta.monthlyContribution || 0) * Number(meta.totalMonths || 0)
                setReceiveModalAmount(calculatedAmount.toString())
              }

              const handleConfirmReceive = async () => {
                setReceiveError('')
                setReceiveLoadingId(expandedInvestment.id)
                try {
                  const res = await fetch(`/api/savings/${expandedInvestment.id}/receive`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      receiptDate: receiveModalDate,
                      amount: Number(receiveModalAmount),
                    }),
                  })
                  if (!res.ok) {
                    const d = await res.json().catch(() => ({}))
                    throw new Error(d.error || 'Failed to receive')
                  }
                  const d = await res.json()
                  setInvestments((prev: any[]) => prev.map((inv: any) => inv.id === expandedInvestment.id ? d.investment : inv))
                  setShowReceiveModal(null)
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
                <div className="mx-4 mb-4 mt-2 rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-white/10 dark:bg-white/5">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">Monthly Contributions — {expandedInvestment.name}</h4>
                    <span className="text-[11px] text-slate-400 dark:text-slate-500">Click plan row to collapse</span>
                  </div>

                  {/* Receive payout banner */}
                  {receiptMo > 0 && (
                    <div className={`mb-3 rounded-lg p-3 border ${hasReceived ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="text-sm">
                          {hasReceived ? (
                            <span className="font-semibold text-emerald-800">
                              Received {money(Number(meta.received.amount))} on {formatDisplayDate(meta.received.date)}
                            </span>
                          ) : (
                            <span className="font-semibold text-amber-800">
                              Receipt due at Month {receiptMo} — {money(receiveAmt)}
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
                          const rewardValue = payRewardByKey[key] ?? (
                            isPaid
                              ? String(r.payment.reward || 0)
                              : String(configuredRewardPerMonth)
                          )
                          const isReceiptRow = receiptMo > 0 && (r.monthIndex + 1) === receiptMo
                          const isPostReceiptRow = hasReceived && receiptMo > 0 && (r.monthIndex + 1) > receiptMo
                          const isLockedPreReceiptAfterReceive = hasReceived && receiptMo > 0 && (r.monthIndex + 1) <= receiptMo
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
                                  <span className="ml-1.5 px-1.5 py-0.5 text-[10px] font-medium bg-orange-100 text-orange-600 rounded">cash + reward</span>
                                )}
                              </td>
                              <td className="py-2 pr-3 whitespace-nowrap text-gray-500 tabular-nums">
                                {formatDisplayDate(r.due)}
                              </td>
                              <td className="py-2 pr-3">
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  disabled={isPaid || userRole !== 'OWNER' || isLockedPreReceiptAfterReceive}
                                  value={amountValue}
                                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                                    setPayAmountByKey((prev: Record<string, string>) => ({ ...prev, [key]: e.target.value }))
                                  }
                                  className="w-28 rounded border border-slate-200 bg-white px-2 py-1 text-sm tabular-nums text-slate-900 transition-colors disabled:bg-slate-100 disabled:text-slate-500 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100 dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
                                />
                              </td>
                              <td className="py-2 pr-3">
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  disabled={isPaid || userRole !== 'OWNER' || isLockedPreReceiptAfterReceive}
                                  value={rewardValue}
                                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                                    setPayRewardByKey((prev: Record<string, string>) => ({ ...prev, [key]: e.target.value }))
                                  }
                                  className="w-24 rounded border border-slate-200 bg-white px-2 py-1 text-sm tabular-nums text-slate-900 transition-colors disabled:bg-slate-100 disabled:text-slate-500 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100 dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
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
                                      disabled={loading || isLockedPreReceiptAfterReceive}
                                      className="rounded px-2.5 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-200 disabled:opacity-50 dark:bg-white/10 dark:text-slate-300 dark:hover:bg-white/15 bg-slate-100"
                                      title={isLockedPreReceiptAfterReceive ? 'Undo receive first to modify this month' : 'Undo'}
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
                                      {loading ? '...' : isLockedPreReceiptAfterReceive ? 'Locked' : 'Undo'}
                                    </button>
                                  ) : (
                                    <span className="text-xs text-gray-400">Paid</span>
                                  )
                                ) : userRole === 'OWNER' ? (
                                  <button
                                    disabled={loading || isLockedPreReceiptAfterReceive}
                                    className={`px-2.5 py-1 text-xs font-medium rounded transition-colors disabled:opacity-50 ${
                                      isPostReceiptRow
                                        ? 'text-white bg-orange-600 hover:bg-orange-700'
                                        : 'text-white bg-slate-800 hover:bg-slate-700'
                                    }`}
                                    title={isLockedPreReceiptAfterReceive ? 'Undo receive first to modify this month' : (isPostReceiptRow ? 'Pay from cash' : 'Pay')}
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
                                    {loading ? '...' : isLockedPreReceiptAfterReceive ? 'Locked' : (isPostReceiptRow ? 'Pay (cash)' : 'Pay')}
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
                            {money(rows.reduce((s: number, x: any) => s + (Number(x.payment?.amount) || 0), 0))}
                          </td>
                          <td className="py-2 pr-3 text-xs font-bold text-emerald-700 tabular-nums whitespace-nowrap">
                            {money(rows.reduce((s: number, x: any) => s + (Number(x.payment?.reward) || 0), 0))}
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
          <div className="max-h-[90vh] overflow-y-auto rounded-xl bg-white shadow-2xl dark:bg-slate-950">
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
          <div className="max-h-[90vh] overflow-y-auto rounded-xl bg-white shadow-2xl dark:bg-slate-950">
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

      {showReceiveModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md rounded-xl bg-white shadow-2xl dark:border dark:border-white/10 dark:bg-slate-950">
            <div className="border-b border-slate-200 px-6 py-4 dark:border-white/10">
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Receive Savings</h2>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">Receipt Date</label>
                <input
                  type="date"
                  value={receiveModalDate}
                  onChange={(e) => setReceiveModalDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">Total Amount Received ({baseSarSymbol} base)</label>
                <input
                  type="number"
                  value={receiveModalAmount}
                  onChange={(e) => setReceiveModalAmount(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100 dark:placeholder:text-slate-500"
                  step="0.01"
                  min="0"
                />
              </div>
              {receiveError && (
                <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{receiveError}</div>
              )}
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4 dark:border-white/10">
              <button
                onClick={() => setShowReceiveModal(null)}
                className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const investmentId = showReceiveModal
                  const meta = investments.find((inv: any) => inv.id === investmentId)
                  if (meta) {
                    const handleConfirmReceive = async () => {
                      setReceiveError('')
                      setReceiveLoadingId(investmentId)
                      try {
                        const res = await fetch(`/api/savings/${investmentId}/receive`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            receiptDate: receiveModalDate,
                            amount: Number(receiveModalAmount),
                          }),
                        })
                        if (!res.ok) {
                          const d = await res.json().catch(() => ({}))
                          throw new Error(d.error || 'Failed to receive')
                        }
                        const d = await res.json()
                        setInvestments((prev: any[]) => prev.map((inv: any) => inv.id === investmentId ? d.investment : inv))
                        setShowReceiveModal(null)
                      } catch (e) {
                        setReceiveError(e instanceof Error ? e.message : 'Failed to receive')
                      } finally { setReceiveLoadingId(null) }
                    }
                    handleConfirmReceive()
                  }
                }}
                disabled={receiveLoadingId !== null}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
              >
                {receiveLoadingId ? '...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
