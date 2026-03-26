'use client'

import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
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
  const [hoveredBar, setHoveredBar] = useState<number | null>(null)
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
      <div className="grid grid-cols-12 gap-1 items-end h-28 relative">
        {points.map((p, idx) => {
          const raw = positiveOnly ? Math.max(0, p.value) : p.value
          const h = Math.max(2, Math.round((Math.abs(raw) / maxAbs) * 100))
          const color = raw >= 0
            ? 'bg-gradient-to-t from-emerald-500/60 to-cyan-400/80'
            : 'bg-gradient-to-t from-rose-600/70 to-rose-400/80'

          return (
            <div 
              key={p.label} 
              className="col-span-1 flex flex-col items-center gap-1 relative"
              onMouseEnter={() => setHoveredBar(idx)}
              onMouseLeave={() => setHoveredBar(null)}
            >
              <div className="w-full h-full rounded-md bg-slate-800/30 border border-slate-700/40 p-[1px] cursor-pointer">
                <motion.div
                  className={`w-full rounded-sm ${color}`}
                  style={{ height: `${h}%`, marginTop: `${100 - h}%` }}
                  animate={{
                    scale: hoveredBar === idx ? [1, 1.05, 1] : 1,
                  }}
                  transition={{
                    duration: 0.5,
                    repeat: hoveredBar === idx ? Infinity : 0,
                  }}
                />
              </div>
              <div className="text-[10px] text-slate-400 leading-none">{p.label}</div>
              
              {/* Tooltip */}
              <AnimatePresence>
                {hoveredBar === idx && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.8 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.8 }}
                    transition={{ duration: 0.2 }}
                    className="absolute bottom-full mb-2 pointer-events-none z-20"
                  >
                    <div className="relative">
                      <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/40 to-purple-500/40 blur-md rounded" />
                      <div className="relative bg-slate-900/95 backdrop-blur-xl border-2 border-cyan-400/50 rounded px-3 py-2 shadow-xl whitespace-nowrap">
                        <div className="text-xs font-bold text-cyan-400">{p.label}</div>
                        <div className="text-sm font-bold text-white tabular-nums">
                          {raw >= 0 ? '+' : ''}{formatCompact(raw)}
                        </div>
                      </div>
                      <div className="absolute left-1/2 -bottom-1 w-2 h-2 bg-slate-900 border-r-2 border-b-2 border-cyan-400/50 transform rotate-45 -translate-x-1/2" />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SimpleLineChart({ points }: { points: SeriesPoint[] }) {
  const [hoveredPoint, setHoveredPoint] = useState<number | null>(null)
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

    const coords = points.map((p, i) => ({ x: scaleX(i), y: scaleY(p.value), value: p.value, label: p.label }))

    const d = coords
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(' ')

    const areaPath = coords.length > 0
      ? `${d} L ${coords[coords.length - 1].x.toFixed(1)} ${(h - pad).toFixed(1)} L ${coords[0].x.toFixed(1)} ${(h - pad).toFixed(1)} Z`
      : ''

    return { min, max, path: d, areaPath, coords, w, h, pad }
  }, [points])

  return (
    <div className="w-full relative">
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
          <g 
            key={idx}
            onMouseEnter={() => setHoveredPoint(idx)}
            onMouseLeave={() => setHoveredPoint(null)}
            style={{ cursor: 'pointer' }}
          >
            <circle 
              cx={p.x} 
              cy={p.y} 
              r={hoveredPoint === idx ? "5" : "2.5"} 
              fill="#38bdf8"
              className="transition-all duration-200"
            />
            {hoveredPoint === idx && (
              <motion.circle
                cx={p.x}
                cy={p.y}
                r="8"
                fill="none"
                stroke="#38bdf8"
                strokeWidth="2"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: [1, 1.5, 1], opacity: [0.8, 0, 0.8] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
            )}
          </g>
        ))}
      </svg>
      
      {/* Interactive tooltip */}
      <AnimatePresence>
        {hoveredPoint !== null && coords[hoveredPoint] && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.8 }}
            transition={{ duration: 0.2 }}
            className="absolute pointer-events-none z-20"
            style={{
              left: `${(coords[hoveredPoint].x / w) * 100}%`,
              top: `${(coords[hoveredPoint].y / h) * 100}%`,
              transform: 'translate(-50%, -120%)',
            }}
          >
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/40 to-blue-500/40 blur-md rounded" />
              <div className="relative bg-slate-900/95 backdrop-blur-xl border-2 border-cyan-400/50 rounded px-3 py-2 shadow-xl whitespace-nowrap">
                <div className="text-xs font-bold text-cyan-400">{coords[hoveredPoint].label}</div>
                <div className="text-sm font-bold text-white tabular-nums">
                  {formatCompact(coords[hoveredPoint].value)}
                </div>
              </div>
              <div className="absolute left-1/2 -bottom-1 w-2 h-2 bg-slate-900 border-r-2 border-b-2 border-cyan-400/50 transform rotate-45 -translate-x-1/2" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
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
