'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import { Button } from '@/components/ui/Button'
import { Modal } from './SukukModal'
import { SukukForm } from './SukukForm'

interface SukukListProps {
  initialSukuk: any[]
  userRole: string
}

export function SukukList({ initialSukuk, userRole }: SukukListProps) {
  const router = useRouter()
  const [sukuk, setSukuk] = useState<any[]>(
    Array.isArray(initialSukuk) ? initialSukuk : []
  )
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [editingSukuk, setEditingSukuk] = useState<any>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [detailTarget, setDetailTarget] = useState<any>(null)
  const [withdrawTarget, setWithdrawTarget] = useState<any>(null)
  const [sellTarget, setSellTarget] = useState<any>(null)
  const [withdrawForm, setWithdrawForm] = useState({
    source: 'PROFIT',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    notes: '',
  })
  const [sellForm, setSellForm] = useState({
    buyerPersonId: '',
    amount: '',
    salePrice: '',
    date: new Date().toISOString().split('T')[0],
    notes: '',
  })
  const [partners, setPartners] = useState<any[]>([])
  const [actionError, setActionError] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [filters, setFilters] = useState({
    platforms: [] as string[],
    terms: [] as string[],
    years: [] as string[],
    months: [] as string[],
    days: [] as string[],
    statuses: [] as string[],
  })
  const list = Array.isArray(sukuk) ? sukuk : []
  const isEmpty = list.length === 0

  const openCreateModal = () => setIsCreateModalOpen(true)
  const asOfDate = new Date()
  const asOfLabel = asOfDate.toLocaleDateString()

  const toDate = (value?: string | Date | null) => {
    if (!value) return null
    if (value instanceof Date) return value
    if (typeof value === 'string') {
      const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
      if (match) {
        const [, year, month, day] = match
        return new Date(Number(year), Number(month) - 1, Number(day))
      }
    }
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return null
    return date
  }

  const formatDate = (value?: string | Date | null) => {
    const date = toDate(value)
    if (!date) return '-'
    return date.toLocaleDateString('en-CA')
  }

  const formatCurrency = (value: number, currency?: string) => {
    const amount = Number.isFinite(value) ? value : 0
    const formatted = amount.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
    return currency ? `${currency} ${formatted}` : formatted
  }

  const formatPercent = (value: number) => {
    const percent = Number.isFinite(value) ? value : 0
    return `${percent.toFixed(2)}%`
  }

  const getPeriodMonths = (start?: string | Date | null, end?: string | Date | null) => {
    const startDate = toDate(start)
    const endDate = toDate(end)
    if (!startDate || !endDate) return null
    const months = (endDate.getFullYear() - startDate.getFullYear()) * 12
      + (endDate.getMonth() - startDate.getMonth())
      + (endDate.getDate() - startDate.getDate()) / 30
    return Math.max(0, months)
  }

  const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())

  const getLatestReceiptDate = (inv: any) => {
    const transactions = Array.isArray(inv.transactions) ? inv.transactions : []
    const profitReceipts = transactions.filter((tx: any) => tx.type === 'WITHDRAW_PROFIT')
    if (profitReceipts.length === 0) return null
    return profitReceipts.reduce((latest: Date | null, tx: any) => {
      const txDate = toDate(tx.date)
      if (!txDate) return latest
      if (!latest || txDate > latest) return txDate
      return latest
    }, null)
  }

  const getDaysRemaining = (end?: string | Date | null, reference?: Date | null) => {
    const endDate = toDate(end)
    if (!endDate) return null
    const asOf = startOfDay(reference ?? asOfDate)
    const endDay = startOfDay(endDate)
    const diffMs = endDay.getTime() - asOf.getTime()
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
    return diffDays
  }

  const getProgress = (netProfit: number, totalReceived: number) => {
    if (netProfit <= 0) {
      return { percent: 0, className: 'bg-gray-100 text-gray-700' }
    }
    const percent = Math.min(100, Math.max(0, (totalReceived / netProfit) * 100))
    const className = percent >= 100 ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
    return { percent, className }
  }

  const getMetrics = (inv: any) => {
    const principal = inv.myParticipation?.investedAmount ?? inv.principalAmount
    const totalInvestment = Number.isFinite(principal) ? principal : 0
    const apr = Number.isFinite(inv.interestRate) ? inv.interestRate : 0
    const fees = Number.isFinite(inv.fees) ? inv.fees : 0
    const totalReceived = Number.isFinite(inv.totalReceived) ? inv.totalReceived : 0
    const periodMonths = getPeriodMonths(inv.startDate, inv.maturityDate)
    const periodYears = periodMonths ? periodMonths / 12 : 0
    const grossProfit = totalInvestment > 0 && apr > 0 && periodYears > 0
      ? totalInvestment * (apr / 100) * periodYears
      : 0
    const manualReceivable = Number.isFinite(inv.receivableAmount) ? inv.receivableAmount : null
    const netProfit = manualReceivable !== null && manualReceivable > 0
      ? manualReceivable
      : Math.max(0, grossProfit - fees)
    const aprAfterFees = totalInvestment > 0 ? (netProfit / totalInvestment) * 100 : 0
    const receivable = Math.max(0, netProfit - totalReceived)
    const receiptDate = getLatestReceiptDate(inv)
    const isFullyReceived = netProfit > 0 && totalReceived >= netProfit - 0.01
    const referenceDate = isFullyReceived
      ? receiptDate ?? toDate(inv.maturityDate) ?? asOfDate
      : asOfDate
    const daysRemaining = getDaysRemaining(inv.maturityDate, referenceDate)
    const progress = getProgress(netProfit, totalReceived)
    const currency = inv.account?.currency || ''

    return {
      totalInvestment,
      apr: manualReceivable !== null && manualReceivable > 0 && periodYears
        ? ((manualReceivable + fees) / totalInvestment / periodYears) * 100
        : apr,
      fees,
      totalReceived,
      periodMonths,
      netProfit,
      aprAfterFees,
      receivable,
      daysRemaining,
      paymentStatus:
        daysRemaining !== null && daysRemaining < 0
          ? 'delayed'
          : isFullyReceived && daysRemaining !== null && daysRemaining > 0
            ? 'early'
            : 'on-time',
      progress,
      currency,
      isFullyReceived,
    }
  }

  const toggleFilter = (key: keyof typeof filters, value: string) => {
    setFilters((prev) => {
      const list = prev[key]
      const exists = list.includes(value)
      const next = exists ? list.filter((item) => item !== value) : [...list, value]
      return { ...prev, [key]: next }
    })
  }

  const clearFilters = () => {
    setFilters({
      platforms: [],
      terms: [],
      years: [],
      months: [],
      days: [],
      statuses: [],
    })
  }

  const filterOptions = list.reduce<{
    platforms: Set<string>
    terms: Set<string>
    years: Set<string>
    months: Set<string>
    days: Set<string>
  }>(
    (acc, inv) => {
      const platform = inv.account?.name
      if (platform) acc.platforms.add(platform)
      const maturityDate = toDate(inv.maturityDate)
      if (maturityDate) {
        acc.years.add(String(maturityDate.getFullYear()))
        acc.months.add(String(maturityDate.getMonth() + 1))
        acc.days.add(String(maturityDate.getDate()))
      }
      const metrics = getMetrics(inv)
      if (metrics.periodMonths !== null) {
        if (metrics.periodMonths <= 12) acc.terms.add('short')
        if (metrics.periodMonths > 12) acc.terms.add('long')
      }
      return acc
    },
    {
      platforms: new Set<string>(),
      terms: new Set<string>(),
      years: new Set<string>(),
      months: new Set<string>(),
      days: new Set<string>(),
    }
  )

  const filteredSukuk = list.filter((inv) => {
    const metrics = getMetrics(inv)
    const platform = inv.account?.name || ''
    const maturityDate = toDate(inv.maturityDate)
    const year = maturityDate ? String(maturityDate.getFullYear()) : null
    const month = maturityDate ? String(maturityDate.getMonth() + 1) : null
    const day = maturityDate ? String(maturityDate.getDate()) : null
    const term = metrics.periodMonths === null
      ? 'unknown'
      : metrics.periodMonths <= 12
        ? 'short'
        : 'long'

    if (filters.platforms.length > 0 && !filters.platforms.includes(platform)) {
      return false
    }

    if (filters.terms.length > 0 && !filters.terms.includes(term)) {
      return false
    }

    if (filters.years.length > 0 && (!year || !filters.years.includes(year))) {
      return false
    }

    if (filters.months.length > 0 && (!month || !filters.months.includes(month))) {
      return false
    }

    if (filters.days.length > 0 && (!day || !filters.days.includes(day))) {
      return false
    }

    if (filters.statuses.length > 0) {
      const statusChecks = {
        receivable: metrics.receivable > 0,
        received: metrics.receivable <= 0,
        nearClose: metrics.daysRemaining !== null && metrics.daysRemaining > 0 && metrics.daysRemaining <= 30,
        closing: metrics.daysRemaining !== null && metrics.daysRemaining <= 0,
      }
      const matches = filters.statuses.some((status) => {
        if (status === 'receivable') return statusChecks.receivable
        if (status === 'received') return statusChecks.received
        if (status === 'nearClose') return statusChecks.nearClose
        if (status === 'closing') return statusChecks.closing
        return false
      })
      if (!matches) return false
    }

    return true
  })

  const resetWithdrawForm = () => {
    setWithdrawForm({
      source: 'PROFIT',
      amount: '',
      date: new Date().toISOString().split('T')[0],
      notes: '',
    })
  }

  const resetSellForm = () => {
    setSellForm({
      buyerPersonId: '',
      amount: '',
      salePrice: '',
      date: new Date().toISOString().split('T')[0],
      notes: '',
    })
  }

  const openWithdrawModal = (investment: any) => {
    setActionError('')
    setWithdrawTarget(investment)
    resetWithdrawForm()
  }

  const openSellModal = async (investment: any) => {
    setActionError('')
    setSellTarget(investment)
    resetSellForm()
    if (partners.length === 0) {
      try {
        const res = await fetch('/api/partners')
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(data.error || 'Failed to load partners')
        }
        setPartners(Array.isArray(data.partners) ? data.partners : [])
      } catch (error) {
        console.error('Failed to load partners:', error)
        setActionError('Failed to load partners.')
      }
    }
  }

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!withdrawTarget) return
    if (actionLoading) return
    setActionError('')
    setActionLoading(true)
    try {
      if (!withdrawForm.amount) {
        setActionError('Amount is required')
        setActionLoading(false)
        return
      }
      const res = await fetch(`/api/sukuk/${withdrawTarget.id}/withdraw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: withdrawForm.source,
          amount: parseFloat(withdrawForm.amount),
          date: withdrawForm.date,
          notes: withdrawForm.notes,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setActionError(data.error || 'Failed to withdraw')
        return
      }
      setWithdrawTarget(null)
      router.refresh()
    } catch (error) {
      setActionError('Failed to withdraw')
    } finally {
      setActionLoading(false)
    }
  }

  const handleSell = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!sellTarget) return
    if (actionLoading) return
    setActionError('')
    setActionLoading(true)
    try {
      const res = await fetch(`/api/sukuk/${sellTarget.id}/sell`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buyerPersonId: sellForm.buyerPersonId,
          amount: parseFloat(sellForm.amount),
          salePrice: sellForm.salePrice ? parseFloat(sellForm.salePrice) : undefined,
          date: sellForm.date,
          notes: sellForm.notes,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setActionError(data.error || 'Failed to sell')
        return
      }
      setSellTarget(null)
      router.refresh()
    } catch (error) {
      setActionError('Failed to sell')
    } finally {
      setActionLoading(false)
    }
  }

  const handleRollback = async (investment: any) => {
    if (actionLoading) return
    setActionError('')
    const remainingPrincipal = Number(investment?.principalAmount ?? 0)
    if (!Number.isFinite(remainingPrincipal) || remainingPrincipal <= 0) {
      alert('No principal balance remaining to rollback.')
      return
    }
    const currencyLabel = investment?.account?.currency || 'SAR'
    const formatted = remainingPrincipal.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
    const confirmed = confirm(
      `Rollback will move remaining principal (${currencyLabel} ${formatted}) to cash and close this deal. Continue?`
    )
    if (!confirmed) return
    setActionLoading(true)
    try {
      const res = await fetch(`/api/sukuk/${investment.id}/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: new Date().toISOString().split('T')[0],
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(data.error || 'Failed to rollback')
        return
      }
      router.refresh()
    } catch (error) {
      alert('Failed to rollback')
    } finally {
      setActionLoading(false)
    }
  }

  const handleCreateSuccess = () => {
    setIsCreateModalOpen(false)
    router.refresh()
  }

  const handleEditSuccess = () => {
    setIsEditModalOpen(false)
    setEditingSukuk(null)
    router.refresh()
  }

  const handleEdit = (sukukItem: any) => {
    setEditingSukuk(sukukItem)
    setIsEditModalOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this Sukuk? This action cannot be undone.')) {
      return
    }

    setDeletingId(id)
    try {
      const res = await fetch(`/api/sukuk/${id}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'Failed to delete Sukuk')
        return
      }

      // Remove from local state
      setSukuk(list.filter((s) => s.id !== id))
      router.refresh()
    } catch (error) {
      alert('An error occurred while deleting the Sukuk')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">All Sukuk Deals</h2>
          <p className="text-sm text-gray-500 mt-1">
            {filteredSukuk.length} of {list.length} deals
          </p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">As of {asOfLabel}</span>
          {userRole === 'OWNER' && (
            <Button
              onClick={openCreateModal}
              variant="primary"
              size="lg"
            >
              + Add New Deal
            </Button>
          )}
        </div>
      </div>

      {isEmpty ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50/60 p-10 text-center">
          <div className="text-6xl mb-4">💼</div>
          <h3 className="text-2xl font-bold text-gray-900 mb-2">No Sukuk Investments Yet</h3>
          <p className="text-gray-500 text-lg mb-6">
            {userRole === 'OWNER'
              ? 'Start by creating your first Sukuk investment.'
              : 'Contact the owner to add you to Sukuk investments.'}
          </p>
          {userRole === 'OWNER' && (
            <Button onClick={openCreateModal} variant="primary" size="lg">
              + Add New Deal
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="mb-4 rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm font-semibold text-gray-700">Filters</div>
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Clear all
              </Button>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              <div>
                <div className="text-xs font-semibold text-gray-500 mb-2">Platforms</div>
                <div className="flex flex-wrap gap-2">
                  {Array.from(filterOptions.platforms).map((platform) => (
                    <label key={platform} className="flex items-center gap-1 text-xs text-gray-600">
                      <input
                        type="checkbox"
                        checked={filters.platforms.includes(platform)}
                        onChange={() => toggleFilter('platforms', platform)}
                        className="h-3 w-3 rounded border-gray-300 text-blue-600"
                      />
                      {platform}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-500 mb-2">Term</div>
                <div className="flex flex-wrap gap-2">
                  {['short', 'long'].map((term) => (
                    <label key={term} className="flex items-center gap-1 text-xs text-gray-600 capitalize">
                      <input
                        type="checkbox"
                        checked={filters.terms.includes(term)}
                        onChange={() => toggleFilter('terms', term)}
                        className="h-3 w-3 rounded border-gray-300 text-blue-600"
                      />
                      {term} term
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-500 mb-2">Status</div>
                <div className="flex flex-wrap gap-2">
                  {[
                    { key: 'receivable', label: 'Receivable' },
                    { key: 'received', label: 'Received' },
                    { key: 'nearClose', label: 'Near Close' },
                    { key: 'closing', label: 'Closing' },
                  ].map((status) => (
                    <label key={status.key} className="flex items-center gap-1 text-xs text-gray-600">
                      <input
                        type="checkbox"
                        checked={filters.statuses.includes(status.key)}
                        onChange={() => toggleFilter('statuses', status.key)}
                        className="h-3 w-3 rounded border-gray-300 text-blue-600"
                      />
                      {status.label}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-500 mb-2">Year</div>
                <div className="flex flex-wrap gap-2">
                  {Array.from(filterOptions.years).sort().map((year) => (
                    <label key={year} className="flex items-center gap-1 text-xs text-gray-600">
                      <input
                        type="checkbox"
                        checked={filters.years.includes(year)}
                        onChange={() => toggleFilter('years', year)}
                        className="h-3 w-3 rounded border-gray-300 text-blue-600"
                      />
                      {year}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-500 mb-2">Month</div>
                <div className="flex flex-wrap gap-2">
                  {Array.from(filterOptions.months)
                    .sort((a, b) => Number(a) - Number(b))
                    .map((month) => (
                      <label key={month} className="flex items-center gap-1 text-xs text-gray-600">
                        <input
                          type="checkbox"
                          checked={filters.months.includes(month)}
                          onChange={() => toggleFilter('months', month)}
                          className="h-3 w-3 rounded border-gray-300 text-blue-600"
                        />
                        {month}
                      </label>
                    ))}
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-500 mb-2">Day</div>
                <div className="flex flex-wrap gap-2">
                  {Array.from(filterOptions.days)
                    .sort((a, b) => Number(a) - Number(b))
                    .map((dayValue) => (
                      <label key={dayValue} className="flex items-center gap-1 text-xs text-gray-600">
                        <input
                          type="checkbox"
                          checked={filters.days.includes(dayValue)}
                          onChange={() => toggleFilter('days', dayValue)}
                          className="h-3 w-3 rounded border-gray-300 text-blue-600"
                        />
                        {dayValue}
                      </label>
                    ))}
                </div>
              </div>
            </div>
          </div>
          {filteredSukuk.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-600">
              No deals match the selected filters.
            </div>
          ) : (
            <Table className="text-[11px]">
              <TableHeader>
            <TableRow>
              <TableHead className="px-2 py-2 text-[11px]">Company</TableHead>
              <TableHead className="px-2 py-2 text-[11px]">Total Investment</TableHead>
              <TableHead className="px-2 py-2 text-[11px]">APR Yearly</TableHead>
              <TableHead className="px-2 py-2 text-[11px]">APR After Fees</TableHead>
              <TableHead className="px-2 py-2 text-[11px]">Investment Period</TableHead>
              <TableHead className="px-2 py-2 text-[11px]">Maturity Date</TableHead>
              <TableHead className="px-2 py-2 text-[11px]">Days Remaining</TableHead>
              <TableHead className="px-2 py-2 text-[11px]">Fees</TableHead>
              <TableHead className="px-2 py-2 text-[11px]">Net Profit</TableHead>
              <TableHead className="px-2 py-2 text-[11px]">Total Received</TableHead>
              <TableHead className="px-2 py-2 text-[11px]">Receivable</TableHead>
              <TableHead className="px-2 py-2 text-[11px]">Status</TableHead>
              {userRole === 'OWNER' && <TableHead className="px-2 py-2 text-[11px]">Actions</TableHead>}
            </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSukuk.map((inv: any) => {
                  const metrics = getMetrics(inv)

                  return (
                    <TableRow key={inv.id} className="hover:bg-blue-50 transition-colors duration-150">
                  <TableCell className="px-2 py-2 font-semibold text-gray-900">
                    <button
                      type="button"
                      onClick={() => setDetailTarget(inv)}
                      className="text-left hover:text-blue-600 transition-colors"
                    >
                      {inv.name}
                    </button>
                  </TableCell>
                  <TableCell className="px-2 py-2 text-gray-700 tabular-nums">
                    {formatCurrency(metrics.totalInvestment, metrics.currency)}
                  </TableCell>
                  <TableCell className="px-2 py-2 text-gray-700 tabular-nums">
                    {formatPercent(metrics.apr)}
                  </TableCell>
                  <TableCell className="px-2 py-2 text-gray-700 tabular-nums">
                    {formatPercent(metrics.aprAfterFees)}
                  </TableCell>
                  <TableCell className="px-2 py-2 text-gray-700 tabular-nums">
                    {metrics.periodMonths === null ? '—' : metrics.periodMonths.toFixed(1)}
                  </TableCell>
                  <TableCell className="px-2 py-2 text-gray-700 tabular-nums">
                    {formatDate(inv.maturityDate)}
                  </TableCell>
                  <TableCell className="px-2 py-2 text-gray-700 tabular-nums">
                    {metrics.daysRemaining === null ? (
                      '—'
                    ) : metrics.paymentStatus === 'delayed' ? (
                      <span className="text-red-600 font-semibold">
                        Delayed {Math.abs(metrics.daysRemaining)}d
                      </span>
                    ) : metrics.paymentStatus === 'early' ? (
                      <span className="text-emerald-600 font-semibold">
                        Early {metrics.daysRemaining}d
                      </span>
                    ) : (
                      metrics.daysRemaining
                    )}
                  </TableCell>
                  <TableCell className="px-2 py-2 text-gray-700 tabular-nums">
                    {formatCurrency(metrics.fees, metrics.currency)}
                  </TableCell>
                  <TableCell className="px-2 py-2 text-gray-700 tabular-nums">
                    {formatCurrency(metrics.netProfit, metrics.currency)}
                  </TableCell>
                  <TableCell className="px-2 py-2 text-gray-700 tabular-nums">
                    {formatCurrency(metrics.totalReceived, metrics.currency)}
                  </TableCell>
                  <TableCell className="px-2 py-2 text-gray-700 tabular-nums">
                    {formatCurrency(metrics.receivable, metrics.currency)}
                  </TableCell>
                  <TableCell className="px-2 py-2">
                    <span className={`px-2 py-1 inline-flex items-center text-[10px] leading-4 font-semibold rounded-full shadow-sm ${metrics.progress.className}`}>
                      <span className="w-2 h-2 bg-current rounded-full mr-2 opacity-70"></span>
                      {metrics.paymentStatus === 'delayed' ? 'Delayed ' : metrics.paymentStatus === 'early' ? 'Early ' : ''}
                      {metrics.progress.percent.toFixed(2)}%
                    </span>
                  </TableCell>
                      {userRole === 'OWNER' && (
                        <TableCell className="px-2 py-2">
                          <div className="flex flex-wrap items-center gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleEdit(inv)}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openWithdrawModal(inv)}
                          disabled={actionLoading}
                        >
                          Withdraw
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleRollback(inv)}
                          disabled={actionLoading}
                        >
                          Rollback
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openSellModal(inv)}
                          disabled={actionLoading}
                        >
                          Sell
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => handleDelete(inv.id)}
                          disabled={deletingId === inv.id}
                        >
                          {deletingId === inv.id ? 'Deleting...' : 'Delete'}
                        </Button>
                      </div>
                        </TableCell>
                      )}
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </>
      )}

      {/* Create Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Create New Sukuk"
      >
        <SukukForm
          mode="create"
          onSuccess={handleCreateSuccess}
          onCancel={() => setIsCreateModalOpen(false)}
        />
      </Modal>

      {/* Edit Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false)
          setEditingSukuk(null)
        }}
        title="Edit Sukuk"
      >
        {editingSukuk && (
          <SukukForm
            mode="edit"
            initialData={editingSukuk}
            onSuccess={handleEditSuccess}
            onCancel={() => {
              setIsEditModalOpen(false)
              setEditingSukuk(null)
            }}
          />
        )}
      </Modal>

      <Modal
        isOpen={Boolean(detailTarget)}
        onClose={() => setDetailTarget(null)}
        title="Sukuk Details"
      >
        {detailTarget && (() => {
          const metrics = getMetrics(detailTarget)
          return (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-gray-500">Company</p>
                  <p className="font-semibold text-gray-900">{detailTarget.name}</p>
                </div>
                <div>
                  <p className="text-gray-500">Platform</p>
                  <p className="font-semibold text-gray-900">{detailTarget.account?.name || '—'}</p>
                </div>
                <div>
                  <p className="text-gray-500">Type</p>
                  <p className="font-semibold text-gray-900">{detailTarget.category || '—'}</p>
                </div>
                <div>
                  <p className="text-gray-500">Total Investment</p>
                  <p className="font-semibold text-gray-900">
                    {formatCurrency(metrics.totalInvestment, metrics.currency)}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">APR</p>
                  <p className="font-semibold text-gray-900">{formatPercent(metrics.apr)}</p>
                </div>
                <div>
                  <p className="text-gray-500">APR After Fees</p>
                  <p className="font-semibold text-gray-900">{formatPercent(metrics.aprAfterFees)}</p>
                </div>
                <div>
                  <p className="text-gray-500">Start Date</p>
                  <p className="font-semibold text-gray-900">{formatDate(detailTarget.startDate)}</p>
                </div>
                <div>
                  <p className="text-gray-500">Maturity Date</p>
                  <p className="font-semibold text-gray-900">{formatDate(detailTarget.maturityDate)}</p>
                </div>
                <div>
                  <p className="text-gray-500">Investment Period (months)</p>
                  <p className="font-semibold text-gray-900">
                    {metrics.periodMonths === null ? '—' : metrics.periodMonths.toFixed(1)}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">Maturity Days Remaining</p>
                  <p className="font-semibold text-gray-900">
                    {metrics.daysRemaining === null
                      ? '—'
                      : metrics.paymentStatus === 'delayed'
                        ? `Delayed ${Math.abs(metrics.daysRemaining)}d`
                        : metrics.paymentStatus === 'early'
                          ? `Early ${metrics.daysRemaining}d`
                          : metrics.daysRemaining}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">Fees</p>
                  <p className="font-semibold text-gray-900">
                    {formatCurrency(metrics.fees, metrics.currency)}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">Net Profit</p>
                  <p className="font-semibold text-gray-900">
                    {formatCurrency(metrics.netProfit, metrics.currency)}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">Total Received</p>
                  <p className="font-semibold text-gray-900">
                    {formatCurrency(metrics.totalReceived, metrics.currency)}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">Receivable</p>
                  <p className="font-semibold text-gray-900">
                    {formatCurrency(metrics.receivable, metrics.currency)}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">Status %</p>
                  <p className="font-semibold text-gray-900">
                    {(metrics.paymentStatus === 'delayed' ? 'Delayed ' : metrics.paymentStatus === 'early' ? 'Early ' : '')}
                    {metrics.progress.percent.toFixed(2)}%
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">Payment Timing</p>
                  <p className="font-semibold text-gray-900 capitalize">
                    {metrics.paymentStatus.replace('-', ' ')}
                  </p>
                </div>
              </div>
            </div>
          )
        })()}
      </Modal>

      <Modal
        isOpen={Boolean(withdrawTarget)}
        onClose={() => setWithdrawTarget(null)}
        title="Withdraw Cash"
      >
        <form onSubmit={handleWithdraw} className="space-y-4">
          {actionError && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 border border-red-200">
              {actionError}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Source
            </label>
            <select
              value={withdrawForm.source}
              onChange={(e) => setWithdrawForm((prev) => ({ ...prev, source: e.target.value }))}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="PROFIT">Profit</option>
              <option value="PRINCIPAL">Principal</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Amount
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={withdrawForm.amount}
              onChange={(e) => setWithdrawForm((prev) => ({ ...prev, amount: e.target.value }))}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Date
            </label>
            <input
              type="date"
              value={withdrawForm.date}
              onChange={(e) => setWithdrawForm((prev) => ({ ...prev, date: e.target.value }))}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <textarea
              rows={2}
              value={withdrawForm.notes}
              onChange={(e) => setWithdrawForm((prev) => ({ ...prev, notes: e.target.value }))}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setWithdrawTarget(null)} disabled={actionLoading}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={actionLoading}>
              {actionLoading ? 'Processing...' : 'Withdraw'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={Boolean(sellTarget)}
        onClose={() => setSellTarget(null)}
        title="Sell Sukuk to Partner"
      >
        <form onSubmit={handleSell} className="space-y-4">
          {actionError && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 border border-red-200">
              {actionError}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Partner
            </label>
            <select
              value={sellForm.buyerPersonId}
              onChange={(e) => setSellForm((prev) => ({ ...prev, buyerPersonId: e.target.value }))}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            >
              <option value="">Select partner</option>
              {partners.map((partner) => (
                <option key={partner.id} value={partner.id}>
                  {partner.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Principal Amount to Transfer
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={sellForm.amount}
              onChange={(e) => setSellForm((prev) => ({ ...prev, amount: e.target.value }))}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Sale Price (Cash Received)
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={sellForm.salePrice}
              onChange={(e) => setSellForm((prev) => ({ ...prev, salePrice: e.target.value }))}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Defaults to amount"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Date
            </label>
            <input
              type="date"
              value={sellForm.date}
              onChange={(e) => setSellForm((prev) => ({ ...prev, date: e.target.value }))}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <textarea
              rows={2}
              value={sellForm.notes}
              onChange={(e) => setSellForm((prev) => ({ ...prev, notes: e.target.value }))}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setSellTarget(null)} disabled={actionLoading}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={actionLoading}>
              {actionLoading ? 'Processing...' : 'Sell'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  )
}
