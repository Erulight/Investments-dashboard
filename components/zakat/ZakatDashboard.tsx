'use client'

import { useState, useMemo, useEffect } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/sukuk/SukukModal'
import { DateInput } from '@/components/ui/DateInput'
import { AnimatedCard } from '@/components/ui/AnimatedCard'
import { formatDateInput, toIsoDateInput } from '@/lib/date'
import {
  formatCurrencyAmount,
  type DisplayCurrency,
  normalizeDisplayCurrency,
} from '@/lib/currency'

type ReceiptEntry = {
  date: string
  amount: number
  type: string
  investmentName?: string | null
}

const EPSILON = 0.000001

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
  dueReceipts: ReceiptEntry[]
}

type SortKey = 'label' | 'balance' | 'idleBase' | 'receiptsTotal' | 'zakatDue' | 'haulStartDate' | 'haulCompleteDate'
type SortDir = 'asc' | 'desc'
type StatusFilter = 'all' | 'completed' | 'pending'
type DueFilter = 'all' | 'due' | 'none' | 'upcoming'

const sumUniqueBucketBalances = (rows: BucketRow[]) => {
  const byBucket = new Map<string, number>()
  for (const row of rows) {
    const value = Number(row.balance) || 0
    const prev = byBucket.get(row.bucketId) ?? 0
    if (value > prev) byBucket.set(row.bucketId, value)
  }
  let total = 0
  for (const value of byBucket.values()) {
    total += value
  }
  return total
}

function SortArrow({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <span className="inline-flex flex-col ml-1 -space-y-1 text-[10px] leading-none">
      <span className={active && dir === 'asc' ? 'text-emerald-600' : 'text-gray-300'}>&#9650;</span>
      <span className={active && dir === 'desc' ? 'text-emerald-600' : 'text-gray-300'}>&#9660;</span>
    </span>
  )
}

export function ZakatDashboard({
  buckets,
  zakatEnabled = true,
  displayCurrency = 'SAR',
}: {
  buckets: BucketRow[]
  zakatEnabled?: boolean
  displayCurrency?: DisplayCurrency
}) {
  const router = useRouter()

  const toDay = (value: string) => {
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    const d = new Date(value)
    return d
  }

  const addDays = (d: Date, days: number) => {
    const next = new Date(d)
    next.setDate(next.getDate() + days)
    return next
  }

  const isoDay = (d: Date) => {
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    return day.toISOString().split('T')[0]
  }

  const formatDateDisplay = (value?: string | null) => {
    if (!value) return '-'
    const d = toDay(value)
    if (Number.isNaN(d.getTime())) return value
    const dd = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const yy = String(d.getFullYear()).slice(-2)
    return `${dd}-${mm}-${yy}`
  }

  const formatDateTokens = (value?: string | null) => {
    if (!value) return value || ''
    return value.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (_m, y, m, d) => `${d}-${m}-${String(y).slice(-2)}`)
  }

  const hijriEpochStart = new Date(2022, 6, 30) // 1444 AH ~ 2022-07-30
  const hijriEpochYear = 1444
  const hijriYearLengthDays = 354

  const getHijriYearWindowForDate = (d: Date) => {
    const t = d.getTime()
    const e = hijriEpochStart.getTime()
    const dayMs = 1000 * 60 * 60 * 24
    const diffDays = Number.isFinite(t) && Number.isFinite(e) ? Math.floor((t - e) / dayMs) : 0
    const yearIndex = diffDays >= 0 ? Math.floor(diffDays / hijriYearLengthDays) : -Math.ceil(Math.abs(diffDays) / hijriYearLengthDays)
    const year = hijriEpochYear + yearIndex
    const start = addDays(hijriEpochStart, yearIndex * hijriYearLengthDays)
    const endExclusive = addDays(start, hijriYearLengthDays)
    const endInclusive = addDays(endExclusive, -1)
    return { year, start, endExclusive, endInclusive }
  }

  // --- Tab state ---
  const [activeTab, setActiveTab] = useState('all')
  const [yearTab, setYearTab] = useState<number | 'all'>('all')

  // --- Sort state ---
  const [sortKey, setSortKey] = useState<SortKey>('zakatDue')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  // --- Filter state ---
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [dueFilter, setDueFilter] = useState<DueFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [dateRangeStart, setDateRangeStart] = useState('')
  const [dateRangeEnd, setDateRangeEnd] = useState('')
  const [showActiveOnly, setShowActiveOnly] = useState(false)
  const [summaryView, setSummaryView] = useState(false)
  
  // --- Pagination state ---
  const [currentPage, setCurrentPage] = useState(1)
  const rowsPerPage = 50

  // --- Pay modal state ---
  const [payTarget, setPayTarget] = useState<BucketRow | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [payDate, setPayDate] = useState(formatDateInput(new Date()))
  const [payNotes, setPayNotes] = useState('')
  const [payError, setPayError] = useState('')
  const [payLoading, setPayLoading] = useState(false)
  const [rollbackLoading, setRollbackLoading] = useState(false)
  const [rollbackError, setRollbackError] = useState('')

  // --- Details modal state ---
  const [detailsTarget, setDetailsTarget] = useState<BucketRow | null>(null)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [detailsError, setDetailsError] = useState('')
  const [detailsData, setDetailsData] = useState<null | {
    bucket: {
      id: string
      label: string | null
      currency: string
      balance: number
      haulStartDate: string
      lastZakatPaidDate: string | null
      movements: Array<{
        id: string
        amount: number
        type: string
        date: string
        notes: string | null
        investmentId: string | null
        createdAt: string
        investment: null | {
          id: string
          name: string
          isIjarah: boolean
          reopenedAt: string | null
        }
      }>
    }
    transactions: Array<{
      id: string
      type: string
      amount: number
      date: string
      description: string | null
      metadata: string | null
      investmentId: string | null
      personId: string | null
      createdAt: string
    }>
  }>(null)

  // --- Expand state for grouped rows ---
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const toggleGroup = (group: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(group)) next.delete(group)
      else next.add(group)
      return next
    })
  }

  const kindBadge = (kind?: BucketRow['rowKind']) => {
    const k = kind || 'PROFIT'
    const base = 'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold'
    if (k === 'PROFIT') return <span className={`${base} bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300`}>Profit</span>
    if (k === 'COMMISSION') return <span className={`${base} bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300`}>Commission</span>
    if (k === 'IDLE') return <span className={`${base} bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300`}>Idle Cash</span>
    if (k === 'RECEIPT') return <span className={`${base} bg-teal-100 text-teal-800 dark:bg-teal-500/15 dark:text-teal-300`}>Receipt</span>
    if (k === 'REWARD') return <span className={`${base} bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300`}>Reward</span>
    return <span className={`${base} bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200`}>Principal</span>
  }

  // --- Derived data ---
  const sourceGroups = useMemo(() => {
    const set = new Set(buckets.map(b => b.sourceGroup))
    return Array.from(set).sort()
  }, [buckets])

  // Extract unique years from haulCompleteDate
  const availableYears = useMemo(() => {
    const yearSet = new Set<number>()
    buckets.forEach(b => {
      const d = toDay(b.haulCompleteDate)
      if (!Number.isNaN(d.getTime())) {
        yearSet.add(d.getFullYear())
      }
    })
    return Array.from(yearSet).sort((a, b) => b - a) // Descending order
  }, [buckets])

  const filteredBuckets = useMemo(() => {
    let list = buckets
    
    // Filter by year tab
    if (yearTab !== 'all') {
      list = list.filter(b => {
        const d = toDay(b.haulCompleteDate)
        return !Number.isNaN(d.getTime()) && d.getFullYear() === yearTab
      })
    }
    
    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      list = list.filter(b => 
        (b.label || '').toLowerCase().includes(query) ||
        (b.source || '').toLowerCase().includes(query) ||
        (b.sourceGroup || '').toLowerCase().includes(query)
      )
    }
    
    // Date range filter
    if (dateRangeStart) {
      const startDate = toDay(dateRangeStart)
      if (!Number.isNaN(startDate.getTime())) {
        list = list.filter(b => {
          const d = toDay(b.haulCompleteDate)
          return !Number.isNaN(d.getTime()) && d >= startDate
        })
      }
    }
    if (dateRangeEnd) {
      const endDate = toDay(dateRangeEnd)
      if (!Number.isNaN(endDate.getTime())) {
        list = list.filter(b => {
          const d = toDay(b.haulCompleteDate)
          return !Number.isNaN(d.getTime()) && d <= endDate
        })
      }
    }
    
    // Active only filter (hide paid/completed items)
    if (showActiveOnly) {
      list = list.filter(b => !b.isPaid && b.zakatDue > 0)
    }
    
    if (activeTab !== 'all') {
      list = list.filter(b => b.sourceGroup === activeTab)
    }
    if (statusFilter === 'completed') {
      list = list.filter(b => b.haulCompleted)
    } else if (statusFilter === 'pending') {
      list = list.filter(b => !b.haulCompleted)
    }
    if (dueFilter === 'due') {
      list = list.filter(b => b.zakatDue > 0)
    } else if (dueFilter === 'none') {
      list = list.filter(b => b.zakatDue <= 0)
    } else if (dueFilter === 'upcoming') {
      list = list.filter(b => !b.isPaid && b.zakatDue <= 0 && !b.haulCompleted)
    }
    
    // Sort
    const sorted = [...list].sort((a, b) => {
      let va: number | string = 0
      let vb: number | string = 0
      if (sortKey === 'label') {
        va = (a.label || a.source || '').toLowerCase()
        vb = (b.label || b.source || '').toLowerCase()
      } else if (sortKey === 'haulStartDate' || sortKey === 'haulCompleteDate') {
        va = a[sortKey]
        vb = b[sortKey]
      } else {
        va = a[sortKey]
        vb = b[sortKey]
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return sorted
  }, [buckets, yearTab, activeTab, statusFilter, dueFilter, sortKey, sortDir, searchQuery, dateRangeStart, dateRangeEnd, showActiveOnly])

  // Summary view grouping
  const summaryGroups = useMemo(() => {
    if (!summaryView) return null
    
    const groups = new Map<string, BucketRow[]>()
    filteredBuckets.forEach(row => {
      const key = row.sourceGroup
      if (!groups.has(key)) {
        groups.set(key, [])
      }
      groups.get(key)!.push(row)
    })
    
    return Array.from(groups.entries()).map(([sourceGroup, rows]) => ({
      sourceGroup,
      rows,
      totalBalance: sumUniqueBucketBalances(rows),
      totalDue: rows.reduce((sum, r) => sum + r.zakatDue, 0),
      count: rows.length,
    }))
  }, [filteredBuckets, summaryView])
  
  // Pagination
  const totalFilteredRows = filteredBuckets.length
  const totalPages = Math.ceil(totalFilteredRows / rowsPerPage)
  const paginatedBuckets = useMemo(() => {
    const startIndex = (currentPage - 1) * rowsPerPage
    const endIndex = startIndex + rowsPerPage
    return filteredBuckets.slice(startIndex, endIndex)
  }, [filteredBuckets, currentPage, rowsPerPage])
  
  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [yearTab, activeTab, statusFilter, dueFilter, searchQuery, dateRangeStart, dateRangeEnd, showActiveOnly])
  
  const totalDue = filteredBuckets.reduce((sum, b) => sum + b.zakatDue, 0)
  const totalBalance = sumUniqueBucketBalances(filteredBuckets)
  const dueRowsCount = filteredBuckets.filter((b) => Number(b.zakatDue) > EPSILON).length
  const paidRowsCount = filteredBuckets.filter((b) => b.isPaid).length
  const haulCompletedCount = filteredBuckets.filter((b) => b.haulCompleted).length
  const paymentCoveragePct = filteredBuckets.length > 0
    ? (paidRowsCount / filteredBuckets.length) * 100
    : 0

  const hijriSummaries = useMemo(() => {
    const map = new Map<number, { year: number; start: Date; endExclusive: Date; endInclusive: Date; due: number; total: number; rows: BucketRow[] }>()
    const eligible = buckets
      .filter(r => (Number(r.zakatDue) > 0) || r.isPaid || (Number(r.idleBase) > 0) || (Number(r.receiptsTotal) > 0))

    eligible.forEach(r => {
      const d = toDay(r.haulCompleteDate)
      if (Number.isNaN(d.getTime())) return
      const w = getHijriYearWindowForDate(d)
      const existing = map.get(w.year) || { year: w.year, start: w.start, endExclusive: w.endExclusive, endInclusive: w.endInclusive, due: 0, total: 0, rows: [] }
      existing.due += Number(r.zakatDue) || 0
      existing.total += (Number(r.idleBase) || 0) + (Number(r.receiptsTotal) || 0)
      existing.rows.push(r)
      map.set(w.year, existing)
    })
    return Array.from(map.values()).sort((a, b) => b.year - a.year)
  }, [buckets])

  const [payAllLoadingYear, setPayAllLoadingYear] = useState<number | null>(null)
  const [payAllError, setPayAllError] = useState<string>('')

  const payAllForHijriYear = async (year: number) => {
    if (!zakatEnabled) return
    const summary = hijriSummaries.find(s => s.year === year)
    if (!summary) return
    const dueRows = summary.rows.filter(r => (Number(r.zakatDue) || 0) > 0)
    if (dueRows.length === 0) return

    const confirmed = confirm(`Pay all Zakat due for ${year} AH (${dueRows.length} items)?`)
    if (!confirmed) return

    setPayAllLoadingYear(year)
    setPayAllError('')
    try {
      for (const row of dueRows) {
        const amount = Number(row.zakatDue)
        if (!Number.isFinite(amount) || amount <= 0) continue
        const res = await fetch('/api/zakat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bucketId: row.bucketId,
            rowId: row.id,
            amount,
            date: new Date().toISOString().slice(0, 10),
            notes: `Pay all for ${year} AH`,
            periodEnd: row.haulCompleteDate,
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(data.error || 'Failed to pay zakat')
        }
      }
      window.dispatchEvent(new CustomEvent('zakat-payment-made'))
      router.refresh()
    } catch (err) {
      setPayAllError(err instanceof Error ? err.message : 'Failed to pay all')
    } finally {
      setPayAllLoadingYear(null)
    }
  }

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const openPay = (bucket: BucketRow) => {
    if (!zakatEnabled) return
    setPayTarget(bucket)
    setPayAmount(bucket.zakatDue.toFixed(2))
    setPayDate(formatDateInput(new Date()))
    setPayNotes('')
    setPayError('')
  }

  const closePay = () => {
    if (payLoading) return
    setPayTarget(null)
  }

  const handlePay = async (event: FormEvent) => {
    event.preventDefault()
    if (!payTarget) return
    const amount = Number(payAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      setPayError('Enter a valid amount')
      return
    }
    const isoDate = toIsoDateInput(payDate)
    if (!isoDate) {
      setPayError('Invalid payment date format')
      return
    }

    if (amount > Number(payTarget.zakatDue) + EPSILON) {
      setPayError('Payment exceeds zakat due for this row')
      return
    }

    const todayIso = new Date().toISOString().slice(0, 10)
    if (isoDate > todayIso) {
      setPayError('Payment date cannot be in the future')
      return
    }

    if (payTarget.haulCompleteDate && isoDate < payTarget.haulCompleteDate) {
      setPayError('Payment date cannot be before haul end date')
      return
    }

    setPayLoading(true)
    setPayError('')
    try {
      const res = await fetch('/api/zakat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bucketId: payTarget.bucketId,
          rowId: payTarget.id,
          amount,
          date: isoDate,
          notes: payNotes,
          periodEnd: payTarget.haulCompleteDate,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || 'Failed to pay zakat')
      }
      setPayTarget(null)
      // Dispatch custom event to notify ZakatPageClient
      window.dispatchEvent(new CustomEvent('zakat-payment-made'))
      router.refresh()
    } catch (err) {
      setPayError(err instanceof Error ? err.message : 'Failed to pay zakat')
    } finally {
      setPayLoading(false)
    }
  }

  const handleRollback = async (bucket: BucketRow) => {
    if (!bucket.lastPayment) return
    const confirmed = confirm('Undo last zakat payment and restore cash?')
    if (!confirmed) return
    setRollbackLoading(true)
    setRollbackError('')
    try {
      const res = await fetch('/api/zakat/rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bucketId: bucket.bucketId,
          movementId: bucket.lastPayment.id,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || 'Failed to rollback zakat')
      }
      // Dispatch custom event to notify ZakatPageClient
      window.dispatchEvent(new CustomEvent('zakat-payment-made'))
      router.refresh()
    } catch (err) {
      setRollbackError(err instanceof Error ? err.message : 'Failed to rollback zakat')
    } finally {
      setRollbackLoading(false)
    }
  }

  const openDetails = async (bucket: BucketRow) => {
    setDetailsTarget(bucket)
    setDetailsLoading(true)
    setDetailsError('')
    setDetailsData(null)
    try {
      const res = await fetch(`/api/zakat/buckets/${bucket.bucketId}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load bucket details')
      }
      setDetailsData(data)
    } catch (err) {
      setDetailsError(err instanceof Error ? err.message : 'Failed to load bucket details')
    } finally {
      setDetailsLoading(false)
    }
  }

  const closeDetails = () => {
    if (detailsLoading) return
    setDetailsTarget(null)
    setDetailsError('')
    setDetailsData(null)
  }

  const money = (n: number, sourceCurrency: DisplayCurrency = 'SAR') =>
    formatCurrencyAmount(n, displayCurrency, sourceCurrency)

  return (
    <div className="space-y-4">
      {!zakatEnabled && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          Zakat is disabled because total zakatable wealth is below Nisab.
        </div>
      )}

      <div className="space-y-2">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {hijriSummaries.map((s, index) => {
            const allPaid = s.due <= 0.000001
            const windowText = `${isoDay(s.start)} → ${isoDay(s.endInclusive)}`
            return (
              <AnimatedCard key={s.year} index={index} className="border border-slate-200 dark:border-white/10" hover={false}>
                <CardContent className="py-3 px-4 bg-white dark:bg-slate-900/60 rounded-lg">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{s.year} AH</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{windowText}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">Due</div>
                      <div className={`text-lg font-bold tabular-nums ${allPaid ? 'text-emerald-700' : 'text-amber-700'}`}>{money(Math.max(0, s.due))}</div>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">{s.rows.length} item{s.rows.length !== 1 ? 's' : ''}</div>
                    {allPaid ? (
                      <div className="text-xs font-semibold text-emerald-700">Paid</div>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => payAllForHijriYear(s.year)}
                        disabled={!zakatEnabled || payAllLoadingYear === s.year}
                      >
                        {payAllLoadingYear === s.year ? 'Paying...' : 'Pay All'}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </AnimatedCard>
            )
          })}
        </div>
        {payAllError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">
            {payAllError}
          </div>
        )}
      </div>
      {/* Summary row */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <AnimatedCard index={0} className="border border-slate-200 dark:border-white/10 p-3" hover={false}>
          <div className="text-xs text-slate-500 dark:text-slate-400">Total Zakat Due</div>
          <div className="text-lg font-bold text-emerald-700">{money(totalDue)}</div>
        </AnimatedCard>
        <AnimatedCard index={1} className="border border-slate-200 dark:border-white/10 p-3" hover={false}>
          <div className="text-xs text-slate-500 dark:text-slate-400">Total Balance</div>
          <div className="text-lg font-bold text-slate-900 dark:text-slate-100">{money(totalBalance)}</div>
        </AnimatedCard>
        <AnimatedCard index={2} className="border border-slate-200 dark:border-white/10 p-3" hover={false}>
          <div className="text-xs text-slate-500 dark:text-slate-400">Due Rows</div>
          <div className="text-lg font-bold text-amber-700 dark:text-amber-300">{dueRowsCount}</div>
        </AnimatedCard>
        <AnimatedCard index={3} className="border border-slate-200 dark:border-white/10 p-3" hover={false}>
          <div className="text-xs text-slate-500 dark:text-slate-400">Paid Rows</div>
          <div className="text-lg font-bold text-emerald-700 dark:text-emerald-300">{paidRowsCount}</div>
        </AnimatedCard>
        <AnimatedCard index={4} className="border border-slate-200 dark:border-white/10 p-3" hover={false}>
          <div className="text-xs text-slate-500 dark:text-slate-400">Haul Complete</div>
          <div className="text-lg font-bold text-slate-900 dark:text-slate-100">{haulCompletedCount}</div>
        </AnimatedCard>
        <AnimatedCard index={5} className="border border-slate-200 dark:border-white/10 p-3" hover={false}>
          <div className="text-xs text-slate-500 dark:text-slate-400">Payment Coverage</div>
          <div className="text-lg font-bold text-slate-900 dark:text-slate-100">{paymentCoveragePct.toFixed(1)}%</div>
        </AnimatedCard>
      </div>

      {/* Year Tabs */}
      <div className="flex items-center gap-2 border-b border-gray-200 pb-2">
        <button
          onClick={() => setYearTab('all')}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
            yearTab === 'all'
              ? 'bg-emerald-50 text-emerald-700 border-b-2 border-emerald-600'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
          }`}
        >
          All Years
        </button>
        {availableYears.map((year) => {
          const yearBuckets = buckets.filter(b => {
            const d = toDay(b.haulCompleteDate)
            return !Number.isNaN(d.getTime()) && d.getFullYear() === year
          })
          const yearDue = yearBuckets.reduce((sum, b) => sum + b.zakatDue, 0)
          return (
            <button
              key={year}
              onClick={() => setYearTab(year)}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                yearTab === year
                  ? 'bg-emerald-50 text-emerald-700 border-b-2 border-emerald-600'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              {year}
              {yearDue > 0 && (
                <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                  {money(yearDue)}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Source Filter */}
      <div className="flex items-center gap-3">
        <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Source:</label>
        <select
          value={activeTab}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => setActiveTab(e.target.value)}
          className="max-w-[300px] rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-200"
        >
          <option value="all">All sources ({buckets.length})</option>
          {sourceGroups.map((grp: string) => {
            const count = buckets.filter(b => b.sourceGroup === grp).length
            return (
              <option key={grp} value={grp}>
                {grp} ({count})
              </option>
            )
          })}
        </select>
        {activeTab !== 'all' && (
          <button
            onClick={() => setActiveTab('all')}
            className="text-xs text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
          >
            Clear
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-slate-500 dark:text-slate-400">Status:</span>
          {(['all', 'completed', 'pending'] as StatusFilter[]).map(f => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-2 py-0.5 rounded text-xs font-medium ${
                statusFilter === f
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/10 dark:text-slate-300 dark:hover:bg-white/15'
              }`}
            >
              {f === 'all' ? 'All' : f === 'completed' ? 'Haul Complete' : 'Pending'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-slate-500 dark:text-slate-400">Zakat:</span>
          {(['all', 'due', 'upcoming', 'none'] as DueFilter[]).map(f => (
            <button
              key={f}
              onClick={() => setDueFilter(f)}
              className={`px-2 py-0.5 rounded text-xs font-medium ${
                dueFilter === f
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/10 dark:text-slate-300 dark:hover:bg-white/15'
              }`}
            >
              {f === 'all' ? 'All' : f === 'due' ? 'Has Due' : f === 'upcoming' ? 'Upcoming' : 'No Due'}
            </button>
          ))}
        </div>
      </div>

      {/* Advanced Filters */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Search */}
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Search</label>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Investment name..."
            className="w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-200"
          />
        </div>

        {/* Date Range Start */}
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">From Date</label>
          <input
            type="date"
            value={dateRangeStart}
            onChange={(e) => setDateRangeStart(e.target.value)}
            className="w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-200"
          />
        </div>

        {/* Date Range End */}
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">To Date</label>
          <input
            type="date"
            value={dateRangeEnd}
            onChange={(e) => setDateRangeEnd(e.target.value)}
            className="w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-200"
          />
        </div>

        {/* View Options */}
        <div className="flex flex-col gap-2">
          <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-200">
            <input
              type="checkbox"
              checked={showActiveOnly}
              onChange={(e) => setShowActiveOnly(e.target.checked)}
              className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 dark:border-white/10 dark:bg-slate-900"
            />
            Active Only
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-200">
            <input
              type="checkbox"
              checked={summaryView}
              onChange={(e) => setSummaryView(e.target.checked)}
              className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 dark:border-white/10 dark:bg-slate-900"
            />
            Summary View
          </label>
        </div>
      </div>

      {/* Clear Filters */}
      {(searchQuery || dateRangeStart || dateRangeEnd || showActiveOnly) && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setSearchQuery('')
              setDateRangeStart('')
              setDateRangeEnd('')
              setShowActiveOnly(false)
            }}
            className="text-xs font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-300 dark:hover:text-emerald-200"
          >
            Clear Advanced Filters
          </button>
        </div>
      )}

      {/* Summary View */}
      {summaryView && summaryGroups && summaryGroups.length > 0 ? (
        <Card>
          <CardContent className="p-4">
            <div className="space-y-3">
              <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">Summary by Investment</div>
              {summaryGroups.map((group) => (
                <div key={group.sourceGroup} className="flex items-center justify-between rounded-lg bg-slate-50 p-3 dark:bg-white/5">
                  <div className="flex-1">
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{group.sourceGroup}</div>
                    <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{group.count} hawl{group.count !== 1 ? 's' : ''}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-slate-500 dark:text-slate-400">Balance</div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{money(group.totalBalance)}</div>
                  </div>
                  <div className="text-right ml-4">
                    <div className="text-xs text-slate-500 dark:text-slate-400">Zakat Due</div>
                    <div className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">{money(group.totalDue)}</div>
                  </div>
                  <button
                    onClick={() => {
                      setSummaryView(false)
                      setActiveTab(group.sourceGroup)
                    }}
                    className="ml-4 text-xs font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-300 dark:hover:text-emerald-200"
                  >
                    View Details
                  </button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {filteredBuckets.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-500 dark:text-slate-400">No buckets match your filters.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500 dark:border-white/10 dark:bg-slate-900/70 dark:text-slate-300">
                    <th className="py-2.5 px-3 font-medium cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort('label')}>
                      Item <SortArrow active={sortKey === 'label'} dir={sortDir} />
                    </th>
                    <th className="py-2.5 px-3 font-medium cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort('haulStartDate')}>
                      Haul Start <SortArrow active={sortKey === 'haulStartDate'} dir={sortDir} />
                    </th>
                    <th className="py-2.5 px-3 font-medium cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort('haulCompleteDate')}>
                      Haul End <SortArrow active={sortKey === 'haulCompleteDate'} dir={sortDir} />
                    </th>
                    <th className="py-2.5 px-3 font-medium text-right cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort('balance')}>
                      Balance <SortArrow active={sortKey === 'balance'} dir={sortDir} />
                    </th>
                    <th className="py-2.5 px-3 font-medium text-right cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort('idleBase')}>
                      Idle Cash <SortArrow active={sortKey === 'idleBase'} dir={sortDir} />
                    </th>
                    <th className="py-2.5 px-3 font-medium text-right cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort('receiptsTotal')}>
                      Receipts <SortArrow active={sortKey === 'receiptsTotal'} dir={sortDir} />
                    </th>
                    <th className="py-2.5 px-3 font-medium text-right cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort('zakatDue')}>
                      Zakat Due <SortArrow active={sortKey === 'zakatDue'} dir={sortDir} />
                    </th>
                    <th className="py-2.5 px-3 font-medium text-center whitespace-nowrap">Status</th>
                    <th className="py-2.5 px-3 font-medium text-right whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/10">
                  {(() => {
                    const groupMap = new Map<string, BucketRow[]>()
                    paginatedBuckets.forEach(r => {
                      const key = r.source && r.source !== 'General' ? r.source : 'General Cash'
                      const existing = groupMap.get(key) || []
                      existing.push(r)
                      groupMap.set(key, existing)
                    })

                    const entries = Array.from(groupMap.entries()).sort((a, b) => {
                      if (a[0] === 'General Cash') return 1
                      if (b[0] === 'General Cash') return -1
                      return a[0].localeCompare(b[0])
                    })

                    const rows: React.ReactNode[] = []
                    for (const [groupName, groupRows] of entries) {
                      const isExpanded = expandedGroups.has(groupName)
                      const gBalance = sumUniqueBucketBalances(groupRows)
                      const gIdle = groupRows.reduce((s, r) => s + (Number(r.idleBase) || 0), 0)
                      const gReceipts = groupRows.reduce((s, r) => s + (Number(r.receiptsTotal) || 0), 0)
                      const gZakat = groupRows.reduce((s, r) => s + (Number(r.zakatDue) || 0), 0)
                      const gUpcoming = groupRows.some(r => !r.isPaid && (Number(r.zakatDue) || 0) <= EPSILON && !r.haulCompleted)
                      const cur = normalizeDisplayCurrency(groupRows[0]?.currency)

                      rows.push(
                        <tr
                          key={`group-${groupName}`}
                          className="cursor-pointer bg-slate-50 transition-colors hover:bg-slate-100 dark:bg-white/5 dark:hover:bg-white/10"
                          onClick={() => toggleGroup(groupName)}
                        >
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-slate-400 dark:text-slate-500">{isExpanded ? '▾' : '▸'}</span>
                              <div>
                                <div className="font-semibold text-slate-900 dark:text-slate-100">{groupName}</div>
                                <div className="text-[11px] text-slate-400 dark:text-slate-500">{groupRows.length} item{groupRows.length !== 1 ? 's' : ''}</div>
                              </div>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400">-</td>
                          <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400">-</td>
                          <td className="py-2.5 px-3 text-right font-medium text-slate-900 dark:text-slate-100">{money(gBalance, cur)}</td>
                          <td className="py-2.5 px-3 text-right text-slate-700 dark:text-slate-200">{money(gIdle, cur)}</td>
                          <td className="py-2.5 px-3 text-right text-slate-700 dark:text-slate-200">{money(gReceipts, cur)}</td>
                          <td className="py-2.5 px-3 text-right font-semibold text-slate-900 dark:text-slate-100">{money(gZakat, cur)}</td>
                          <td className="py-2.5 px-3 text-center">
                            {gZakat > 0.000001 ? (
                              <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">Due</span>
                            ) : gUpcoming ? (
                              <span className="text-[11px] font-semibold text-blue-700 dark:text-blue-300">Upcoming</span>
                            ) : (
                              <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">Paid</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right text-xs text-slate-400 dark:text-slate-500">Toggle</td>
                        </tr>
                      )

                      if (!isExpanded) continue

                      const sorted = [...groupRows].sort((a, b) => {
                        const da = String(a.haulCompleteDate)
                        const db = String(b.haulCompleteDate)
                        if (da < db) return -1
                        if (da > db) return 1
                        return (a.label || '').localeCompare(b.label || '')
                      })

                      sorted.forEach((b) => {
                        rows.push(
                          <tr key={b.id} className="hover:bg-slate-50 dark:hover:bg-white/5">
                            <td className="py-2.5 px-3">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <div className="font-medium text-slate-900 dark:text-slate-100">{formatDateTokens(b.label || b.source)}</div>
                                  <div className="mt-1 flex items-center gap-2">
                                    {kindBadge(b.rowKind)}
                                    <span className="text-[11px] text-gray-400">{b.sourceType}</span>
                                  </div>
                                  {b.why && (
                                    <div className="text-[11px] text-gray-500 mt-1">{formatDateTokens(b.why)}</div>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-gray-600">{formatDateDisplay(b.haulStartDate)}</td>
                            <td className="py-2.5 px-3 text-gray-600">{formatDateDisplay(b.haulCompleteDate)}</td>
                            <td className="py-2.5 px-3 text-right">{money(b.balance, normalizeDisplayCurrency(b.currency))}</td>
                            <td className="py-2.5 px-3 text-right">{money(b.idleBase, normalizeDisplayCurrency(b.currency))}</td>
                            <td className="py-2.5 px-3 text-right">{money(b.receiptsTotal, normalizeDisplayCurrency(b.currency))}</td>
                            <td className="py-2.5 px-3 text-right font-semibold">{money(b.zakatDue, normalizeDisplayCurrency(b.currency))}</td>
                            <td className="py-2.5 px-3 text-center">
                              {b.isPaid ? (
                                <span className="text-[11px] font-semibold text-emerald-700">Paid</span>
                              ) : b.zakatDue > 0 ? (
                                <span className="text-[11px] font-semibold text-amber-700">Due</span>
                              ) : !b.haulCompleted ? (
                                <span className="text-[11px] font-semibold text-blue-700">Upcoming</span>
                              ) : (
                                <span className="text-[11px] font-semibold text-gray-500">-</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <div className="flex justify-end gap-2">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    openDetails(b)
                                  }}
                                  className="text-xs text-gray-500 hover:text-gray-700"
                                >
                                  Details
                                </button>
                                {b.zakatDue > 0 && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      openPay(b)
                                    }}
                                    className="text-xs font-semibold text-emerald-700 hover:text-emerald-800"
                                  >
                                    Pay
                                  </button>
                                )}
                                {b.lastPayment && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleRollback(b)
                                    }}
                                    className="text-xs text-red-600 hover:text-red-700"
                                  >
                                    Undo
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })
                    }

                    return rows
                  })()}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 border-t border-gray-200">
                    <td colSpan={3} className="py-2.5 px-3 text-xs font-semibold text-gray-500">Total</td>
                    <td className="py-2.5 px-3 text-right font-bold text-gray-900 whitespace-nowrap">
                      {money(totalBalance)}
                    </td>
                    <td className="py-2.5 px-3"></td>
                    <td className="py-2.5 px-3"></td>
                    <td className="py-2.5 px-3 text-right font-bold text-emerald-700 whitespace-nowrap">
                      {money(totalDue)}
                    </td>
                    <td className="py-2.5 px-3"></td>
                    <td className="py-2.5 px-3"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination Controls */}
      {!summaryView && totalPages > 1 && (
        <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-slate-900/60">
          <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <span>
              Showing {((currentPage - 1) * rowsPerPage) + 1} to {Math.min(currentPage * rowsPerPage, totalFilteredRows)} of {totalFilteredRows} rows
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:bg-white/5"
            >
              First
            </button>
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:bg-white/5"
            >
              Previous
            </button>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum: number
                if (totalPages <= 5) {
                  pageNum = i + 1
                } else if (currentPage <= 3) {
                  pageNum = i + 1
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i
                } else {
                  pageNum = currentPage - 2 + i
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md ${
                      currentPage === pageNum
                        ? 'bg-emerald-600 text-white'
                        : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:bg-white/5'
                    }`}
                  >
                    {pageNum}
                  </button>
                )
              })}
            </div>
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:bg-white/5"
            >
              Next
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:bg-white/5"
            >
              Last
            </button>
          </div>
        </div>
      )}

      {rollbackError && (
        <div className="text-xs text-red-600 px-1">{rollbackError}</div>
      )}

      <Modal
        isOpen={Boolean(detailsTarget)}
        onClose={closeDetails}
        title={detailsTarget ? `Bucket Details • ${detailsTarget.label ? formatDateTokens(detailsTarget.label) : detailsTarget.id.slice(0, 8)}` : 'Bucket Details'}
      >
        {detailsError && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 border border-red-200 mb-4">
            {detailsError}
          </div>
        )}

        {detailsLoading && (
          <div className="text-sm text-slate-500 dark:text-slate-400">Loading bucket details...</div>
        )}

        {!detailsLoading && detailsTarget && (
          <div className="space-y-6">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">How this bucket’s zakat is calculated</div>
              <div className="mt-2 text-sm text-slate-700 dark:text-slate-200">
                Zakat is calculated as 2.5% of:
              </div>
              <div className="mt-2 space-y-1 text-sm text-slate-700 dark:text-slate-200">
                <div>
                  Idle cash held through haul completion ({formatDateDisplay(detailsTarget.haulStartDate)} → {formatDateDisplay(detailsTarget.haulCompleteDate)}):
                  <span className="font-semibold text-slate-900 dark:text-slate-100"> {money(detailsTarget.idleBase, normalizeDisplayCurrency(detailsTarget.currency))}</span>
                </div>
                <div>
                  + Receipts after haul completion:
                  <span className="font-semibold text-slate-900 dark:text-slate-100"> {money(detailsTarget.receiptsTotal, normalizeDisplayCurrency(detailsTarget.currency))}</span>
                </div>
                <div>
                  = Zakat due:
                  <span className="font-semibold text-emerald-700"> {money(detailsTarget.zakatDue, normalizeDisplayCurrency(detailsTarget.currency))}</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="rounded-lg border border-slate-200 p-4 dark:border-white/10">
                <div className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">Bucket movements / logs</div>
                {detailsData?.bucket?.movements?.length ? (
                  <div className="overflow-auto max-h-80">
                    <table className="min-w-full text-sm">
                      <thead className="sticky top-0 bg-white dark:bg-slate-950">
                        <tr className="border-b border-slate-200 text-left text-xs text-slate-500 dark:border-white/10 dark:text-slate-400">
                          <th className="py-2 pr-3">Date</th>
                          <th className="py-2 pr-3">Type</th>
                          <th className="py-2 pr-3">Investment</th>
                          <th className="py-2 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-white/10">
                        {detailsData.bucket.movements.map((m: any) => (
                          <tr key={m.id} className="text-slate-700 dark:text-slate-200">
                            <td className="py-2 pr-3 whitespace-nowrap">
                              {formatDateDisplay(m.date)}
                            </td>
                            <td className="py-2 pr-3 whitespace-nowrap">{m.type}</td>
                            <td className="py-2 pr-3 truncate max-w-[220px]">
                              {m.investment?.name ? m.investment.name : '-'}
                            </td>
                            <td className={`py-2 text-right whitespace-nowrap ${m.amount < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                              {money(Math.abs(m.amount), normalizeDisplayCurrency(detailsTarget.currency))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-sm text-slate-500 dark:text-slate-400">No movements found.</div>
                )}
              </div>

              <div className="rounded-lg border border-slate-200 p-4 dark:border-white/10">
                <div className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">Related transactions</div>
                {detailsData?.transactions?.length ? (
                  <div className="overflow-auto max-h-80">
                    <table className="min-w-full text-sm">
                      <thead className="sticky top-0 bg-white dark:bg-slate-950">
                        <tr className="border-b border-slate-200 text-left text-xs text-slate-500 dark:border-white/10 dark:text-slate-400">
                          <th className="py-2 pr-3">Date</th>
                          <th className="py-2 pr-3">Type</th>
                          <th className="py-2 pr-3">Description</th>
                          <th className="py-2 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-white/10">
                        {detailsData.transactions.map((t: any) => (
                          <tr key={t.id} className="text-slate-700 dark:text-slate-200">
                            <td className="py-2 pr-3 whitespace-nowrap">
                              {formatDateDisplay(t.date)}
                            </td>
                            <td className="py-2 pr-3 whitespace-nowrap">{t.type}</td>
                            <td className="py-2 pr-3 truncate max-w-[260px]">
                              {t.description || '-'}
                            </td>
                            <td className={`py-2 text-right whitespace-nowrap ${t.amount < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                              {money(Math.abs(t.amount), normalizeDisplayCurrency(detailsTarget.currency))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-sm text-slate-500 dark:text-slate-400">No related transactions found.</div>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={Boolean(payTarget)}
        onClose={closePay}
        title="Pay Zakat"
      >
        <form onSubmit={handlePay} className="space-y-4">
          {payError && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 border border-red-200">
              {payError}
            </div>
          )}
          {payTarget && (
            <div className="text-sm text-slate-600 dark:text-slate-300">
              {formatDateTokens(payTarget.label || payTarget.source)} — Hawl {payTarget.periodIndex} • Due {money(payTarget.zakatDue, normalizeDisplayCurrency(payTarget.currency))}
            </div>
          )}
          <DateInput
            value={payDate}
            onChange={(value: string) => setPayDate(value)}
            ariaLabel="Payment date"
          />
          <input
            type="number"
            min="0"
            step="0.01"
            value={payAmount}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setPayAmount(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100 dark:placeholder:text-slate-500"
            placeholder="Amount"
          />
          <input
            type="text"
            value={payNotes}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setPayNotes(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100 dark:placeholder:text-slate-500"
            placeholder="Notes (optional)"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={closePay} disabled={payLoading}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={payLoading}>
              {payLoading ? 'Paying...' : 'Confirm Payment'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
