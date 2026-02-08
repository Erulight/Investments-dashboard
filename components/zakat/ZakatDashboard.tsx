'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/sukuk/SukukModal'
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

  const handlePay = async (event: React.FormEvent) => {
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
            <div className="space-y-3">
              {buckets.map((bucket) => (
                <div key={bucket.id} className="rounded-lg border border-gray-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-gray-900">
                        Bucket {bucket.id.slice(0, 8)}
                      </div>
                      <div className="text-xs text-gray-500">
                        Bucket start: {bucket.haulStartDate}
                        {bucket.lastZakatPaidDate ? ` • Last zakat paid: ${bucket.lastZakatPaidDate}` : ''}
                      </div>
                      <div className="text-xs text-gray-500">
                        Haul complete: {bucket.haulCompleteDate}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-gray-500">Balance (current)</div>
                      <div className="text-lg font-semibold">
                        {bucket.currency} {bucket.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-gray-500">Idle cash at haul</div>
                      <div className="text-lg font-semibold">
                        {bucket.currency} {bucket.idleBase.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-gray-500">Receipts after haul</div>
                      <div className="text-lg font-semibold">
                        {bucket.currency} {bucket.receiptsTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-gray-500">Zakat due</div>
                      <div className="text-lg font-semibold text-emerald-700">
                        {bucket.currency} {bucket.zakatDue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>
                  <div className="flex flex-col items-end gap-2">
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
                        variant="secondary"
                        disabled={rollbackLoading}
                        onClick={() => handleRollback(bucket)}
                      >
                        Undo Last Payment
                      </Button>
                    )}
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
                    <div className="font-semibold text-gray-700 mb-2">Receipts after haul</div>
                    <div className="space-y-1">
                      {bucket.dueReceipts.map((receipt, idx) => (
                        <div key={`${bucket.id}-${idx}`} className="flex items-center justify-between">
                          <span>
                            {receipt.date} • {receipt.type}
                            {receipt.investmentName ? ` • ${receipt.investmentName}` : ''}
                          </span>
                          <span className="text-emerald-700">
                            {bucket.currency} {receipt.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      ))}
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
          <input
            type="text"
            value={payDate}
            onChange={(e) => setPayDate(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
            placeholder="Payment date (DD/MM/YYYY)"
          />
          <input
            type="number"
            min="0"
            step="0.01"
            value={payAmount}
            onChange={(e) => setPayAmount(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
            placeholder="Amount"
          />
          <input
            type="text"
            value={payNotes}
            onChange={(e) => setPayNotes(e.target.value)}
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
