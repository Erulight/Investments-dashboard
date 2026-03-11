'use client'

import { useCallback, useEffect, useMemo, useState, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { DateInput } from '@/components/ui/DateInput'
import { Modal } from '@/components/sukuk/SukukModal'
import { AnimatedCard } from '@/components/ui/AnimatedCard'
import { formatDateInput, formatDisplayDate, toIsoDateInput } from '@/lib/date'

type CashBucketInfo = {
  id: string
  currency: string
  balance: number
  haulStartDate: string
  lastZakatPaidDate: string | null
  excludeFromZakat: boolean
}

type DebtPayment = {
  id: string
  amount: number
  paidAt: string
  notes: string | null
  createdAt: string
}

type Debt = {
  id: string
  lenderName: string
  amount: number
  borrowedAt: string
  notes: string | null
  isArchived: boolean
  cashBucketId: string | null
  cashBucket: CashBucketInfo | null
  payments: DebtPayment[]
}

const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtDate = (d: string) => formatDisplayDate(d)
const toDayKey = (value: string | Date) => {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}
const fieldClassName = 'rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-emerald-400 dark:focus:ring-emerald-400/20'

export function DebtsClient() {
  const router = useRouter()
  const [debts, setDebts] = useState<Debt[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [createForm, setCreateForm] = useState({
    lenderName: '',
    amount: '',
    borrowedAt: formatDateInput(new Date()),
    notes: '',
    currency: 'SAR',
  })
  const [createLoading, setCreateLoading] = useState(false)
  const [createError, setCreateError] = useState('')

  const [payTarget, setPayTarget] = useState<null | Debt>(null)
  const [payForm, setPayForm] = useState({ amount: '', paidAt: formatDateInput(new Date()), notes: '' })
  const [payLoading, setPayLoading] = useState(false)
  const [payError, setPayError] = useState('')

  const [editTarget, setEditTarget] = useState<null | Debt>(null)
  const [editForm, setEditForm] = useState({ lenderName: '', amount: '', borrowedAt: '', notes: '' })
  const [editLoading, setEditLoading] = useState(false)
  const [editError, setEditError] = useState('')

  const [resetLoading, setResetLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/debts')
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Failed to load debts')
      setDebts(Array.isArray(json.debts) ? json.debts : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load debts')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const totals = useMemo(() => {
    const totalBorrowed = debts.reduce((s, d) => s + (Number(d.amount) || 0), 0)
    const totalPaid = debts.reduce((s, d) => s + d.payments.reduce((p, x) => p + (Number(x.amount) || 0), 0), 0)
    const totalOutstanding = Math.max(0, totalBorrowed - totalPaid)
    const settledCount = debts.filter((d) => {
      const paid = d.payments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0)
      return Math.max(0, Number(d.amount) - paid) <= 0.000001
    }).length
    const activeCount = debts.length - settledCount
    const avgDebtSize = debts.length > 0 ? totalBorrowed / debts.length : 0
    const coveragePct = totalBorrowed > 0 ? (totalPaid / totalBorrowed) * 100 : 0

    return { totalBorrowed, totalPaid, totalOutstanding, settledCount, activeCount, avgDebtSize, coveragePct }
  }, [debts])

  const onCreate = async () => {
    setCreateLoading(true)
    setCreateError('')
    try {
      const amount = Number(createForm.amount)
      const borrowedAt = toIsoDateInput(createForm.borrowedAt)
      if (!createForm.lenderName.trim()) throw new Error('Lender name is required')
      if (!Number.isFinite(amount) || amount <= 0) throw new Error('Amount must be greater than 0')
      if (!borrowedAt) throw new Error('Invalid date')
      if (borrowedAt > toDayKey(new Date())) throw new Error('Borrowed date cannot be in the future')

      const res = await fetch('/api/debts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lenderName: createForm.lenderName,
          amount,
          borrowedAt,
          notes: createForm.notes,
          currency: createForm.currency,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Failed to create debt')

      setCreateForm({
        lenderName: '',
        amount: '',
        borrowedAt: formatDateInput(new Date()),
        notes: '',
        currency: createForm.currency,
      })
      await load()
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Failed to create debt')
    } finally {
      setCreateLoading(false)
    }
  }

  const deleteDebt = async (debt: Debt) => {
    const confirmed = confirm('Delete this debt? This can only be done if it has no payments.')
    if (!confirmed) return
    try {
      const res = await fetch(`/api/debts/${debt.id}`, { method: 'DELETE' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Failed to delete debt')
      await load()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to delete debt')
    }
  }

  const resetDebts = async () => {
    const confirmed = confirm('Reset debts? This will archive all debts and clear the list.')
    if (!confirmed) return
    setResetLoading(true)
    try {
      const res = await fetch('/api/debts/reset', { method: 'POST' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Failed to reset debts')
      await load()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to reset debts')
    } finally {
      setResetLoading(false)
    }
  }

  const openPay = (debt: Debt) => {
    const totalPaid = debt.payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
    const outstanding = Math.max(0, Number(debt.amount) - totalPaid)
    setPayTarget(debt)
    setPayError('')
    setPayForm({ amount: outstanding > 0 ? outstanding.toFixed(2) : '', paidAt: formatDateInput(new Date()), notes: '' })
  }

  const closePay = () => {
    if (payLoading) return
    setPayTarget(null)
  }

  const submitPay = async () => {
    if (!payTarget) return
    setPayLoading(true)
    setPayError('')
    try {
      const amount = Number(payForm.amount)
      const paidAt = toIsoDateInput(payForm.paidAt)
      if (!Number.isFinite(amount) || amount <= 0) throw new Error('Amount must be greater than 0')
      if (!paidAt) throw new Error('Invalid date')
      if (paidAt > toDayKey(new Date())) throw new Error('Payment date cannot be in the future')

      const totalPaid = payTarget.payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
      const outstanding = Math.max(0, Number(payTarget.amount) - totalPaid)
      if (amount > outstanding + 0.000001) {
        throw new Error('Payment exceeds outstanding amount')
      }

      const borrowedDay = toDayKey(payTarget.borrowedAt)
      if (borrowedDay && paidAt < borrowedDay) {
        throw new Error('Payment date cannot be before borrowed date')
      }

      const res = await fetch(`/api/debts/${payTarget.id}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, paidAt, notes: payForm.notes }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Failed to record payment')

      setPayTarget(null)
      await load()
      router.refresh()
    } catch (e) {
      setPayError(e instanceof Error ? e.message : 'Failed to record payment')
    } finally {
      setPayLoading(false)
    }
  }

  const undoPayment = async (paymentId: string) => {
    const confirmed = confirm('Undo this payment? This will add the cash back to your balance.')
    if (!confirmed) return
    try {
      const res = await fetch(`/api/debts/payments/${paymentId}`, { method: 'DELETE' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Failed to undo payment')
      await load()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to undo payment')
    }
  }

  const archiveDebt = async (debt: Debt) => {
    const confirmed = confirm('Archive this debt?')
    if (!confirmed) return
    try {
      const res = await fetch(`/api/debts/${debt.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isArchived: true }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Failed to archive debt')
      await load()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to archive debt')
    }
  }

  const openEdit = (debt: Debt) => {
    setEditTarget(debt)
    setEditError('')
    setEditForm({
      lenderName: debt.lenderName,
      amount: String(debt.amount),
      borrowedAt: formatDateInput(debt.borrowedAt),
      notes: debt.notes || '',
    })
  }

  const closeEdit = () => {
    if (editLoading) return
    setEditTarget(null)
  }

  const submitEdit = async () => {
    if (!editTarget) return
    setEditLoading(true)
    setEditError('')
    try {
      const amount = Number(editForm.amount)
      const borrowedAt = toIsoDateInput(editForm.borrowedAt)
      if (!editForm.lenderName.trim()) throw new Error('Lender name is required')
      if (!Number.isFinite(amount) || amount <= 0) throw new Error('Amount must be greater than 0')
      if (!borrowedAt) throw new Error('Invalid date')
      if (borrowedAt > toDayKey(new Date())) throw new Error('Borrowed date cannot be in the future')

      if (editTarget.payments.length > 0) {
        const originalAmount = Number(editTarget.amount) || 0
        const originalBorrowedDay = toDayKey(editTarget.borrowedAt)
        if (Math.abs(amount - originalAmount) > 0.000001 || borrowedAt !== originalBorrowedDay) {
          throw new Error('Cannot change amount or borrowed date after payments are recorded')
        }
      }

      const res = await fetch(`/api/debts/${editTarget.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lenderName: editForm.lenderName,
          amount,
          borrowedAt,
          notes: editForm.notes,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Failed to update debt')
      setEditTarget(null)
      await load()
    } catch (e) {
      setEditError(e instanceof Error ? e.message : 'Failed to update debt')
    } finally {
      setEditLoading(false)
    }
  }

  const rows = useMemo(() => {
    return debts
      .map((d) => {
        const totalPaid = d.payments.reduce((s, p) => s + (Number(p.amount) || 0), 0)
        const outstanding = Math.max(0, Number(d.amount) - totalPaid)
        const currency = d.cashBucket?.currency || 'SAR'
        return { debt: d, totalPaid, outstanding, currency }
      })
      .sort((a, b) => new Date(b.debt.borrowedAt).getTime() - new Date(a.debt.borrowedAt).getTime())
  }, [debts])

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-xl shadow-md p-6 text-white">
        <h1 className="text-2xl font-bold">Debts</h1>
        <p className="text-sm text-slate-400 mt-1">Record external debts, partial payments, and track outstanding balances.</p>
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mt-4">
          <AnimatedCard index={0} className="bg-white/5 border border-white/10 p-3" hover={false}>
            <div className="text-[11px] text-slate-400 uppercase tracking-wider">Borrowed</div>
            <div className="text-lg font-bold tabular-nums">SAR {fmt(totals.totalBorrowed)}</div>
          </AnimatedCard>
          <AnimatedCard index={1} className="bg-white/5 border border-white/10 p-3" hover={false}>
            <div className="text-[11px] text-slate-400 uppercase tracking-wider">Paid</div>
            <div className="text-lg font-bold tabular-nums text-emerald-300">SAR {fmt(totals.totalPaid)}</div>
          </AnimatedCard>
          <AnimatedCard index={2} className="bg-white/5 border border-white/10 p-3" hover={false}>
            <div className="text-[11px] text-slate-400 uppercase tracking-wider">Outstanding</div>
            <div className="text-lg font-bold tabular-nums text-rose-300">SAR {fmt(totals.totalOutstanding)}</div>
          </AnimatedCard>
          <AnimatedCard index={3} className="bg-white/5 border border-white/10 p-3" hover={false}>
            <div className="text-[11px] text-slate-400 uppercase tracking-wider">Coverage</div>
            <div className="text-lg font-bold tabular-nums">{totals.coveragePct.toFixed(1)}%</div>
          </AnimatedCard>
          <AnimatedCard index={4} className="bg-white/5 border border-white/10 p-3" hover={false}>
            <div className="text-[11px] text-slate-400 uppercase tracking-wider">Active Debts</div>
            <div className="text-lg font-bold tabular-nums">{totals.activeCount}</div>
          </AnimatedCard>
          <AnimatedCard index={5} className="bg-white/5 border border-white/10 p-3" hover={false}>
            <div className="text-[11px] text-slate-400 uppercase tracking-wider">Avg Ticket</div>
            <div className="text-lg font-bold tabular-nums">SAR {fmt(totals.avgDebtSize)}</div>
          </AnimatedCard>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">{error}</div>}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-bold text-slate-800 dark:text-slate-100">Add Debt</CardTitle>
        </CardHeader>
        <CardContent>
          {createError && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">{createError}</div>}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <input
              className={fieldClassName}
              placeholder="Lender name"
              value={createForm.lenderName}
              onChange={(e) => setCreateForm((p) => ({ ...p, lenderName: e.target.value }))}
            />
            <input
              className={fieldClassName}
              placeholder="Amount"
              inputMode="decimal"
              value={createForm.amount}
              onChange={(e) => setCreateForm((p) => ({ ...p, amount: e.target.value }))}
            />
            <DateInput
              value={createForm.borrowedAt}
              onChange={(v) => setCreateForm((p) => ({ ...p, borrowedAt: v }))}
            />
            <input
              className={fieldClassName}
              placeholder="Notes"
              value={createForm.notes}
              onChange={(e) => setCreateForm((p) => ({ ...p, notes: e.target.value }))}
            />
            <div className="flex items-center justify-end">
              <Button onClick={onCreate} disabled={createLoading}>
                {createLoading ? 'Saving...' : 'Add'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-sm font-bold text-slate-800 dark:text-slate-100">Debt List</CardTitle>
            <Button size="sm" variant="danger" onClick={resetDebts} disabled={resetLoading || loading || debts.length === 0}>
              {resetLoading ? 'Resetting...' : 'Reset'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 text-center text-sm text-slate-500 dark:text-slate-400">Loading...</div>
          ) : rows.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-500 dark:text-slate-400">No debts yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-600 dark:border-white/10 dark:bg-slate-900/70 dark:text-slate-300">
                    <th className="py-2.5 px-4 font-medium">Borrowed</th>
                    <th className="py-2.5 px-4 font-medium">Lender</th>
                    <th className="py-2.5 px-4 font-medium text-right">Amount</th>
                    <th className="py-2.5 px-4 font-medium text-right">Paid</th>
                    <th className="py-2.5 px-4 font-medium text-right">Outstanding</th>
                    <th className="py-2.5 px-4 font-medium">Notes</th>
                    <th className="py-2.5 px-4 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/10">
                  {rows.map(({ debt, totalPaid, outstanding, currency }) => (
                    <Fragment key={debt.id}>
                      <tr className="transition-colors hover:bg-slate-50 dark:hover:bg-white/5">
                        <td className="py-2.5 px-4 whitespace-nowrap tabular-nums text-slate-600 dark:text-slate-300">{fmtDate(debt.borrowedAt)}</td>
                        <td className="py-2.5 px-4 font-medium text-slate-900 dark:text-slate-100">{debt.lenderName}</td>
                        <td className="py-2.5 px-4 text-right tabular-nums">{currency} {fmt(debt.amount)}</td>
                        <td className="py-2.5 px-4 text-right tabular-nums text-emerald-700 dark:text-emerald-300">{currency} {fmt(totalPaid)}</td>
                        <td className="py-2.5 px-4 text-right tabular-nums text-red-700 dark:text-red-300">{currency} {fmt(outstanding)}</td>
                        <td className="py-2.5 px-4 max-w-[240px] truncate text-slate-600 dark:text-slate-300">{debt.notes || '—'}</td>
                        <td className="py-2.5 px-4">
                          <div className="flex items-center justify-end gap-2">
                            <Button size="sm" variant="secondary" onClick={() => openPay(debt)} disabled={outstanding <= 0}>
                              Pay
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => openEdit(debt)}>
                              Edit
                            </Button>
                            <Button size="sm" variant="danger" onClick={() => deleteDebt(debt)} disabled={debt.payments.length > 0}>
                              Delete
                            </Button>
                            <Button size="sm" variant="danger" onClick={() => archiveDebt(debt)}>
                              Archive
                            </Button>
                          </div>
                        </td>
                      </tr>
                      {debt.payments.length > 0 && (
                        <tr className="bg-slate-50/60 dark:bg-white/5">
                          <td className="py-2.5 px-4" colSpan={7}>
                            <div className="mb-2 text-xs text-slate-600 dark:text-slate-300">Payments</div>
                            <div className="space-y-2">
                              {debt.payments.map((p) => (
                                <div key={p.id} className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 dark:border-white/10 dark:bg-slate-900/50">
                                  <div className="text-xs text-slate-700 dark:text-slate-200">
                                    <span className="tabular-nums">{fmtDate(p.paidAt)}</span>
                                    <span className="mx-2 text-slate-300 dark:text-slate-600">|</span>
                                    <span className="tabular-nums font-medium">{currency} {fmt(p.amount)}</span>
                                    {p.notes ? <span className="mx-2 text-slate-400 dark:text-slate-500">— {p.notes}</span> : null}
                                  </div>
                                  <Button size="sm" variant="ghost" onClick={() => undoPayment(p.id)}>
                                    Undo
                                  </Button>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Modal isOpen={Boolean(payTarget)} onClose={closePay} title="Record Payment">
        {payError && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">{payError}</div>}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input
            className={fieldClassName}
            placeholder="Amount"
            inputMode="decimal"
            value={payForm.amount}
            onChange={(e) => setPayForm((p) => ({ ...p, amount: e.target.value }))}
          />
          <DateInput value={payForm.paidAt} onChange={(v) => setPayForm((p) => ({ ...p, paidAt: v }))} />
          <input
            className={fieldClassName}
            placeholder="Notes"
            value={payForm.notes}
            onChange={(e) => setPayForm((p) => ({ ...p, notes: e.target.value }))}
          />
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={closePay} disabled={payLoading}>Cancel</Button>
          <Button onClick={submitPay} disabled={payLoading}>{payLoading ? 'Saving...' : 'Save'}</Button>
        </div>
      </Modal>

      <Modal isOpen={Boolean(editTarget)} onClose={closeEdit} title="Edit Debt">
        {editError && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">{editError}</div>}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input
            className={fieldClassName}
            placeholder="Lender name"
            value={editForm.lenderName}
            onChange={(e) => setEditForm((p) => ({ ...p, lenderName: e.target.value }))}
          />
          <input
            className={fieldClassName}
            placeholder="Amount"
            inputMode="decimal"
            value={editForm.amount}
            onChange={(e) => setEditForm((p) => ({ ...p, amount: e.target.value }))}
          />
          <DateInput value={editForm.borrowedAt} onChange={(v) => setEditForm((p) => ({ ...p, borrowedAt: v }))} />
          <input
            className={fieldClassName}
            placeholder="Notes"
            value={editForm.notes}
            onChange={(e) => setEditForm((p) => ({ ...p, notes: e.target.value }))}
          />
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={closeEdit} disabled={editLoading}>Cancel</Button>
          <Button onClick={submitEdit} disabled={editLoading}>{editLoading ? 'Saving...' : 'Save'}</Button>
        </div>
      </Modal>
    </div>
  )
}
