'use client'

import { useState, useMemo } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/sukuk/SukukModal'
import { DateInput } from '@/components/ui/DateInput'
import { formatDateInput, toIsoDateInput, formatGregorianAndHijriDate } from '@/lib/date'
import { 
  ZakatCalculationResult, 
  InvestmentRecord, 
  SukukType,
  diffHijriDays,
  hasCompletedHijriYear 
} from '@/lib/zakat'

interface ZakatInvestmentRow {
  investment_id: string
  investment_name: string
  sukuk_type: SukukType
  principal_amount: number
  hawl_start_date: Date
  hawl_completed: boolean
  days_held: number
  zakat_amount: number
  reason: string
  distributions_count: number
  total_distributions: number
  status: 'EXEMPT' | 'PENDING' | 'DUE' | 'PAID'
  last_payment?: {
    id: string
    date: string
    amount: number
  }
}

interface RuleBasedZakatDashboardProps {
  investments: ZakatInvestmentRow[]
  calculationResult: ZakatCalculationResult
  nisabValue: number
  totalZakatableWealth: number
  userZakatAnnualDate: Date
  zakatEnabled: boolean
}

type SortKey = 'investment_name' | 'sukuk_type' | 'principal_amount' | 'days_held' | 'zakat_amount' | 'hawl_start_date'
type SortDir = 'asc' | 'desc'
type StatusFilter = 'all' | 'due' | 'exempt' | 'pending' | 'paid'
type SukukFilter = 'all' | 'MURABAHA' | 'IJARAH'

function SortArrow({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <span className="inline-flex flex-col ml-1 -space-y-1 text-[10px] leading-none">
      <span className={active && dir === 'asc' ? 'text-emerald-600' : 'text-gray-300'}>&#9650;</span>
      <span className={active && dir === 'desc' ? 'text-emerald-600' : 'text-gray-300'}>&#9660;</span>
    </span>
  )
}

function RuleExplanationCard({ rules }: { rules: string[] }) {
  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-lg">Zakat Calculation Rules Applied</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {rules.map((rule, index) => (
            <div key={index} className="text-sm p-2 bg-blue-50 rounded border-l-4 border-blue-400">
              {rule}
            </div>
          ))}
        </div>
        <div className="mt-4 p-3 bg-gray-50 rounded text-xs text-gray-600">
          <strong>Key Principles:</strong>
          <ul className="mt-1 space-y-1 list-disc list-inside">
            <li>Zakat is only calculated on Murabaha sukuk (Ijarah = 0)</li>
            <li>Investment must be held for at least 354 days (1 Hijri year)</li>
            <li>Zakat rate is always 2.5% on distributed cash amounts</li>
            <li>Hawl starts from the earlier of funds ownership or investment date</li>
            <li>Only actual cash receipts trigger Zakat, not paper/accrued amounts</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}

export function RuleBasedZakatDashboard({
  investments,
  calculationResult,
  nisabValue,
  totalZakatableWealth,
  userZakatAnnualDate,
  zakatEnabled
}: RuleBasedZakatDashboardProps) {
  const router = useRouter()

  // Sort and filter state
  const [sortKey, setSortKey] = useState<SortKey>('zakat_amount')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sukukFilter, setSukukFilter] = useState<SukukFilter>('all')

  // Payment modal state
  const [payTarget, setPayTarget] = useState<ZakatInvestmentRow | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [payDate, setPayDate] = useState(formatDateInput(new Date()))
  const [payNotes, setPayNotes] = useState('')
  const [payError, setPayError] = useState('')
  const [payLoading, setPayLoading] = useState(false)

  // Details modal state
  const [detailsTarget, setDetailsTarget] = useState<ZakatInvestmentRow | null>(null)

  const filteredInvestments = useMemo(() => {
    let list = investments

    // Apply filters
    if (statusFilter !== 'all') {
      list = list.filter(inv => inv.status.toLowerCase() === statusFilter)
    }
    if (sukukFilter !== 'all') {
      list = list.filter(inv => inv.sukuk_type === sukukFilter)
    }

    // Sort
    const sorted = [...list].sort((a, b) => {
      let va: number | string = 0
      let vb: number | string = 0

      if (sortKey === 'investment_name') {
        va = a.investment_name.toLowerCase()
        vb = b.investment_name.toLowerCase()
      } else if (sortKey === 'sukuk_type') {
        va = a.sukuk_type
        vb = b.sukuk_type
      } else if (sortKey === 'hawl_start_date') {
        va = a.hawl_start_date.getTime()
        vb = b.hawl_start_date.getTime()
      } else {
        va = a[sortKey]
        vb = b[sortKey]
      }

      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })

    return sorted
  }, [investments, statusFilter, sukukFilter, sortKey, sortDir])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const openPay = (investment: ZakatInvestmentRow) => {
    if (!zakatEnabled || investment.zakat_amount <= 0) return
    setPayTarget(investment)
    setPayAmount(investment.zakat_amount.toFixed(2))
    setPayDate(formatDateInput(new Date()))
    setPayNotes(`Zakat payment for ${investment.investment_name}`)
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
      const res = await fetch('/api/zakat/investment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          investmentId: payTarget.investment_id,
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

  const openDetails = (investment: ZakatInvestmentRow) => {
    setDetailsTarget(investment)
  }

  const closeDetails = () => {
    setDetailsTarget(null)
  }

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      EXEMPT: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Exempt' },
      PENDING: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Pending' },
      DUE: { bg: 'bg-red-100', text: 'text-red-700', label: 'Due' },
      PAID: { bg: 'bg-green-100', text: 'text-green-700', label: 'Paid' }
    }
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.EXEMPT
    return (
      <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${config.bg} ${config.text}`}>
        {config.label}
      </span>
    )
  }

  const getSukukTypeBadge = (type: SukukType) => {
    return (
      <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-medium ${
        type === 'MURABAHA' 
          ? 'bg-blue-100 text-blue-700' 
          : 'bg-orange-100 text-orange-700'
      }`}>
        {type}
      </span>
    )
  }

  const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const totalDue = filteredInvestments.reduce((sum, inv) => sum + inv.zakat_amount, 0)
  const totalPrincipal = filteredInvestments.reduce((sum, inv) => sum + inv.principal_amount, 0)
  const dueCount = filteredInvestments.filter(inv => inv.zakat_amount > 0).length
  const exemptCount = filteredInvestments.filter(inv => inv.status === 'EXEMPT').length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-xl shadow-md p-6 text-white">
        <h1 className="text-2xl font-bold">Rule-Based Zakat Dashboard</h1>
        <p className="text-sm text-slate-400 mt-1">
          Comprehensive Zakat calculation based on 16 Islamic finance rules
        </p>
      </div>

      {/* Nisab Status */}
      {!zakatEnabled && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="font-semibold">Below Nisab Threshold</div>
          <div className="mt-1">
            Total zakatable wealth: SAR {totalZakatableWealth.toLocaleString()} • 
            Nisab threshold: SAR {nisabValue.toLocaleString()}
          </div>
        </div>
      )}

      {/* Rules Applied */}
      <RuleExplanationCard rules={calculationResult.rules_applied} />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="py-4 px-4">
            <div className="text-xs text-gray-500">Total Zakat Due</div>
            <div className="text-xl font-bold text-emerald-700">SAR {fmt(calculationResult.total_zakat_due)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 px-4">
            <div className="text-xs text-gray-500">Investments</div>
            <div className="text-xl font-bold text-gray-900">{filteredInvestments.length}</div>
            <div className="text-xs text-gray-500">{dueCount} with Zakat due</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 px-4">
            <div className="text-xs text-gray-500">Total Principal</div>
            <div className="text-xl font-bold text-gray-900">SAR {fmt(totalPrincipal)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 px-4">
            <div className="text-xs text-gray-500">Exempt Investments</div>
            <div className="text-xl font-bold text-gray-600">{exemptCount}</div>
            <div className="text-xs text-gray-500">Ijarah or &lt; 1 year</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-gray-500 font-medium">Status:</span>
          {(['all', 'due', 'exempt', 'pending', 'paid'] as StatusFilter[]).map(f => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-3 py-1 rounded text-xs font-medium ${
                statusFilter === f
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-500 font-medium">Sukuk Type:</span>
          {(['all', 'MURABAHA', 'IJARAH'] as SukukFilter[]).map(f => (
            <button
              key={f}
              onClick={() => setSukukFilter(f)}
              className={`px-3 py-1 rounded text-xs font-medium ${
                sukukFilter === f
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f === 'all' ? 'All Types' : f}
            </button>
          ))}
        </div>
      </div>

      {/* Investments Table */}
      <Card>
        <CardContent className="p-0">
          {filteredInvestments.length === 0 ? (
            <div className="p-6 text-sm text-gray-500 text-center">No investments match your filters.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs text-gray-500 border-b border-gray-200">
                    <th className="py-3 px-4 font-medium cursor-pointer select-none" onClick={() => toggleSort('investment_name')}>
                      Investment <SortArrow active={sortKey === 'investment_name'} dir={sortDir} />
                    </th>
                    <th className="py-3 px-4 font-medium cursor-pointer select-none" onClick={() => toggleSort('sukuk_type')}>
                      Type <SortArrow active={sortKey === 'sukuk_type'} dir={sortDir} />
                    </th>
                    <th className="py-3 px-4 font-medium cursor-pointer select-none text-right" onClick={() => toggleSort('principal_amount')}>
                      Principal <SortArrow active={sortKey === 'principal_amount'} dir={sortDir} />
                    </th>
                    <th className="py-3 px-4 font-medium cursor-pointer select-none" onClick={() => toggleSort('hawl_start_date')}>
                      Hawl Start <SortArrow active={sortKey === 'hawl_start_date'} dir={sortDir} />
                    </th>
                    <th className="py-3 px-4 font-medium cursor-pointer select-none text-center" onClick={() => toggleSort('days_held')}>
                      Days Held <SortArrow active={sortKey === 'days_held'} dir={sortDir} />
                    </th>
                    <th className="py-3 px-4 font-medium text-center">Distributions</th>
                    <th className="py-3 px-4 font-medium cursor-pointer select-none text-right" onClick={() => toggleSort('zakat_amount')}>
                      Zakat Due <SortArrow active={sortKey === 'zakat_amount'} dir={sortDir} />
                    </th>
                    <th className="py-3 px-4 font-medium text-center">Status</th>
                    <th className="py-3 px-4 font-medium text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredInvestments.map((investment) => (
                    <tr key={investment.investment_id} className="hover:bg-gray-50 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-medium text-gray-900 max-w-[200px] truncate" title={investment.investment_name}>
                          {investment.investment_name}
                        </div>
                        <div className="text-xs text-gray-500 truncate max-w-[200px]" title={investment.reason}>
                          {investment.reason}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        {getSukukTypeBadge(investment.sukuk_type)}
                      </td>
                      <td className="py-3 px-4 text-right font-medium text-gray-900">
                        SAR {fmt(investment.principal_amount)}
                      </td>
                      <td className="py-3 px-4 text-gray-600 text-xs">
                        {formatGregorianAndHijriDate(investment.hawl_start_date)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="text-gray-900 font-medium">{investment.days_held}</div>
                        <div className={`text-xs ${investment.hawl_completed ? 'text-green-600' : 'text-amber-600'}`}>
                          {investment.hawl_completed ? 'Complete' : 'Pending'}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="text-gray-900 font-medium">{investment.distributions_count}</div>
                        <div className="text-xs text-gray-500">
                          SAR {fmt(investment.total_distributions)}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-semibold">
                        <span className={investment.zakat_amount > 0 ? 'text-emerald-700' : 'text-gray-400'}>
                          SAR {fmt(investment.zakat_amount)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {getStatusBadge(investment.status)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button size="sm" variant="secondary" onClick={() => openDetails(investment)}>
                            Details
                          </Button>
                          {investment.zakat_amount > 0 && zakatEnabled && (
                            <Button size="sm" variant="primary" onClick={() => openPay(investment)}>
                              Pay
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 border-t border-gray-200">
                    <td colSpan={2} className="py-3 px-4 text-xs font-semibold text-gray-500">Total</td>
                    <td className="py-3 px-4 text-right font-bold text-gray-900">
                      SAR {fmt(totalPrincipal)}
                    </td>
                    <td colSpan={3}></td>
                    <td className="py-3 px-4 text-right font-bold text-emerald-700">
                      SAR {fmt(totalDue)}
                    </td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payment Modal */}
      <Modal
        isOpen={Boolean(payTarget)}
        onClose={closePay}
        title={payTarget ? `Pay Zakat • ${payTarget.investment_name}` : 'Pay Zakat'}
      >
        {payTarget && (
          <form onSubmit={handlePay} className="space-y-4">
            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="text-sm font-medium text-gray-900">Investment Details</div>
              <div className="mt-2 space-y-1 text-sm text-gray-600">
                <div>Type: {payTarget.sukuk_type}</div>
                <div>Principal: SAR {fmt(payTarget.principal_amount)}</div>
                <div>Distributions: {payTarget.distributions_count} (SAR {fmt(payTarget.total_distributions)})</div>
                <div>Days Held: {payTarget.days_held}</div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount (SAR)</label>
              <input
                type="number"
                step="0.01"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Date</label>
              <DateInput
                value={payDate}
                onChange={setPayDate}
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea
                value={payNotes}
                onChange={(e) => setPayNotes(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
                rows={3}
              />
            </div>

            {payError && (
              <div className="text-sm text-red-600 bg-red-50 p-2 rounded">{payError}</div>
            )}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={closePay} disabled={payLoading}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={payLoading}>
                {payLoading ? 'Processing...' : 'Pay Zakat'}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Details Modal */}
      <Modal
        isOpen={Boolean(detailsTarget)}
        onClose={closeDetails}
        title={detailsTarget ? `Investment Details • ${detailsTarget.investment_name}` : 'Investment Details'}
      >
        {detailsTarget && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm font-medium text-gray-500">Sukuk Type</div>
                <div className="mt-1">{getSukukTypeBadge(detailsTarget.sukuk_type)}</div>
              </div>
              <div>
                <div className="text-sm font-medium text-gray-500">Principal Amount</div>
                <div className="mt-1 font-semibold">SAR {fmt(detailsTarget.principal_amount)}</div>
              </div>
              <div>
                <div className="text-sm font-medium text-gray-500">Hawl Start Date</div>
                <div className="mt-1 text-sm">{formatGregorianAndHijriDate(detailsTarget.hawl_start_date)}</div>
              </div>
              <div>
                <div className="text-sm font-medium text-gray-500">Days Held</div>
                <div className="mt-1 font-semibold">{detailsTarget.days_held} days</div>
              </div>
              <div>
                <div className="text-sm font-medium text-gray-500">Distributions</div>
                <div className="mt-1">
                  <div className="font-semibold">{detailsTarget.distributions_count} payments</div>
                  <div className="text-sm text-gray-600">SAR {fmt(detailsTarget.total_distributions)} total</div>
                </div>
              </div>
              <div>
                <div className="text-sm font-medium text-gray-500">Zakat Due</div>
                <div className="mt-1 font-bold text-emerald-700">SAR {fmt(detailsTarget.zakat_amount)}</div>
              </div>
            </div>

            <div className="p-4 bg-blue-50 rounded-lg">
              <div className="text-sm font-medium text-blue-900">Calculation Explanation</div>
              <div className="mt-2 text-sm text-blue-800">{detailsTarget.reason}</div>
            </div>

            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="text-sm font-medium text-gray-900">Status</div>
              <div className="mt-2">{getStatusBadge(detailsTarget.status)}</div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
