'use client'

import { useEffect, useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

interface SukukAccount {
  id: string
  name: string
  currency: string
  description?: string | null
}

export function SukukPlatformManager() {
  const [accounts, setAccounts] = useState<SukukAccount[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    name: '',
    currency: 'SAR',
    description: '',
  })

  const loadAccounts = async () => {
    setError('')
    try {
      const res = await fetch('/api/accounts?type=SUKUK')
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load accounts')
      }
      setAccounts(Array.isArray(data.accounts) ? data.accounts : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load accounts')
    }
  }

  useEffect(() => {
    loadAccounts()
  }, [])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          currency: form.currency,
          description: form.description,
          type: 'SUKUK',
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create account')
      }
      setForm({ name: '', currency: form.currency || 'SAR', description: '' })
      await loadAccounts()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create account')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sukuk Platforms</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Platform Name</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., Sukuk Capital"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
            <input
              type="text"
              required
              value={form.currency}
              onChange={(e) => setForm((prev) => ({ ...prev, currency: e.target.value.toUpperCase() }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
              placeholder="SAR"
            />
          </div>
          <div className="md:col-span-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
              placeholder="Short description for this platform"
            />
          </div>
          <div className="md:col-span-4 flex items-center gap-3">
            <Button type="submit" variant="primary" disabled={loading}>
              {loading ? 'Adding...' : 'Add Platform'}
            </Button>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
        </form>

        <div className="space-y-3">
          {accounts.length === 0 && (
            <p className="text-sm text-gray-500">No Sukuk platforms yet.</p>
          )}
          {accounts.map((account) => (
            <div
              key={account.id}
              className="flex flex-col gap-1 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-medium text-gray-900">{account.name}</div>
                <span className="text-xs font-semibold text-gray-600">{account.currency}</span>
              </div>
              <div className="text-xs text-gray-500">Account ID: {account.id}</div>
              {account.description && (
                <div className="text-sm text-gray-600">{account.description}</div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
