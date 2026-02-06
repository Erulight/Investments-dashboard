'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

export function CashBalanceCard({ initialCash }: { initialCash: number }) {
  const searchParams = useSearchParams()
  const selectedYear = searchParams?.get('year') || new Date().getFullYear().toString()
  const [cashBalance, setCashBalance] = useState(String(initialCash ?? 0))
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [direction, setDirection] = useState<'IN' | 'OUT'>('IN')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [transactions, setTransactions] = useState<any[]>([])

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
      setTransactions(Array.isArray(data.transactions) ? data.transactions : [])
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
      const res = await fetch('/api/cash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          direction,
          amount: Number(amount),
          date: new Date().toISOString().split('T')[0],
          notes,
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
      await loadCash()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update cash balance')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card hover className="sukuk-card-hover">
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-500">Cash Balance</p>
            <span className="text-2xl">🏦</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">
            SAR {Number(cashBalance || 0).toLocaleString()}
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <select
              value={direction}
              onChange={(e) => setDirection(e.target.value as 'IN' | 'OUT')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
            >
              <option value="IN">Add Cash</option>
              <option value="OUT">Withdraw Cash</option>
            </select>
            <input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
              placeholder="Amount"
            />
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
              placeholder="Notes"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button type="submit" variant="primary" size="sm" disabled={loading}>
              {loading ? 'Saving...' : 'Log Cash'}
            </Button>
            {message && <span className="text-xs text-green-600">{message}</span>}
            {error && <span className="text-xs text-red-600">{error}</span>}
          </div>
          {transactions.length > 0 && (
            <div className="pt-3 border-t border-gray-200">
              <p className="text-xs font-semibold text-gray-500 mb-2">Recent Cash Entries</p>
              <div className="space-y-1 text-xs text-gray-600">
                {transactions.map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between">
                    <span>{new Date(tx.date).toLocaleDateString()} • {tx.type}</span>
                    <span className={tx.amount >= 0 ? 'text-green-600' : 'text-red-600'}>
                      {tx.amount >= 0 ? '+' : '-'}SAR {Math.abs(tx.amount).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  )
}
