'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { DateInput } from '@/components/ui/DateInput'
import { formatDateInput, toIsoDateInput } from '@/lib/date'

export function CashBalanceCard({ initialCash }: { initialCash: number }) {
  const searchParams = useSearchParams()
  const selectedYear = searchParams?.get('year') || new Date().getFullYear().toString()
  const [cashBalance, setCashBalance] = useState(String(initialCash ?? 0))
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [direction, setDirection] = useState<'IN' | 'OUT'>('IN')
  const [haulStartDate, setHaulStartDate] = useState(formatDateInput(new Date()))
  const [entryDate, setEntryDate] = useState(formatDateInput(new Date()))
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)

  const loadCash = async () => {
    setError('')
    setMessage('')
    try {
      const res = await fetch(`/api/cash?year=${selectedYear}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load cash balance')
      }
      setCashBalance(String(data.cashBalance ?? 0))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load cash balance')
    }
  }

  useEffect(() => {
    loadCash()
  }, [selectedYear])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    setMessage('')

    try {
      const selectedDate = direction === 'IN' ? haulStartDate : entryDate
      const isoDate = toIsoDateInput(selectedDate)
      if (!isoDate) {
        throw new Error('Invalid date format')
      }
      const res = await fetch('/api/cash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          direction,
          amount: Number(amount),
          date: isoDate,
          notes,
          haulStartDate: direction === 'IN' ? isoDate : undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update cash balance')
      }
      setCashBalance(String(data.cashBalance ?? 0))
      setAmount('')
      setNotes('')
      setMessage('Saved')
      setShowForm(false)
      await loadCash()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update cash balance')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardContent>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Cash Balance</p>
        <div className="text-2xl font-bold text-gray-900 mt-1">
          SAR {Number(cashBalance || 0).toLocaleString()}
        </div>
        <div className="mt-2">
          {!showForm ? (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="text-[11px] text-slate-500 hover:text-slate-700 font-medium"
            >
              + Log cash in/out
            </button>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-2 pt-2 border-t border-gray-100">
              <div className="flex gap-2">
                <select
                  value={direction}
                  onChange={(e) => setDirection(e.target.value as 'IN' | 'OUT')}
                  className="rounded-md border border-gray-200 px-2 py-1.5 text-xs focus:border-slate-500 focus:ring-1 focus:ring-slate-500 outline-none"
                >
                  <option value="IN">Add</option>
                  <option value="OUT">Withdraw</option>
                </select>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="flex-1 rounded-md border border-gray-200 px-2 py-1.5 text-xs focus:border-slate-500 focus:ring-1 focus:ring-slate-500 outline-none"
                  placeholder="Amount"
                />
              </div>
              <div className="flex gap-2">
                <DateInput
                  value={direction === 'IN' ? haulStartDate : entryDate}
                  onChange={(value) => (
                    direction === 'IN' ? setHaulStartDate(value) : setEntryDate(value)
                  )}
                  ariaLabel={direction === 'IN' ? 'Ownership date' : 'Withdrawal date'}
                />
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="flex-1 rounded-md border border-gray-200 px-2 py-1.5 text-xs focus:border-slate-500 focus:ring-1 focus:ring-slate-500 outline-none"
                  placeholder="Notes"
                />
              </div>
              <div className="flex items-center gap-2">
                <Button type="submit" variant="primary" size="sm" disabled={loading}>
                  {loading ? 'Saving...' : 'Save'}
                </Button>
                <button type="button" onClick={() => setShowForm(false)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                {message && <span className="text-xs text-green-600">{message}</span>}
                {error && <span className="text-xs text-red-600">{error}</span>}
              </div>
            </form>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
