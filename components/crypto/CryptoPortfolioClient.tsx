'use client'

import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'

interface Investment {
  id: string
  name: string
  principalAmount: number
  currentValue: number
  startDate: string
  metadata?: string
  account: {
    id: string
    name: string
    type: string
    currency: string
  }
}

type HistoryItem = {
  at: string
  action: string
  currentValue?: number
}

type ZakatPayment = {
  id: string
  periodKey: string
  amount: number
  date: string
  periodStartAt?: string | null
  periodEndAt?: string | null
}

const safeNumber = (value: unknown, fallback = 0) => {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}

const parseMeta = (inv?: Investment | null) => {
  if (!inv) return {}
  try {
    return JSON.parse(inv.metadata || '{}')
  } catch {
    return {}
  }
}

const formatCurrency = (value: number, currency = 'SAR') => {
  const amount = Number.isFinite(value) ? value : 0
  return `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const addDays = (date: Date, days: number) => {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function LineChart({ points }: { points: { at: Date; value: number }[] }) {
  const width = 820
  const height = 240
  const padX = 24
  const padY = 18

  if (!points || points.length < 2) {
    return (
      <div className="h-[240px] flex items-center justify-center text-sm text-slate-200/80">
        Add value updates to see the chart.
      </div>
    )
  }

  const values = points.map((p) => p.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = Math.max(0.000001, max - min)

  const x0 = points[0].at.getTime()
  const x1 = points[points.length - 1].at.getTime()
  const xRange = Math.max(1, x1 - x0)

  const coords = points.map((p) => {
    const x = padX + ((p.at.getTime() - x0) / xRange) * (width - padX * 2)
    const y = padY + (1 - (p.value - min) / range) * (height - padY * 2)
    return { x, y }
  })

  const d = coords
    .map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(2)} ${c.y.toFixed(2)}`)
    .join(' ')

  const area = `${d} L ${(width - padX).toFixed(2)} ${(height - padY).toFixed(2)} L ${padX.toFixed(2)} ${(height - padY).toFixed(2)} Z`

  const up = values[values.length - 1] >= values[0]
  const stroke = up ? '#34d399' : '#f87171'
  const fill = up ? 'rgba(52,211,153,0.18)' : 'rgba(248,113,113,0.18)'

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={area} fill={fill} />
      <path d={d} fill="none" stroke={stroke} strokeWidth="3" strokeLinecap="round" />
      <circle cx={coords[coords.length - 1].x} cy={coords[coords.length - 1].y} r="5" fill={stroke} />
    </svg>
  )
}

export function CryptoPortfolioClient({ investment }: { investment: Investment }) {
  const [inv, setInv] = useState(investment)
  const [showValueForm, setShowValueForm] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [valueForm, setValueForm] = useState<{ date: string; currentValue: string }>({
    date: new Date().toISOString().split('T')[0],
    currentValue: '',
  })

  const meta = useMemo(() => parseMeta(inv), [inv])

  const history: HistoryItem[] = useMemo(
    () => (Array.isArray((meta as any).history) ? ((meta as any).history as HistoryItem[]) : []),
    [meta]
  )

  const points = useMemo(() => {
    return history
      .filter((h) => typeof h?.action === 'string' && h.action === 'VALUE_UPDATE')
      .map((h) => ({ at: new Date(h.at), value: safeNumber(h.currentValue, NaN) }))
      .filter((x) => !Number.isNaN(x.at.getTime()) && Number.isFinite(x.value))
      .sort((a, b) => a.at.getTime() - b.at.getTime())
  }, [history])

  const currentValue = useMemo(() => {
    const latest = points.at(-1)
    if (latest) return latest.value
    return safeNumber((meta as any).currentValue ?? inv.currentValue, 0)
  }, [points, meta, inv.currentValue])

  const investedAmount = safeNumber((meta as any).investedAmount ?? inv.principalAmount, 0)
  const profit = currentValue - investedAmount

  const monthlyGrowth = useMemo(() => {
    if (points.length < 2) return null
    const last = points.at(-1)!
    const prev = points.at(-2)!
    const diff = last.value - prev.value
    const pct = prev.value > 0 ? (diff / prev.value) * 100 : 0
    return { diff, pct, from: prev.at, to: last.at }
  }, [points])

  const haulStartAt = useMemo(() => {
    const fixed = new Date('2025-09-01T00:00:00.000Z')
    return Number.isNaN(fixed.getTime()) ? new Date(inv.startDate) : fixed
  }, [inv.startDate])

  const haulCompleteAt = useMemo(() => addDays(haulStartAt, 354), [haulStartAt])
  const haulCompleted = useMemo(() => new Date().getTime() >= haulCompleteAt.getTime(), [haulCompleteAt])

  const zakatDue = useMemo(() => {
    if (!haulCompleted) return 0
    return currentValue * 0.025
  }, [haulCompleted, currentValue])

  const zakatPayments: ZakatPayment[] = useMemo(
    () => (Array.isArray((meta as any).zakatPayments) ? ((meta as any).zakatPayments as ZakatPayment[]) : []),
    [meta]
  )

  const paidTotal = useMemo(() => zakatPayments.reduce((s, p) => s + safeNumber(p.amount, 0), 0), [zakatPayments])
  const zakatRemaining = Math.max(0, zakatDue - paidTotal)

  const openValueModal = () => {
    setValueForm({
      date: new Date().toISOString().split('T')[0],
      currentValue: String(currentValue || ''),
    })
    setShowValueForm(true)
  }

  const handleSubmitCurrentValue = async (e: FormEvent) => {
    e.preventDefault()

    const value = parseFloat(valueForm.currentValue)
    if (!Number.isFinite(value) || value < 0) {
      return
    }

    setIsLoading(true)
    try {
      const response = await fetch('/api/crypto/update-value', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cryptoId: inv.id, currentValue: value, date: valueForm.date }),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.error || 'Failed to update current value')
      }

      const updated = await response.json()
      setInv(updated)
      setShowValueForm(false)
    } catch (error) {
      console.error('Update value error:', error)
      alert(error instanceof Error ? error.message : 'Failed to update current value')
    } finally {
      setIsLoading(false)
    }
  }

  const handlePayZakat = async () => {
    if (!haulCompleted) return
    if (zakatRemaining <= 0) return

    const ok = confirm(`Pay zakat of ${formatCurrency(zakatRemaining, inv.account.currency)}?`)
    if (!ok) return

    setIsLoading(true)
    try {
      const response = await fetch('/api/crypto/pay-zakat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cryptoId: inv.id,
          amount: zakatRemaining,
          date: new Date().toISOString(),
          periodKey: `${haulStartAt.toISOString().split('T')[0]}_CRYPTO`,
          periodStartAt: haulStartAt.toISOString(),
          periodEndAt: haulCompleteAt.toISOString(),
        }),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.error || 'Failed to pay zakat')
      }

      const updated = await response.json()
      setInv(updated)
    } catch (error) {
      console.error('Pay zakat error:', error)
      alert(error instanceof Error ? error.message : 'Failed to pay zakat')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-xl shadow-md p-6 text-white">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-2xl font-bold">Crypto Portfolio</h1>
            <p className="text-sm text-slate-400 mt-1">Monthly value updates, performance, and zakat tracking</p>
          </div>
          <button
            onClick={openValueModal}
            className="px-4 py-2 text-xs font-medium text-white bg-white/10 hover:bg-white/15 rounded-lg transition-colors border border-white/10"
          >
            Update Value
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="bg-white/5 rounded-lg p-3 border border-white/10">
            <p className="text-[11px] text-slate-400 uppercase tracking-wider">Current Value</p>
            <p className="text-lg font-bold mt-0.5">{formatCurrency(currentValue, inv.account.currency)}</p>
          </div>
          <div className="bg-white/5 rounded-lg p-3 border border-white/10">
            <p className="text-[11px] text-slate-400 uppercase tracking-wider">Invested</p>
            <p className="text-lg font-bold mt-0.5">{formatCurrency(investedAmount, inv.account.currency)}</p>
          </div>
          <div className="bg-white/5 rounded-lg p-3 border border-white/10">
            <p className="text-[11px] text-slate-400 uppercase tracking-wider">Profit</p>
            <p className={`text-lg font-bold mt-0.5 ${profit >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
              {profit >= 0 ? '+' : '-'}{formatCurrency(Math.abs(profit), inv.account.currency)}
            </p>
          </div>
          <div className="bg-white/5 rounded-lg p-3 border border-white/10">
            <p className="text-[11px] text-slate-400 uppercase tracking-wider">Monthly Growth</p>
            <p className="text-lg font-bold mt-0.5">
              {monthlyGrowth ? (
                <span className={monthlyGrowth.diff >= 0 ? 'text-emerald-300' : 'text-red-300'}>
                  {monthlyGrowth.diff >= 0 ? '+' : '-'}{formatCurrency(Math.abs(monthlyGrowth.diff), inv.account.currency)}
                  <span className="text-slate-300 text-sm"> ({monthlyGrowth.diff >= 0 ? '+' : ''}{monthlyGrowth.pct.toFixed(2)}%)</span>
                </span>
              ) : (
                <span className="text-slate-300">—</span>
              )}
            </p>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-bold text-gray-800">Performance Chart</CardTitle>
              <p className="text-xs text-gray-500 mt-0.5">Based on monthly value updates</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <LineChart points={points} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-bold text-gray-800">Zakat</CardTitle>
              <p className="text-xs text-gray-500 mt-0.5">
                Haul starts at {haulStartAt.toISOString().split('T')[0]} and completes at {haulCompleteAt.toISOString().split('T')[0]}
              </p>
            </div>
            <button
              disabled={!haulCompleted || zakatRemaining <= 0 || isLoading}
              onClick={handlePayZakat}
              className="px-4 py-2 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
            >
              Pay
            </button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-lg border border-gray-200 p-3">
              <p className="text-[11px] text-gray-500 uppercase tracking-wider">Haul Status</p>
              <p className="text-sm font-semibold text-gray-900 mt-0.5">{haulCompleted ? 'Complete' : 'Not complete yet'}</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-3">
              <p className="text-[11px] text-gray-500 uppercase tracking-wider">Zakat Due</p>
              <p className="text-sm font-semibold text-gray-900 mt-0.5">{formatCurrency(zakatDue, inv.account.currency)}</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-3">
              <p className="text-[11px] text-gray-500 uppercase tracking-wider">Remaining</p>
              <p className="text-sm font-semibold text-gray-900 mt-0.5">{formatCurrency(zakatRemaining, inv.account.currency)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {showValueForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-900">Update Current Value</h2>
              <button onClick={() => setShowValueForm(false)} className="text-gray-400 hover:text-gray-600">
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitCurrentValue} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Date</label>
                <input
                  type="date"
                  value={valueForm.date}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setValueForm((prev: { date: string; currentValue: string }) => ({ ...prev, date: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Current Value (SAR)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={valueForm.currentValue}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setValueForm((prev: { date: string; currentValue: string }) => ({ ...prev, currentValue: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  required
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setShowValueForm(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                >
                  {isLoading ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
