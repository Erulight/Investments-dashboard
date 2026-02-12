'use client'

import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'

type SeriesPoint = { label: string; value: number }

type TypeBreakdown = { type: string; invested: number; value: number; count: number }

function formatCompact(n: number) {
  const abs = Math.abs(n)
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return `${Math.round(n)}`
}

function SimpleBarChart({ points, positiveOnly }: { points: SeriesPoint[]; positiveOnly?: boolean }) {
  const { maxAbs } = useMemo(() => {
    const values = points.map((p) => (positiveOnly ? Math.max(0, p.value) : Math.abs(p.value)))
    const maxAbs = Math.max(1, ...values)
    return { maxAbs }
  }, [points, positiveOnly])

  return (
    <div className="grid grid-cols-12 gap-1 items-end h-28">
      {points.map((p) => {
        const raw = positiveOnly ? Math.max(0, p.value) : p.value
        const h = Math.max(2, Math.round((Math.abs(raw) / maxAbs) * 100))
        const color = raw >= 0 ? 'bg-emerald-500' : 'bg-red-500'
        return (
          <div key={p.label} className="col-span-1 flex flex-col items-center gap-1">
            <div className={`w-full rounded-sm ${color}`} style={{ height: `${h}%` }} title={`${p.label}: ${p.value}`} />
            <div className="text-[10px] text-gray-400 leading-none">{p.label}</div>
          </div>
        )
      })}
    </div>
  )
}

function SimpleLineChart({ points }: { points: SeriesPoint[] }) {
  const { min, max, path, w, h } = useMemo(() => {
    const values = points.map((p) => p.value)
    const min = Math.min(...values)
    const max = Math.max(...values)
    const w = 420
    const h = 120
    const pad = 8

    const scaleX = (i: number) => {
      if (points.length <= 1) return pad
      return pad + (i / (points.length - 1)) * (w - pad * 2)
    }

    const scaleY = (v: number) => {
      const span = Math.max(1e-9, max - min)
      const t = (v - min) / span
      return pad + (1 - t) * (h - pad * 2)
    }

    const d = points
      .map((p, i) => {
        const x = scaleX(i)
        const y = scaleY(p.value)
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
      })
      .join(' ')

    return { min, max, path: d, w, h }
  }, [points])

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-28">
        <path d={path} fill="none" stroke="#0f172a" strokeWidth="2" />
      </svg>
      <div className="flex justify-between text-[11px] text-gray-400 -mt-1">
        <span>{formatCompact(min)}</span>
        <span>{formatCompact(max)}</span>
      </div>
      <div className="grid grid-cols-12 gap-1 mt-1">
        {points.map((p) => (
          <div key={p.label} className="text-[10px] text-gray-400 text-center leading-none">
            {p.label}
          </div>
        ))}
      </div>
    </div>
  )
}

export function DashboardCharts({
  selectedYear,
  monthlyCashflow,
  monthlyPortfolioValue,
  typeBreakdowns,
}: {
  selectedYear: number
  monthlyCashflow: SeriesPoint[]
  monthlyPortfolioValue: SeriesPoint[]
  typeBreakdowns: TypeBreakdown[]
}) {
  const allocation = useMemo(() => {
    const total = typeBreakdowns.reduce((s, t) => s + t.value, 0)
    const sorted = [...typeBreakdowns].sort((a, b) => b.value - a.value)
    return { total, sorted }
  }, [typeBreakdowns])

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-bold text-gray-800">Monthly Cashflow ({selectedYear})</CardTitle>
        </CardHeader>
        <CardContent>
          <SimpleBarChart points={monthlyCashflow} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-bold text-gray-800">Portfolio Value Trend ({selectedYear})</CardTitle>
        </CardHeader>
        <CardContent>
          <SimpleLineChart points={monthlyPortfolioValue} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-bold text-gray-800">Allocation ({selectedYear})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {allocation.sorted.length === 0 ? (
              <div className="text-sm text-gray-400">No data</div>
            ) : (
              allocation.sorted.map((t) => {
                const pct = allocation.total > 0 ? (t.value / allocation.total) * 100 : 0
                return (
                  <div key={t.type} className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <div className="font-medium text-gray-700">{t.type}</div>
                      <div className="text-gray-400 tabular-nums">SAR {t.value.toLocaleString()} ({pct.toFixed(1)}%)</div>
                    </div>
                    <div className="h-2 w-full bg-gray-100 rounded">
                      <div
                        className="h-2 bg-slate-800 rounded"
                        style={{ width: `${Math.max(1, Math.min(100, pct))}%` }}
                      />
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
