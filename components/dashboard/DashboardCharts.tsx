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
    <div className="relative">
      <div className="pointer-events-none absolute inset-0 grid grid-rows-4 gap-0">
        {Array.from({ length: 4 }).map((_, idx) => (
          <div key={idx} className="border-b border-slate-700/40" />
        ))}
      </div>
      <div className="grid grid-cols-12 gap-1 items-end h-28">
        {points.map((p) => {
          const raw = positiveOnly ? Math.max(0, p.value) : p.value
          const h = Math.max(2, Math.round((Math.abs(raw) / maxAbs) * 100))
          const color = raw >= 0
            ? 'bg-gradient-to-t from-emerald-500/60 to-cyan-400/80'
            : 'bg-gradient-to-t from-rose-600/70 to-rose-400/80'

          return (
            <div key={p.label} className="col-span-1 flex flex-col items-center gap-1">
              <div className="w-full h-full rounded-md bg-slate-800/30 border border-slate-700/40 p-[1px]">
                <div
                  className={`w-full rounded-sm transition-all duration-700 ${color}`}
                  style={{ height: `${h}%`, marginTop: `${100 - h}%` }}
                  title={`${p.label}: ${p.value.toLocaleString()}`}
                />
              </div>
              <div className="text-[10px] text-slate-400 leading-none">{p.label}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SimpleLineChart({ points }: { points: SeriesPoint[] }) {
  const { min, max, path, areaPath, coords, w, h, pad } = useMemo(() => {
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

    const coords = points.map((p, i) => ({ x: scaleX(i), y: scaleY(p.value) }))

    const d = coords
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(' ')

    const areaPath = coords.length > 0
      ? `${d} L ${coords[coords.length - 1].x.toFixed(1)} ${(h - pad).toFixed(1)} L ${coords[0].x.toFixed(1)} ${(h - pad).toFixed(1)} Z`
      : ''

    return { min, max, path: d, areaPath, coords, w, h, pad }
  }, [points])

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-28">
        <defs>
          <linearGradient id="dashboard-line-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="dashboard-line-stroke" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="100%" stopColor="#60a5fa" />
          </linearGradient>
        </defs>

        {Array.from({ length: 4 }).map((_, idx) => {
          const y = pad + ((h - pad * 2) / 3) * idx
          return <line key={idx} x1={pad} y1={y} x2={w - pad} y2={y} stroke="#334155" strokeOpacity="0.35" />
        })}

        {areaPath && <path d={areaPath} fill="url(#dashboard-line-gradient)" />}
        <path d={path} fill="none" stroke="url(#dashboard-line-stroke)" strokeWidth="2.5" />
        {coords.map((p, idx) => (
          <circle key={idx} cx={p.x} cy={p.y} r="2.5" fill="#38bdf8" />
        ))}
      </svg>
      <div className="flex justify-between text-[11px] text-slate-400 -mt-1">
        <span>{formatCompact(min)}</span>
        <span>{formatCompact(max)}</span>
      </div>
      <div className="grid grid-cols-12 gap-1 mt-1">
        {points.map((p) => (
          <div key={p.label} className="text-[10px] text-slate-400 text-center leading-none">
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
      <Card className="border border-slate-700/40 bg-slate-900/40">
        <CardHeader>
          <CardTitle className="text-sm font-bold text-slate-200">Monthly Cashflow ({selectedYear})</CardTitle>
        </CardHeader>
        <CardContent>
          <SimpleBarChart points={monthlyCashflow} />
        </CardContent>
      </Card>

      <Card className="border border-slate-700/40 bg-slate-900/40">
        <CardHeader>
          <CardTitle className="text-sm font-bold text-slate-200">Portfolio Value Trend ({selectedYear})</CardTitle>
        </CardHeader>
        <CardContent>
          <SimpleLineChart points={monthlyPortfolioValue} />
        </CardContent>
      </Card>

      <Card className="border border-slate-700/40 bg-slate-900/40">
        <CardHeader>
          <CardTitle className="text-sm font-bold text-slate-200">Allocation ({selectedYear})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {allocation.sorted.length === 0 ? (
              <div className="text-sm text-slate-400">No data</div>
            ) : (
              allocation.sorted.map((t) => {
                const pct = allocation.total > 0 ? (t.value / allocation.total) * 100 : 0
                return (
                  <div key={t.type} className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <div className="font-medium text-slate-200">{t.type}</div>
                      <div className="text-slate-400 tabular-nums">SAR {t.value.toLocaleString()} ({pct.toFixed(1)}%)</div>
                    </div>
                    <div className="h-2 w-full bg-slate-800/50 rounded">
                      <div
                        className="h-2 rounded bg-gradient-to-r from-sky-500 to-cyan-400 transition-all duration-700"
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
