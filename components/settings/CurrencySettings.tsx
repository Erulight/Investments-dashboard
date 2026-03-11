'use client'

import { useEffect, useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

type DisplayCurrency = 'SAR' | 'USD'

export function CurrencySettings() {
  const [currency, setCurrency] = useState<DisplayCurrency>('SAR')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const loadCurrency = async () => {
      setError('')
      setMessage('')
      try {
        const res = await fetch('/api/settings/currency')
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || 'Failed to load currency')
        const value = String(data.currency || 'SAR').toUpperCase() === 'USD' ? 'USD' : 'SAR'
        setCurrency(value)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load currency')
      }
    }

    loadCurrency()
  }, [])

  const save = async () => {
    setLoading(true)
    setError('')
    setMessage('')

    try {
      const res = await fetch('/api/settings/currency', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currency }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to update currency')
      setMessage(`Display currency updated to ${currency === 'USD' ? 'Dollar' : 'Riyal'}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update currency')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Display Currency</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Choose the currency used for UI amount display across the app.
        </p>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setCurrency('SAR')}
            className={`px-3 py-2 rounded-lg text-sm font-medium border ${
              currency === 'SAR'
                ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                : 'bg-white border-slate-200 text-slate-600'
            }`}
          >
            Riyal (SAR)
          </button>
          <button
            type="button"
            onClick={() => setCurrency('USD')}
            className={`px-3 py-2 rounded-lg text-sm font-medium border ${
              currency === 'USD'
                ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                : 'bg-white border-slate-200 text-slate-600'
            }`}
          >
            Dollar (USD)
          </button>
        </div>

        <Button onClick={save} disabled={loading}>
          {loading ? 'Saving...' : 'Save Currency'}
        </Button>

        {message && <p className="text-sm text-emerald-600">{message}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </CardContent>
    </Card>
  )
}
