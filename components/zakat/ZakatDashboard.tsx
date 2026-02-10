'use client'

import { useState, useMemo } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/sukuk/SukukModal'
import { DateInput } from '@/components/ui/DateInput'
import { formatDateInput, toIsoDateInput } from '@/lib/date'

type ReceiptEntry = {
  date: string
  amount: number
  type: string
  investmentName?: string | null
}

type BucketRow = {
  id: string
  label?: string | null
  currency: string
  balance: number
  haulStartDate: string
  lastZakatPaidDate?: string | null
  haulCompleteDate: string
  idleBase: number
  receiptsTotal: number
  zakatDue: number
  haulCompleted: boolean
  source: string
  sourceGroup: string
  sourceType: string
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
type DueFilter = 'all' | 'due' | 'none'

function SortArrow({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <span className="inline-flex flex-col ml-1 -space-y-1 text-[10px] leading-none">
      <span className={active && dir === 'asc' ? 'text-emerald-600' : 'text-gray-300'}>&#9650;</span>
      <span className={active && dir === 'desc' ? 'text-emerald-600' : 'text-gray-300'}>&#9660;</span>
    </span>
  )
}

export function ZakatDashboard({ buckets }: { buckets: BucketRow[] }) {
  const router = useRouter()

  // --- Tab state ---
  const [activeTab, setActiveTab] = useState('all')

  // --- Sort state ---
  const [sortKey, setSortKey] = useState<SortKey>('zakatDue')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  // --- Filter state ---
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [dueFilter, setDueFilter] = useState<DueFilter>('all')

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

  // --- Derived data ---
  const sourceGroups = useMemo(() => {
    const set = new Set(buckets.map(b => b.sourceGroup))
    return Array.from(set).sort()
  }, [buckets])

  const filteredBuckets = useMemo(() => {
    let list = buckets
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
  }, [buckets, activeTab, statusFilter, dueFilter, sortKey, sortDir])

  const totalDue = filteredBuckets.reduce((sum, b) => sum + b.zakatDue, 0)
  const totalBalance = filteredBuckets.reduce((sum, b) => sum + b.balance, 0)

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const openPay = (bucket: BucketRow) => {
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
    setPayLoading(true)
    setPayError('')
    try {
      const res = await fetch('/api/zakat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bucketId: payTarget.id,
          amount,
          date: isoDate,
          notes: payNotes,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || 'Failed to pay zakat')
      }
      setPayTarget(null)
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
          bucketId: bucket.id,
          movementId: bucket.lastPayment.id,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || 'Failed to rollback zakat')
      }
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
      const res = await fetch(`/api/zakat/buckets/${bucket.id}`)
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

  const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <div className="space-y-4">
      {/* Summary row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="py-3 px-4">
            <div className="text-xs text-gray-500">Total Zakat Due</div>
            <div className="text-lg font-bold text-emerald-700">SAR {fmt(totalDue)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-4">
            <div className="text-xs text-gray-500">Total Balance</div>
            <div className="text-lg font-bold text-gray-900">SAR {fmt(totalBalance)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-4">
            <div className="text-xs text-gray-500">Buckets</div>
            <div className="text-lg font-bold text-gray-900">{filteredBuckets.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-4">
            <div className="text-xs text-gray-500">Sources</div>
            <div className="text-lg font-bold text-gray-900">{sourceGroups.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Source Filter */}
      <div className="flex items-center gap-3">
        <label className="text-xs font-medium text-gray-500">Source:</label>
        <select
          value={activeTab}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => setActiveTab(e.target.value)}
          className="rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-700 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none max-w-[300px]"
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
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            Clear
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <div className="flex items-center gap-1.5">
          <span className="text-gray-500 font-medium">Status:</span>
          {(['all', 'completed', 'pending'] as StatusFilter[]).map(f => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-2 py-0.5 rounded text-xs font-medium ${
                statusFilter === f
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f === 'all' ? 'All' : f === 'completed' ? 'Haul Complete' : 'Pending'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-gray-500 font-medium">Zakat:</span>
          {(['all', 'due', 'none'] as DueFilter[]).map(f => (
            <button
              key={f}
              onClick={() => setDueFilter(f)}
              className={`px-2 py-0.5 rounded text-xs font-medium ${
                dueFilter === f
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f === 'all' ? 'All' : f === 'due' ? 'Has Due' : 'No Due'}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {filteredBuckets.length === 0 ? (
            <div className="p-6 text-sm text-gray-500 text-center">No buckets match your filters.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs text-gray-500 border-b border-gray-200">
                    <th className="py-2.5 px-3 font-medium cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort('label')}>
                      Bucket <SortArrow active={sortKey === 'label'} dir={sortDir} />
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
                <tbody className="divide-y divide-gray-100">
                  {(() => {
                    // Group buckets: Circlys groups are collapsible, others show directly
                    const groups = new Map<string, BucketRow[]>()
                    const singles: BucketRow[] = []
                    filteredBuckets.forEach(b => {
                      if (b.sourceGroup !== b.source) {
                        // This is a grouped Circlys bucket
                        const existing = groups.get(b.sourceGroup) || []
                        existing.push(b)
                        groups.set(b.sourceGroup, existing)
                      } else {
                        singles.push(b)
                      }
                    })

                    const rows: React.ReactNode[] = []

                    // Render grouped Circlys rows
                    groups.forEach((groupBuckets, groupName) => {
                      const isExpanded = expandedGroups.has(groupName)
                      const gBalance = groupBuckets.reduce((s, b) => s + b.balance, 0)
                      const gIdle = groupBuckets.reduce((s, b) => s + b.idleBase, 0)
                      const gReceipts = groupBuckets.reduce((s, b) => s + b.receiptsTotal, 0)
                      const gZakat = groupBuckets.reduce((s, b) => s + b.zakatDue, 0)
                      const allComplete = groupBuckets.every(b => b.haulCompleted)
                      const someComplete = groupBuckets.some(b => b.haulCompleted)
                      const cur = groupBuckets[0]?.currency || 'SAR'

                      rows.push(
                        <tr
                          key={`group-${groupName}`}
                          className="bg-slate-50 hover:bg-slate-100 cursor-pointer transition-colors"
                          onClick={() => toggleGroup(groupName)}
                        >
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-2">
                              <span className="text-gray-400 text-xs">{isExpanded ? '▾' : '▸'}</span>
                              <div>
                                <div className="font-semibold text-gray-900">{groupName}</div>
                                <div className="text-[11px] text-gray-400">{groupBuckets.length} payment{groupBuckets.length !== 1 ? 's' : ''}</div>
                              </div>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-gray-400 text-xs whitespace-nowrap">—</td>
                          <td className="py-2.5 px-3 text-gray-400 text-xs whitespace-nowrap">—</td>
                          <td className="py-2.5 px-3 text-right font-medium text-gray-900 whitespace-nowrap">{cur} {fmt(gBalance)}</td>
                          <td className="py-2.5 px-3 text-right text-gray-700 whitespace-nowrap">{cur} {fmt(gIdle)}</td>
                          <td className="py-2.5 px-3 text-right text-gray-700 whitespace-nowrap">{cur} {fmt(gReceipts)}</td>
                          <td className="py-2.5 px-3 text-right font-semibold whitespace-nowrap">
                            <span className={gZakat > 0 ? 'text-emerald-700' : 'text-gray-400'}>
                              {cur} {fmt(gZakat)}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${
                              allComplete
                                ? 'bg-green-50 text-green-700'
                                : someComplete
                                ? 'bg-blue-50 text-blue-700'
                                : 'bg-amber-50 text-amber-700'
                            }`}>
                              {allComplete ? 'Complete' : someComplete ? 'Partial' : 'Pending'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3"></td>
                        </tr>
                      )

                      // Expanded child rows
                      if (isExpanded) {
                        groupBuckets.forEach(bucket => {
                          // Extract month label (last part after •)
                          const monthLabel = bucket.label?.split(' • ').slice(2).join(' • ') || bucket.label || ''
                          rows.push(
                            <tr key={bucket.id} className="hover:bg-gray-50 transition-colors bg-white">
                              <td className="py-2 px-3 pl-10">
                                <div className="text-sm text-gray-700" title={bucket.label || ''}>
                                  {monthLabel || bucket.id.slice(0, 8)}
                                </div>
                              </td>
                              <td className="py-2 px-3 text-gray-600 text-xs whitespace-nowrap">{bucket.haulStartDate}</td>
                              <td className="py-2 px-3 text-gray-600 text-xs whitespace-nowrap">{bucket.haulCompleteDate}</td>
                              <td className="py-2 px-3 text-right text-sm text-gray-900 whitespace-nowrap">{bucket.currency} {fmt(bucket.balance)}</td>
                              <td className="py-2 px-3 text-right text-sm text-gray-700 whitespace-nowrap">{bucket.currency} {fmt(bucket.idleBase)}</td>
                              <td className="py-2 px-3 text-right text-sm text-gray-700 whitespace-nowrap">{bucket.currency} {fmt(bucket.receiptsTotal)}</td>
                              <td className="py-2 px-3 text-right text-sm font-semibold whitespace-nowrap">
                                <span className={bucket.zakatDue > 0 ? 'text-emerald-700' : 'text-gray-400'}>
                                  {bucket.currency} {fmt(bucket.zakatDue)}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-center">
                                <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${
                                  bucket.haulCompleted ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'
                                }`}>
                                  {bucket.haulCompleted ? 'Complete' : 'Pending'}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <Button size="sm" variant="secondary" onClick={() => openDetails(bucket)}>Details</Button>
                                  <Button size="sm" variant="primary" disabled={bucket.zakatDue <= 0} onClick={() => openPay(bucket)}>Pay</Button>
                                  {bucket.lastPayment && (
                                    <Button size="sm" variant="ghost" disabled={rollbackLoading} onClick={() => handleRollback(bucket)}>Undo</Button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )
                        })
                      }
                    })

                    // Render non-grouped (single) rows
                    singles.forEach(bucket => {
                      rows.push(
                        <tr key={bucket.id} className="hover:bg-gray-50 transition-colors">
                          <td className="py-2.5 px-3">
                            <div className="font-medium text-gray-900 truncate max-w-[200px]" title={bucket.label || bucket.source}>
                              {bucket.label || bucket.source}
                            </div>
                            {activeTab === 'all' && (
                              <div className="text-[11px] text-gray-400 truncate max-w-[200px]">{bucket.source}</div>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-gray-600 whitespace-nowrap">{bucket.haulStartDate}</td>
                          <td className="py-2.5 px-3 text-gray-600 whitespace-nowrap">{bucket.haulCompleteDate}</td>
                          <td className="py-2.5 px-3 text-right font-medium text-gray-900 whitespace-nowrap">{bucket.currency} {fmt(bucket.balance)}</td>
                          <td className="py-2.5 px-3 text-right text-gray-700 whitespace-nowrap">{bucket.currency} {fmt(bucket.idleBase)}</td>
                          <td className="py-2.5 px-3 text-right text-gray-700 whitespace-nowrap">{bucket.currency} {fmt(bucket.receiptsTotal)}</td>
                          <td className="py-2.5 px-3 text-right font-semibold whitespace-nowrap">
                            <span className={bucket.zakatDue > 0 ? 'text-emerald-700' : 'text-gray-400'}>
                              {bucket.currency} {fmt(bucket.zakatDue)}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${
                              bucket.haulCompleted
                                ? 'bg-green-50 text-green-700'
                                : 'bg-amber-50 text-amber-700'
                            }`}>
                              {bucket.haulCompleted ? 'Complete' : 'Pending'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button size="sm" variant="secondary" onClick={() => openDetails(bucket)}>Details</Button>
                              <Button size="sm" variant="primary" disabled={bucket.zakatDue <= 0} onClick={() => openPay(bucket)}>Pay</Button>
                              {bucket.lastPayment && (
                                <Button size="sm" variant="ghost" disabled={rollbackLoading} onClick={() => handleRollback(bucket)}>Undo</Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })

                    return rows
                  })()}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 border-t border-gray-200">
                    <td colSpan={3} className="py-2.5 px-3 text-xs font-semibold text-gray-500">Total</td>
                    <td className="py-2.5 px-3 text-right font-bold text-gray-900 whitespace-nowrap">
                      SAR {fmt(totalBalance)}
                    </td>
                    <td className="py-2.5 px-3"></td>
                    <td className="py-2.5 px-3"></td>
                    <td className="py-2.5 px-3 text-right font-bold text-emerald-700 whitespace-nowrap">
                      SAR {fmt(totalDue)}
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

      {rollbackError && (
        <div className="text-xs text-red-600 px-1">{rollbackError}</div>
      )}

      <Modal
        isOpen={Boolean(detailsTarget)}
        onClose={closeDetails}
        title={detailsTarget ? `Bucket Details • ${detailsTarget.label ? detailsTarget.label : detailsTarget.id.slice(0, 8)}` : 'Bucket Details'}
      >
        {detailsError && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 border border-red-200 mb-4">
            {detailsError}
          </div>
        )}

        {detailsLoading && (
          <div className="text-sm text-gray-500">Loading bucket details...</div>
        )}

        {!detailsLoading && detailsTarget && (
          <div className="space-y-6">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="text-sm font-semibold text-gray-900">How this bucket’s zakat is calculated</div>
              <div className="text-sm text-gray-700 mt-2">
                Zakat is calculated as 2.5% of:
              </div>
              <div className="mt-2 text-sm text-gray-700 space-y-1">
                <div>
                  Idle cash held through haul completion ({detailsTarget.haulStartDate} → {detailsTarget.haulCompleteDate}):
                  <span className="font-semibold"> {detailsTarget.currency} {detailsTarget.idleBase.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div>
                  + Receipts after haul completion:
                  <span className="font-semibold"> {detailsTarget.currency} {detailsTarget.receiptsTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div>
                  = Zakat due:
                  <span className="font-semibold text-emerald-700"> {detailsTarget.currency} {detailsTarget.zakatDue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="rounded-lg border border-gray-200 p-4">
                <div className="text-sm font-semibold text-gray-900 mb-2">Bucket movements / logs</div>
                {detailsData?.bucket?.movements?.length ? (
                  <div className="overflow-auto max-h-80">
                    <table className="min-w-full text-sm">
                      <thead className="sticky top-0 bg-white">
                        <tr className="text-left text-xs text-gray-500 border-b">
                          <th className="py-2 pr-3">Date</th>
                          <th className="py-2 pr-3">Type</th>
                          <th className="py-2 pr-3">Investment</th>
                          <th className="py-2 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {detailsData.bucket.movements.map((m: any) => (
                          <tr key={m.id} className="text-gray-700">
                            <td className="py-2 pr-3 whitespace-nowrap">
                              {new Date(m.date).toISOString().split('T')[0]}
                            </td>
                            <td className="py-2 pr-3 whitespace-nowrap">{m.type}</td>
                            <td className="py-2 pr-3 truncate max-w-[220px]">
                              {m.investment?.name ? m.investment.name : '-'}
                            </td>
                            <td className={`py-2 text-right whitespace-nowrap ${m.amount < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                              {detailsTarget.currency}{' '}
                              {Math.abs(m.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-sm text-gray-500">No movements found.</div>
                )}
              </div>

              <div className="rounded-lg border border-gray-200 p-4">
                <div className="text-sm font-semibold text-gray-900 mb-2">Related transactions</div>
                {detailsData?.transactions?.length ? (
                  <div className="overflow-auto max-h-80">
                    <table className="min-w-full text-sm">
                      <thead className="sticky top-0 bg-white">
                        <tr className="text-left text-xs text-gray-500 border-b">
                          <th className="py-2 pr-3">Date</th>
                          <th className="py-2 pr-3">Type</th>
                          <th className="py-2 pr-3">Description</th>
                          <th className="py-2 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {detailsData.transactions.map((t: any) => (
                          <tr key={t.id} className="text-gray-700">
                            <td className="py-2 pr-3 whitespace-nowrap">
                              {new Date(t.date).toISOString().split('T')[0]}
                            </td>
                            <td className="py-2 pr-3 whitespace-nowrap">{t.type}</td>
                            <td className="py-2 pr-3 truncate max-w-[260px]">
                              {t.description || '-'}
                            </td>
                            <td className={`py-2 text-right whitespace-nowrap ${t.amount < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                              {detailsTarget.currency}{' '}
                              {Math.abs(t.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-sm text-gray-500">No related transactions found.</div>
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
            <div className="text-sm text-gray-600">
              Bucket {payTarget.id.slice(0, 8)} • Due {payTarget.currency} {payTarget.zakatDue.toFixed(2)}
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
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
            placeholder="Amount"
          />
          <input
            type="text"
            value={payNotes}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setPayNotes(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
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
