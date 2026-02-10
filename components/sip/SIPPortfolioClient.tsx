'use client'

import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import { SIPForm } from './SIPForm'
import { CreateSipInput } from '@/lib/validation'

interface Investment {
  id: string
  name: string
  principalAmount: number
  currentValue: number
  startDate: string
  metadata?: string
  notes?: string
  account: {
    id: string
    name: string
    type: string
    currency: string
  }
}

interface SIPPortfolioClientProps {
  investment?: Investment
  userRole: string
}

type RangeKey = 'week' | 'month' | 'year' | 'all'

type HistoryItem = {
  at: string
  action: string
  currentValue?: number
  investedAmount?: number
  totalAmount?: number
}

const parseMeta = (inv?: Investment | null) => {
  if (!inv) return {}
  try {
    return JSON.parse(inv.metadata || '{}')
  } catch {
    return {}
  }
}

const formatCurrency = (value: number) => {
  const amount = Number.isFinite(value) ? value : 0
  return `SAR ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

const getRangeStart = (range: RangeKey, now: Date) => {
  const n = startOfDay(now)
  if (range === 'week') return new Date(n.getTime() - 7 * 24 * 60 * 60 * 1000)
  if (range === 'month') return new Date(n.getTime() - 30 * 24 * 60 * 60 * 1000)
  if (range === 'year') return new Date(n.getTime() - 365 * 24 * 60 * 60 * 1000)
  return null
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
      <circle
        cx={coords[coords.length - 1].x}
        cy={coords[coords.length - 1].y}
        r="5"
        fill={stroke}
      />
    </svg>
  )
}

export function SIPPortfolioClient({ investment, userRole }: SIPPortfolioClientProps) {
  const [inv, setInv] = useState<Investment | undefined>(investment)
  const [activeTab, setActiveTab] = useState<'performance' | 'zakat' | 'stats'>('performance')
  const [range, setRange] = useState<RangeKey>('week')

  const [showCreateForm, setShowCreateForm] = useState(false)
  const [showEditForm, setShowEditForm] = useState(false)
  const [showValueForm, setShowValueForm] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const [valueForm, setValueForm] = useState<{ date: string; currentValue: string }>({
    date: new Date().toISOString().split('T')[0],
    currentValue: '',
  })

  const meta = useMemo(() => parseMeta(inv), [inv])

  const investedAmount = Number(meta.investedAmount ?? inv?.principalAmount ?? 0)
  const currentValue = Number(meta.currentValue ?? inv?.currentValue ?? 0)
  const profit = currentValue - investedAmount
  const returnPct = investedAmount > 0 ? (profit / investedAmount) * 100 : 0

  const points = useMemo(() => {
    const history: HistoryItem[] = Array.isArray(meta.history) ? meta.history : []
    const now = new Date()
    const start = getRangeStart(range, now)

    const parsed = history
      .map((h) => {
        const at = new Date(h.at)
        const value = Number(h.currentValue)
        if (Number.isNaN(at.getTime()) || !Number.isFinite(value)) return null
        return { at, value }
      })
      .filter((x): x is { at: Date; value: number } => !!x)
      .sort((a, b) => a.at.getTime() - b.at.getTime())

    const filtered = start ? parsed.filter((p) => p.at >= start) : parsed

    return filtered
  }, [meta.history, range])

  const openValueModal = () => {
    setValueForm({
      date: new Date().toISOString().split('T')[0],
      currentValue: String(currentValue || ''),
    })
    setShowValueForm(true)
  }

  const handleSubmitCurrentValue = async (e: FormEvent) => {
    e.preventDefault()
    if (!inv) return

    const value = parseFloat(valueForm.currentValue)
    if (!Number.isFinite(value) || value < 0) {
      return
    }

    setIsLoading(true)
    try {
      const response = await fetch('/api/sip/update-value', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sipId: inv.id, currentValue: value, date: valueForm.date }),
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

  const handleCreate = async (data: CreateSipInput) => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/sip/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.error || 'Failed to create SIP portfolio')
      }
      const created = await response.json()
      setInv(created)
      setShowCreateForm(false)
    } finally {
      setIsLoading(false)
    }
  }

  const handleEdit = async (data: CreateSipInput) => {
    if (!inv) return
    setIsLoading(true)
    try {
      const response = await fetch(`/api/sip/${inv.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.error || 'Failed to update SIP portfolio')
      }
      const updated = await response.json()
      setInv(updated)
      setShowEditForm(false)
    } finally {
      setIsLoading(false)
    }
  }

  const handleInvest = async () => {
    if (!inv) return
    const amountStr = prompt('Enter deposit amount (SAR):')
    if (!amountStr) return
    const amount = parseFloat(amountStr)
    if (!Number.isFinite(amount) || amount <= 0) return

    try {
      const response = await fetch('/api/sip/invest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sipId: inv.id, amount }),
      })
      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.error || 'Failed to deposit')
      }
      const updated = await response.json()
      setInv(updated)
    } catch (error) {
      console.error('Deposit error:', error)
      alert(error instanceof Error ? error.message : 'Failed to deposit')
    }
  }

  const handleUpdateTotal = async () => {
    if (!inv) return
    const totalStr = prompt('Enter new target amount (SAR):')
    if (!totalStr) return
    const totalAmount = parseFloat(totalStr)
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) return

    try {
      const response = await fetch('/api/sip/update-total', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sipId: inv.id, totalAmount }),
      })
      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.error || 'Failed to update target')
      }
      const updated = await response.json()
      setInv(updated)
    } catch (error) {
      console.error('Update target error:', error)
      alert(error instanceof Error ? error.message : 'Failed to update target')
    }
  }

  const handleDelete = async () => {
    if (!inv) return
    const confirmed = window.confirm('Delete SIP portfolio? This cannot be undone.')
    if (!confirmed) return

    try {
      const response = await fetch(`/api/sip/${inv.id}`, { method: 'DELETE' })
      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.error || 'Failed to delete')
      }
      setInv(undefined)
    } catch (error) {
      console.error('Delete error:', error)
      alert(error instanceof Error ? error.message : 'Failed to delete')
    }
  }

  if (!inv) {
    return (
      <div className="space-y-6">
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-xl shadow-md p-6 text-white">
          <h1 className="text-2xl font-bold">SIP Portfolio</h1>
          <p className="text-sm text-slate-300 mt-1">Create your portfolio to start tracking deposits, value updates, and zakat.</p>
          {userRole === 'OWNER' && (
            <div className="mt-4">
              <button
                onClick={() => setShowCreateForm(true)}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm font-semibold"
              >
                + Create SIP Portfolio
              </button>
            </div>
          )}
        </div>

        {showCreateForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-gray-900">Create SIP Portfolio</h2>
                <button onClick={() => setShowCreateForm(false)} className="text-gray-400 hover:text-gray-600">✕</button>
              </div>
              <SIPForm onSubmit={handleCreate} onCancel={() => setShowCreateForm(false)} isLoading={isLoading} />
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="bg-gradient-to-r from-indigo-700 via-purple-700 to-violet-800 rounded-2xl shadow-md p-6 text-white">
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="text-xs text-white/80">Portfolio Value</div>
            <div className="text-3xl font-extrabold mt-1 tabular-nums">{formatCurrency(currentValue)}</div>
            <div className="mt-2 text-sm text-white/80">
              <span className={`font-semibold ${profit >= 0 ? 'text-emerald-200' : 'text-red-200'}`}>
                {profit >= 0 ? '+' : '-'}{formatCurrency(Math.abs(profit))}
              </span>
              <span className="ml-2">({returnPct >= 0 ? '+' : ''}{returnPct.toFixed(2)}%)</span>
            </div>
          </div>

          {userRole === 'OWNER' && (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button onClick={handleInvest} className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/15 border border-white/15 text-sm font-semibold">
                + Invest
              </button>
              <button onClick={openValueModal} className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/15 border border-white/15 text-sm font-semibold">
                Update Value
              </button>
              <button onClick={handleUpdateTotal} className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/15 border border-white/15 text-sm font-semibold">
                Update Target
              </button>
              <button onClick={() => setShowEditForm(true)} className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/15 border border-white/15 text-sm font-semibold">
                Edit
              </button>
              <button onClick={handleDelete} className="px-4 py-2 rounded-full bg-red-500/20 hover:bg-red-500/30 border border-red-200/30 text-sm font-semibold">
                Delete
              </button>
            </div>
          )}
        </div>

        <div className="mt-5 rounded-xl bg-white/10 border border-white/10 overflow-hidden">
          <div className="p-3">
            <LineChart points={points} />
          </div>
          <div className="px-3 pb-3">
            <div className="grid grid-cols-4 gap-2 bg-white/10 p-1 rounded-full">
              {([
                { key: 'week', label: 'Week' },
                { key: 'month', label: 'Month' },
                { key: 'year', label: 'Year' },
                { key: 'all', label: 'All' },
              ] as const).map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setRange(opt.key)}
                  className={`rounded-full py-1.5 text-xs font-semibold transition-colors ${
                    range === opt.key ? 'bg-white text-slate-900' : 'text-white/90 hover:bg-white/10'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex flex-wrap items-center gap-2">
          {([
            { key: 'performance', label: 'Performance' },
            { key: 'zakat', label: 'Zakat & Purif.' },
            { key: 'stats', label: 'General Stats' },
          ] as const).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
                activeTab === tab.key ? 'bg-slate-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'performance' && (
          <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-xl border border-gray-200 p-4">
              <div className="text-xs text-gray-500">Average Purchase Cost</div>
              <div className="mt-1 font-bold text-gray-900 tabular-nums">{formatCurrency(investedAmount)}</div>
            </div>
            <div className="rounded-xl border border-gray-200 p-4">
              <div className="text-xs text-gray-500">Unrealized Profit</div>
              <div className={`mt-1 font-bold tabular-nums ${profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {profit >= 0 ? '+' : '-'}{formatCurrency(Math.abs(profit))}
              </div>
            </div>
            <div className="rounded-xl border border-gray-200 p-4">
              <div className="text-xs text-gray-500">Simple Return</div>
              <div className={`mt-1 font-bold tabular-nums ${returnPct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {returnPct >= 0 ? '+' : ''}{returnPct.toFixed(2)}%
              </div>
            </div>

            <div className="md:col-span-3 rounded-xl border border-gray-200 p-4">
              <div className="text-sm font-bold text-gray-900">Recent Updates</div>
              <div className="mt-2 text-sm text-gray-600">
                {Array.isArray(meta.history) && meta.history.length > 0
                  ? 'Updates are recorded. (Full list UI coming next)'
                  : 'No history yet.'}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'zakat' && (
          <div className="mt-6 rounded-xl border border-gray-200 p-4 text-sm text-gray-600">
            Zakat module (Hijri yearly breakdown + asset-type base %) is the next step.
          </div>
        )}

        {activeTab === 'stats' && (
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-gray-200 p-4">
              <div className="text-xs text-gray-500">Portfolio Name</div>
              <div className="mt-1 font-bold text-gray-900">{inv.name}</div>
            </div>
            <div className="rounded-xl border border-gray-200 p-4">
              <div className="text-xs text-gray-500">Platform</div>
              <div className="mt-1 font-bold text-gray-900">{inv.account?.name}</div>
            </div>
          </div>
        )}
      </div>

      {showEditForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-900">Edit SIP Portfolio</h2>
              <button onClick={() => setShowEditForm(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <SIPForm
              onSubmit={handleEdit}
              onCancel={() => setShowEditForm(false)}
              isLoading={isLoading}
              initialData={{
                accountId: inv.account?.id,
                name: inv.name,
                totalAmount: Number(meta.totalAmount || 0),
                startDate: new Date(inv.startDate).toISOString().split('T')[0],
                notes: inv.notes || '',
              }}
            />
          </div>
        </div>
      )}

      {showValueForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-900">Update Current Value</h2>
              <button onClick={() => setShowValueForm(false)} className="text-gray-400 hover:text-gray-600">✕</button>
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
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
