'use client'

import { useEffect, useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

export function CashBalanceManager() {
  const [cashBalance, setCashBalance] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const loadCash = async () => {
    setError('')
    setSuccess('')
    try {
      const res = await fetch('/api/settings/cash')
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
  }, [])

  const saveCash = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')
    try {
      const res = await fetch('/api/settings/cash', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cashBalance: Number(cashBalance) }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update cash balance')
      }
      setCashBalance(String(data.cashBalance ?? 0))
      setSuccess('Cash balance updated')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update cash balance')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cash Balance</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={saveCash} className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Available Cash (SAR)
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={cashBalance}
              onChange={(e) => setCashBalance(e.target.value)}
              className="w-56 rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <Button type="submit" variant="primary" disabled={loading}>
            {loading ? 'Saving...' : 'Save'}
          </Button>
          {error && <span className="text-sm text-red-600">{error}</span>}
          {success && <span className="text-sm text-green-600">{success}</span>}
        </form>
      </CardContent>
    </Card>
  )
}
