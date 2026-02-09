'use client'

import { useState } from 'react'
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
  lastPayment: null | {
    id: string
    date: string
    amount: number
  }
  dueReceipts: ReceiptEntry[]
}

export function ZakatDashboard({ buckets }: { buckets: BucketRow[] }) {
  const router = useRouter()
  const [payTarget, setPayTarget] = useState<BucketRow | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [payDate, setPayDate] = useState(formatDateInput(new Date()))
  const [payNotes, setPayNotes] = useState('')
  const [payError, setPayError] = useState('')
  const [payLoading, setPayLoading] = useState(false)
  const [rollbackLoading, setRollbackLoading] = useState(false)
  const [rollbackError, setRollbackError] = useState('')

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

  const totalDue = buckets.reduce((sum, b) => sum + b.zakatDue, 0)

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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-gray-900">
            Total Zakat Due: SAR {totalDue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Zakat base = idle cash held through haul completion + receipts after haul.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Haul Buckets</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {buckets.length === 0 ? (
            <p className="text-sm text-gray-500">No buckets found.</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {buckets.map((bucket) => (
                <div key={bucket.id} className="rounded-lg border border-gray-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-gray-900">
                        {bucket.label ? bucket.label : `Bucket ${bucket.id.slice(0, 8)}`}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        Start: {bucket.haulStartDate}
                        {bucket.lastZakatPaidDate ? ` • Last paid: ${bucket.lastZakatPaidDate}` : ''}
                      </div>
                      <div className="text-xs text-gray-500">
                        Haul complete: {bucket.haulCompleteDate}
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => openDetails(bucket)}
                      >
                        Details
                      </Button>
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={bucket.zakatDue <= 0}
                        onClick={() => openPay(bucket)}
                      >
                        Pay Zakat
                      </Button>
                      {bucket.lastPayment && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={rollbackLoading}
                          onClick={() => handleRollback(bucket)}
                        >
                          Undo Last Payment
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-lg bg-white p-3 border border-gray-200">
                      <div className="text-xs text-gray-500">Balance (current)</div>
                      <div className="text-base font-semibold text-gray-900">
                        {bucket.currency}{' '}
                        {bucket.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>
                    <div className="rounded-lg bg-white p-3 border border-gray-200">
                      <div className="text-xs text-gray-500">Zakat due</div>
                      <div className="text-base font-semibold text-emerald-700">
                        {bucket.currency}{' '}
                        {bucket.zakatDue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>
                    <div className="rounded-lg bg-white p-3 border border-gray-200">
                      <div className="text-xs text-gray-500">Idle cash at haul</div>
                      <div className="text-base font-semibold text-gray-900">
                        {bucket.currency}{' '}
                        {bucket.idleBase.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>
                    <div className="rounded-lg bg-white p-3 border border-gray-200">
                      <div className="text-xs text-gray-500">Receipts after haul</div>
                      <div className="text-base font-semibold text-gray-900">
                        {bucket.currency}{' '}
                        {bucket.receiptsTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>
                  </div>
                {bucket.lastPayment && (
                  <div className="mt-2 text-xs text-gray-500">
                    Last payment: {bucket.lastPayment.date} • {bucket.currency}{' '}
                    {bucket.lastPayment.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                )}
                {rollbackError && (
                  <div className="mt-2 text-xs text-red-600">
                    {rollbackError}
                  </div>
                )}
                {bucket.dueReceipts.length > 0 && (
                  <div className="mt-3 border-t border-gray-200 pt-3 text-xs text-gray-600">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-semibold text-gray-700">Receipts after haul</div>
                      <div className="text-xs text-gray-500">{bucket.dueReceipts.length} items</div>
                    </div>
                    <div className="space-y-1 max-h-28 overflow-auto pr-2">
                      {bucket.dueReceipts.slice(0, 8).map((receipt, idx) => (
                        <div key={`${bucket.id}-${idx}`} className="flex items-center justify-between gap-3">
                          <span className="truncate">
                            {receipt.date} • {receipt.type}
                            {receipt.investmentName ? ` • ${receipt.investmentName}` : ''}
                          </span>
                          <span className="text-emerald-700 whitespace-nowrap">
                            {bucket.currency}{' '}
                            {receipt.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      ))}
                      {bucket.dueReceipts.length > 8 && (
                        <div className="text-xs text-gray-500">Open Details to see all receipts.</div>
                      )}
                    </div>
                  </div>
                )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

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
