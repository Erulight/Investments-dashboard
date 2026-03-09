'use client'

import { useEffect, useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

export function NisabSettings() {
  const [nisabValue, setNisabValue] = useState<string>('55000')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    setMessage('')
    try {
      const res = await fetch('/api/settings/nisab')
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load nisab value')
      }
      const v = Number(data.nisabValue)
      setNisabValue(Number.isFinite(v) ? String(v) : '55000')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load nisab value')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const save = async () => {
    const v = Number(nisabValue)
    if (!Number.isFinite(v) || v <= 0) {
      setError('Nisab must be greater than 0')
      return
    }

    setLoading(true)
    setError('')
    setMessage('')

    try {
      const res = await fetch('/api/settings/nisab', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nisabValue: v }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save')
      }
      setNisabValue(String(Number(data.nisabValue)))
      setMessage('Saved')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-bold text-gray-800">Zakat Nisab</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <p className="text-xs text-gray-500">
            Zakat calculations are enabled only when your zakatable wealth is above the Nisab threshold.
          </p>

          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              step="0.01"
              value={nisabValue}
              onChange={(e) => setNisabValue(e.target.value)}
              className="w-48 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors focus:border-slate-500 focus:ring-1 focus:ring-slate-500 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100"
            />
            <Button size="sm" variant="primary" onClick={save} disabled={loading}>
              {loading ? 'Saving…' : 'Save'}
            </Button>
            <Button size="sm" variant="secondary" onClick={load} disabled={loading}>
              Reload
            </Button>
          </div>

          {message && <div className="text-xs text-emerald-600">{message}</div>}
          {error && <div className="text-xs text-red-600">{error}</div>}
        </div>
      </CardContent>
    </Card>
  )
}
