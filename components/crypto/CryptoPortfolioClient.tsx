'use client'

import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { AnimatedCard } from '@/components/ui/AnimatedCard'
import { formatDisplayDate } from '@/lib/date'

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
  amount?: number
  investedAmount?: number
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

const toDayKey = (value: string | Date) => {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
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
  const [showDepositForm, setShowDepositForm] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [actionError, setActionError] = useState('')
  const [valueForm, setValueForm] = useState<{ date: string; currentValue: string }>({
    date: new Date().toISOString().split('T')[0],
    currentValue: '',
  })

  const [depositForm, setDepositForm] = useState<{ date: string; amount: string }>({
    date: new Date().toISOString().split('T')[0],
    amount: '',
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

  const deposits = useMemo(() => {
    return history
      .filter((h) => typeof h?.action === 'string' && h.action === 'DEPOSIT')
      .map((h) => ({ at: new Date(h.at), amount: safeNumber((h as any).amount, 0) }))
      .filter((x) => !Number.isNaN(x.at.getTime()) && Number.isFinite(x.amount) && x.amount > 0)
      .sort((a, b) => a.at.getTime() - b.at.getTime())
  }, [history])

  const investedAmountAt = (at: Date) => {
    const t = at.getTime()
    let sum = 0
    for (const d of deposits) {
      if (d.at.getTime() <= t) sum += d.amount
      else break
    }
    return sum
  }

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

  const monthlyRows = useMemo(() => {
    if (points.length === 0) return []
    return points.map((p: { at: Date; value: number }, idx: number) => {
      const prev = idx > 0 ? points[idx - 1] : null
      const change = prev ? p.value - prev.value : null
      const investedAt = investedAmountAt(p.at)
      const profitAt = p.value - investedAt
      return { at: p.at, value: p.value, change, investedAt, profitAt }
    })
  }, [points, deposits])

  const monthlyTotals = useMemo(() => {
    if (monthlyRows.length === 0) return null
    const first = monthlyRows[0]
    const last = monthlyRows[monthlyRows.length - 1]
    return {
      latestValue: last.value,
      totalChange: last.value - first.value,
      latestProfit: last.profitAt,
    }
  }, [monthlyRows])

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
  const todayDayKey = toDayKey(new Date())
  const portfolioStartDayKey = toDayKey(inv.startDate)
  const haulProgressPct = useMemo(() => {
    const start = new Date(haulStartAt.getFullYear(), haulStartAt.getMonth(), haulStartAt.getDate()).getTime()
    const end = new Date(haulCompleteAt.getFullYear(), haulCompleteAt.getMonth(), haulCompleteAt.getDate()).getTime()
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()

    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return haulCompleted ? 100 : 0
    const raw = ((Math.min(today, end) - start) / (end - start)) * 100
    return Math.max(0, Math.min(100, raw))
  }, [haulStartAt, haulCompleteAt, haulCompleted])
  const daysToHaulComplete = useMemo(() => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    const end = new Date(haulCompleteAt.getFullYear(), haulCompleteAt.getMonth(), haulCompleteAt.getDate()).getTime()
    if (!Number.isFinite(end)) return 0
    return Math.max(0, Math.ceil((end - today) / (1000 * 60 * 60 * 24)))
  }, [haulCompleteAt])

  const openValueModal = () => {
    setActionError('')
    const defaultDate = (points.at(-1)?.at || new Date()).toISOString().split('T')[0]
    setValueForm({
      date: defaultDate,
      currentValue: String(currentValue || ''),
    })
    setShowValueForm(true)
  }

  const openDepositModal = () => {
    setActionError('')
    setDepositForm({
      date: new Date().toISOString().split('T')[0],
      amount: '',
    })
    setShowDepositForm(true)
  }

  const handleSubmitCurrentValue = async (e: FormEvent) => {
    e.preventDefault()
    setActionError('')

    const value = parseFloat(valueForm.currentValue)
    if (!Number.isFinite(value) || value < 0) {
      setActionError('Current value must be 0 or greater')
      return
    }

    if (!valueForm.date) {
      setActionError('Value update date is required')
      return
    }

    if (valueForm.date > todayDayKey) {
      setActionError('Value update date cannot be in the future')
      return
    }

    if (portfolioStartDayKey && valueForm.date < portfolioStartDayKey) {
      setActionError('Value update date cannot be before portfolio start date')
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
      setActionError(error instanceof Error ? error.message : 'Failed to update current value')
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeleteValueUpdate = async (at: string) => {
    const ok = confirm('Delete this monthly update?')
    if (!ok) return
    setActionError('')

    setIsLoading(true)
    try {
      const response = await fetch('/api/crypto/delete-value-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cryptoId: inv.id, at }),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.error || 'Failed to delete update')
      }

      const updated = await response.json()
      setInv(updated)
    } catch (error) {
      console.error('Delete update error:', error)
      setActionError(error instanceof Error ? error.message : 'Failed to delete update')
    } finally {
      setIsLoading(false)
    }
  }

  const handleResetPortfolio = async () => {
    const ok = confirm('Reset crypto portfolio invested/current values to 0?')
    if (!ok) return
    setActionError('')

    setIsLoading(true)
    try {
      const response = await fetch('/api/crypto/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cryptoId: inv.id }),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.error || 'Failed to reset portfolio')
      }

      const updated = await response.json()
      setInv(updated)
    } catch (error) {
      console.error('Reset portfolio error:', error)
      setActionError(error instanceof Error ? error.message : 'Failed to reset portfolio')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSetCurrencySar = async () => {
    const ok = confirm('Set CRYPTO account currency to SAR?')
    if (!ok) return
    setActionError('')

    setIsLoading(true)
    try {
      const response = await fetch('/api/crypto/set-currency', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: inv.account.id, currency: 'SAR' }),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.error || 'Failed to set currency')
      }

      const updatedAccount = await response.json()
      setInv((prev: Investment) => ({ ...prev, account: { ...prev.account, currency: updatedAccount.currency } }))
    } catch (error) {
      console.error('Set currency error:', error)
      setActionError(error instanceof Error ? error.message : 'Failed to set currency')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmitDeposit = async (e: FormEvent) => {
    e.preventDefault()
    setActionError('')

    const amount = parseFloat(depositForm.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      setActionError('Deposit amount must be greater than 0')
      return
    }

    if (!depositForm.date) {
      setActionError('Deposit date is required')
      return
    }

    if (depositForm.date > todayDayKey) {
      setActionError('Deposit date cannot be in the future')
      return
    }

    if (portfolioStartDayKey && depositForm.date < portfolioStartDayKey) {
      setActionError('Deposit date cannot be before portfolio start date')
      return
    }

    setIsLoading(true)
    try {
      const response = await fetch('/api/crypto/deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cryptoId: inv.id, amount, date: depositForm.date }),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.error || 'Failed to deposit')
      }

      const updated = await response.json()
      setInv(updated)
      setShowDepositForm(false)
    } catch (error) {
      console.error('Deposit error:', error)
      setActionError(error instanceof Error ? error.message : 'Failed to deposit')
    } finally {
      setIsLoading(false)
    }
  }

  const handlePayZakat = async () => {
    setActionError('')
    if (!haulCompleted) {
      setActionError('Haul is not complete yet')
      return
    }
    if (zakatRemaining <= 0) {
      setActionError('No zakat remaining to pay')
      return
    }

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
      setActionError(error instanceof Error ? error.message : 'Failed to pay zakat')
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
          <div className="flex items-center gap-2">
            <button
              onClick={handleSetCurrencySar}
              disabled={isLoading}
              className="px-4 py-2 text-xs font-medium text-white bg-white/10 hover:bg-white/15 rounded-lg transition-colors border border-white/10 disabled:opacity-50"
              title="Fix existing CRYPTO account currency"
            >
              Set SAR
            </button>
            <button
              onClick={handleResetPortfolio}
              disabled={isLoading}
              className="px-4 py-2 text-xs font-medium text-white bg-white/10 hover:bg-white/15 rounded-lg transition-colors border border-white/10 disabled:opacity-50"
              title="Fix existing portfolio seeded values"
            >
              Reset 0
            </button>
            <button
              onClick={openDepositModal}
              className="px-4 py-2 text-xs font-medium text-white bg-white/10 hover:bg-white/15 rounded-lg transition-colors border border-white/10"
            >
              Deposit
            </button>
            <button
              onClick={openValueModal}
              className="px-4 py-2 text-xs font-medium text-white bg-white/10 hover:bg-white/15 rounded-lg transition-colors border border-white/10"
            >
              Update Value
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          <AnimatedCard index={0} className="bg-white/5 rounded-lg p-3 border border-white/10" hover={false}>
            <p className="text-[11px] text-slate-400 uppercase tracking-wider">Current Value</p>
            <p className="text-lg font-bold mt-0.5">{formatCurrency(currentValue, inv.account.currency)}</p>
          </AnimatedCard>
          <AnimatedCard index={1} className="bg-white/5 rounded-lg p-3 border border-white/10" hover={false}>
            <p className="text-[11px] text-slate-400 uppercase tracking-wider">Invested</p>
            <p className="text-lg font-bold mt-0.5">{formatCurrency(investedAmount, inv.account.currency)}</p>
          </AnimatedCard>
          <AnimatedCard index={2} className="bg-white/5 rounded-lg p-3 border border-white/10" hover={false}>
            <p className="text-[11px] text-slate-400 uppercase tracking-wider">Profit</p>
            <p className={`text-lg font-bold mt-0.5 ${profit >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
              {profit >= 0 ? '+' : '-'}{formatCurrency(Math.abs(profit), inv.account.currency)}
            </p>
          </AnimatedCard>
          <AnimatedCard index={3} className="bg-white/5 rounded-lg p-3 border border-white/10" hover={false}>
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
          </AnimatedCard>
          <AnimatedCard index={4} className="bg-white/5 rounded-lg p-3 border border-white/10" hover={false}>
            <p className="text-[11px] text-slate-400 uppercase tracking-wider">Zakat Paid</p>
            <p className="text-lg font-bold mt-0.5 text-emerald-300">{formatCurrency(paidTotal, inv.account.currency)}</p>
          </AnimatedCard>
          <AnimatedCard index={5} className="bg-white/5 rounded-lg p-3 border border-white/10" hover={false}>
            <p className="text-[11px] text-slate-400 uppercase tracking-wider">Zakat Remaining</p>
            <p className="text-lg font-bold mt-0.5 text-amber-300">{formatCurrency(zakatRemaining, inv.account.currency)}</p>
          </AnimatedCard>
        </div>
      </div>

      {actionError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          {actionError}
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Performance Chart</CardTitle>
              <p className="text-sm text-gray-500">Based on monthly value updates</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <LineChart points={points} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Monthly Updates</CardTitle>
          <p className="text-sm text-gray-500">Value updates with change and profit</p>
        </CardHeader>
        <CardContent>
          {monthlyRows.length === 0 ? (
            <div className="text-sm text-gray-500">No updates yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="py-2 pr-4 font-medium">Month</th>
                    <th className="py-2 pr-4 font-medium">Value</th>
                    <th className="py-2 pr-4 font-medium">Change</th>
                    <th className="py-2 pr-4 font-medium">Profit</th>
                    <th className="py-2 pr-4 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyRows
                    .slice()
                    .map((row: { at: Date; value: number; change: number | null; investedAt: number; profitAt: number }) => {
                      const changePositive = row.change !== null ? row.change >= 0 : true
                      const profitPositive = row.profitAt >= 0
                      const monthLabel = row.at.toLocaleDateString(undefined, { year: 'numeric', month: 'short', timeZone: 'UTC' })
                      return (
                        <tr key={row.at.toISOString()} className="border-b last:border-b-0">
                          <td className="py-2 pr-4 font-medium text-gray-900">{monthLabel}</td>
                          <td className="py-2 pr-4">{formatCurrency(row.value, inv.account.currency)}</td>
                          <td className={`py-2 pr-4 ${changePositive ? 'text-emerald-700' : 'text-rose-700'}`}>
                            {row.change === null
                              ? '—'
                              : `${changePositive ? '+' : ''}${formatCurrency(row.change, inv.account.currency)}`}
                          </td>
                          <td className={`py-2 pr-4 ${profitPositive ? 'text-emerald-700' : 'text-rose-700'}`}>
                            {`${profitPositive ? '+' : ''}${formatCurrency(row.profitAt, inv.account.currency)}`}
                          </td>
                          <td className="py-2 pr-4 text-right">
                            <button
                              type="button"
                              disabled={isLoading}
                              onClick={() => handleDeleteValueUpdate(row.at.toISOString())}
                              className="text-xs text-rose-700 hover:text-rose-900 disabled:opacity-50"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                </tbody>
                {monthlyTotals && (
                  <tfoot className="border-t bg-gray-50">
                    <tr>
                      <td className="py-2 pr-4 font-semibold text-gray-900">Total</td>
                      <td className="py-2 pr-4 font-semibold text-gray-900">
                        {formatCurrency(monthlyTotals.latestValue, inv.account.currency)}
                      </td>
                      <td
                        className={`py-2 pr-4 font-semibold ${
                          monthlyTotals.totalChange >= 0 ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {`${monthlyTotals.totalChange >= 0 ? '+' : ''}${formatCurrency(monthlyTotals.totalChange, inv.account.currency)}`}
                      </td>
                      <td
                        className={`py-2 pr-4 font-semibold ${
                          monthlyTotals.latestProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {`${monthlyTotals.latestProfit >= 0 ? '+' : ''}${formatCurrency(monthlyTotals.latestProfit, inv.account.currency)}`}
                      </td>
                      <td className="py-2 pr-4"></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-bold text-gray-800">Zakat</CardTitle>
              <p className="text-xs text-gray-500 mt-0.5">
                Haul starts at {formatDisplayDate(haulStartAt)} and completes at {formatDisplayDate(haulCompleteAt)}
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
          <div className="mb-4">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
              <span>Haul Progress</span>
              <span>{haulProgressPct.toFixed(1)}%</span>
            </div>
            <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500"
                style={{ width: `${haulProgressPct}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="rounded-lg border border-gray-200 p-3">
              <p className="text-[11px] text-gray-500 uppercase tracking-wider">Haul Status</p>
              <p className="text-sm font-semibold text-gray-900 mt-0.5">{haulCompleted ? 'Complete' : 'Not complete yet'}</p>
              {!haulCompleted && <p className="text-[11px] text-slate-500 mt-1">~{daysToHaulComplete} day(s) remaining</p>}
            </div>
            <div className="rounded-lg border border-gray-200 p-3">
              <p className="text-[11px] text-gray-500 uppercase tracking-wider">Zakat Due</p>
              <p className="text-sm font-semibold text-gray-900 mt-0.5">{formatCurrency(zakatDue, inv.account.currency)}</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-3">
              <p className="text-[11px] text-gray-500 uppercase tracking-wider">Remaining</p>
              <p className="text-sm font-semibold text-gray-900 mt-0.5">{formatCurrency(zakatRemaining, inv.account.currency)}</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-3">
              <p className="text-[11px] text-gray-500 uppercase tracking-wider">Payments</p>
              <p className="text-sm font-semibold text-gray-900 mt-0.5">{zakatPayments.length}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {showValueForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Update Current Value</h2>
              <button onClick={() => setShowValueForm(false)} className="text-slate-400 hover:text-slate-600 dark:text-slate-200 dark:hover:text-slate-300">
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitCurrentValue} className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">Date</label>
                <input
                  type="date"
                  value={valueForm.date}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setValueForm((prev: { date: string; currentValue: string }) => ({ ...prev, date: e.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100"
                  min={portfolioStartDayKey || undefined}
                  max={todayDayKey || undefined}
                  required
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">Current Value ({inv.account.currency})</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={valueForm.currentValue}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setValueForm((prev: { date: string; currentValue: string }) => ({ ...prev, currentValue: e.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100"
                  required
                />
              </div>

              <div className="flex justify-end space-x-3 border-t border-slate-200 pt-4 dark:border-white/10">
                <button
                  type="button"
                  onClick={() => setShowValueForm(false)}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:bg-white/5"
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

      {showDepositForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-900">Deposit</h2>
              <button onClick={() => setShowDepositForm(false)} className="text-gray-400 hover:text-gray-600">
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitDeposit} className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">Date</label>
                <input
                  type="date"
                  value={depositForm.date}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setDepositForm((prev: { date: string; amount: string }) => ({ ...prev, date: e.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100"
                  min={portfolioStartDayKey || undefined}
                  max={todayDayKey || undefined}
                  required
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">Amount ({inv.account.currency})</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={depositForm.amount}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setDepositForm((prev: { date: string; amount: string }) => ({ ...prev, amount: e.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100"
                  required
                />
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  This will deduct from Cash balance/buckets for the selected date.
                </p>
              </div>

              <div className="flex justify-end space-x-3 border-t border-slate-200 pt-4 dark:border-white/10">
                <button
                  type="button"
                  onClick={() => setShowDepositForm(false)}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:bg-white/5"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                >
                  {isLoading ? 'Saving...' : 'Deposit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
