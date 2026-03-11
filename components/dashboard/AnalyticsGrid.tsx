'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { animate, motion, useMotionValue, useTransform } from 'framer-motion'
import { Responsive } from 'react-grid-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { formatDisplayDate } from '@/lib/date'

const ResponsiveAny = Responsive as any

type RglLayouts = Record<string, any[]>

type SeriesPoint = { label: string; value: number }
type TypeBreakdown = { type: string; invested: number; value: number; count: number }
type ActivityItem = {
  id: string
  date: string
  type: string
  amount: number
  description: string | null
  investmentName: string | null
  accountType: string | null
}

type WidgetKey = 'kpis' | 'cashflow' | 'trend' | 'allocation' | 'activity'

type Widget = {
  key: WidgetKey
  title: string
  description?: string
}

function AnimatedNumber({ value }: { value: number }) {
  const mv = useMotionValue(0)
  const rounded = useTransform(mv, (v) => Math.round(v))
  const [text, setText] = useState('0')

  useEffect(() => {
    const controls = animate(mv, Number.isFinite(value) ? value : 0, {
      duration: 0.8,
      ease: 'easeOut',
    })
    const unsub = rounded.on('change', (v) => setText(String(v)))
    return () => {
      controls.stop()
      unsub()
    }
  }, [mv, rounded, value])

  return <span>{Number(text).toLocaleString()}</span>
}

export function AnalyticsGrid({
  storageKey = 'dashboard:analytics-layout:v1',
  selectedYear,
  totalInvested,
  portfolioValue,
  yearlyReturnValue,
  monthlyCashflow,
  monthlyPortfolioValue,
  typeBreakdowns,
  activity,
}: {
  storageKey?: string
  selectedYear: number
  totalInvested: number
  portfolioValue: number
  yearlyReturnValue: number
  monthlyCashflow: SeriesPoint[]
  monthlyPortfolioValue: SeriesPoint[]
  typeBreakdowns: TypeBreakdown[]
  activity: ActivityItem[]
}) {
  const widgets = useMemo<Widget[]>(
    () => [
      { key: 'kpis', title: 'Analytics KPIs', description: `Snapshot • ${selectedYear}` },
      { key: 'cashflow', title: 'Cashflow', description: 'Monthly net' },
      { key: 'trend', title: 'Portfolio Trend', description: 'Monthly total value' },
      { key: 'allocation', title: 'Allocation', description: 'By investment type' },
      { key: 'activity', title: 'Activity Feed', description: 'Latest events' },
    ],
    [selectedYear]
  )

  const defaultLayouts = useMemo<RglLayouts>(() => {
    const lg: any[] = [
      { i: 'kpis', x: 0, y: 0, w: 6, h: 4 },
      { i: 'cashflow', x: 6, y: 0, w: 6, h: 4 },
      { i: 'trend', x: 0, y: 4, w: 6, h: 4 },
      { i: 'allocation', x: 6, y: 4, w: 6, h: 4 },
      { i: 'activity', x: 0, y: 8, w: 12, h: 5 },
    ]

    const md: any[] = [
      { i: 'kpis', x: 0, y: 0, w: 6, h: 4 },
      { i: 'cashflow', x: 6, y: 0, w: 6, h: 4 },
      { i: 'trend', x: 0, y: 4, w: 12, h: 4 },
      { i: 'allocation', x: 0, y: 8, w: 12, h: 4 },
      { i: 'activity', x: 0, y: 12, w: 12, h: 5 },
    ]

    const sm: any[] = [
      { i: 'kpis', x: 0, y: 0, w: 6, h: 4 },
      { i: 'cashflow', x: 0, y: 4, w: 6, h: 4 },
      { i: 'trend', x: 0, y: 8, w: 6, h: 4 },
      { i: 'allocation', x: 0, y: 12, w: 6, h: 4 },
      { i: 'activity', x: 0, y: 16, w: 6, h: 6 },
    ]

    return { lg, md, sm, xs: sm, xxs: sm }
  }, [])

  const [layouts, setLayouts] = useState<RglLayouts>(defaultLayouts)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [containerWidth, setContainerWidth] = useState<number>(0)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const update = () => {
      const next = Math.round(el.getBoundingClientRect().width)
      setContainerWidth((prev) => (prev !== next ? next : prev))
    }

    update()

    if (typeof ResizeObserver === 'undefined') {
      const id = window.setInterval(update, 500)
      return () => window.clearInterval(id)
    }

    const ro = new ResizeObserver(() => update())
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (!raw) return
      const parsed = JSON.parse(raw) as RglLayouts
      if (parsed && typeof parsed === 'object') {
        setLayouts(parsed)
      }
    } catch {
      // ignore
    }
  }, [storageKey])

  const onLayoutsChange = (_current: any[], all: RglLayouts) => {
    setLayouts(all)
    try {
      localStorage.setItem(storageKey, JSON.stringify(all))
    } catch {
      // ignore
    }
  }

  const onLayoutChangeAny = (_layout: any, all: any) => {
    onLayoutsChange(Array.isArray(_layout) ? _layout : [], all as RglLayouts)
  }

  const formatMoney = (n: number) => `SAR ${Math.round(n).toLocaleString()}`

  const formatCompact = (n: number) => {
    const abs = Math.abs(n)
    if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`
    if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
    if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}K`
    return `${Math.round(n)}`
  }

  const MiniBar = ({ points }: { points: SeriesPoint[] }) => {
    const values = points.map((p) => p.value)
    const maxAbs = Math.max(1, ...values.map((v) => Math.abs(v)))
    return (
      <div className="grid grid-cols-12 gap-1 items-end h-24">
        {points.map((p) => {
          const raw = p.value
          const h = Math.max(2, Math.round((Math.abs(raw) / maxAbs) * 100))
          const color = raw >= 0 ? 'bg-emerald-500' : 'bg-red-500'
          return (
            <div key={p.label} className="col-span-1 flex flex-col items-center gap-1">
              <motion.div
                className={`w-full rounded-sm ${color}`}
                style={{ height: `${h}%` }}
                title={`${p.label}: ${p.value}`}
                initial={{ height: '2%' }}
                animate={{ height: `${h}%` }}
                transition={{ type: 'spring', stiffness: 220, damping: 26 }}
              />
              <div className="text-[10px] text-gray-400 leading-none">{p.label}</div>
            </div>
          )
        })}
      </div>
    )
  }

  const MiniLine = ({ points }: { points: SeriesPoint[] }) => {
    const values = points.map((p) => p.value)
    const min = Math.min(...values)
    const max = Math.max(...values)
    const w = 420
    const h = 110
    const pad = 8
    const span = Math.max(1e-9, max - min)

    const scaleX = (i: number) => {
      if (points.length <= 1) return pad
      return pad + (i / (points.length - 1)) * (w - pad * 2)
    }
    const scaleY = (v: number) => {
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

    return (
      <div className="w-full">
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-24">
          <motion.path
            d={d}
            fill="none"
            stroke="#0f172a"
            strokeWidth="2"
            initial={{ pathLength: 0, opacity: 0.4 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.9, ease: 'easeInOut' }}
          />
        </svg>
        <div className="flex justify-between text-[11px] text-gray-400 -mt-1">
          <span>{formatCompact(min)}</span>
          <span>{formatCompact(max)}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3" ref={containerRef}>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-gray-900">Analytics</div>
          <div className="text-[11px] text-gray-400">Drag to move • Resize from bottom-right • Layout saves automatically</div>
        </div>
      </div>

      {containerWidth > 0 && (
      <ResponsiveAny
        className="analytics-grid"
        layouts={layouts}
        width={containerWidth}
        breakpoints={{ lg: 1200, md: 996, sm: 640, xs: 480, xxs: 0 }}
        cols={{ lg: 12, md: 12, sm: 6, xs: 6, xxs: 6 }}
        rowHeight={32}
        margin={[12, 12]}
        containerPadding={[0, 0]}
        onLayoutChange={onLayoutChangeAny as any}
        isResizable
        isDraggable
        draggableHandle="[data-drag-handle]"
        useCSSTransforms
        compactType="vertical"
        preventCollision={false}
      >
        {widgets.map((w, idx) => (
          <div key={w.key} className="h-full">
            <motion.div
              initial={{ opacity: 0, y: 18, scale: 0.985, filter: 'blur(8px)' }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
              transition={{ type: 'spring', stiffness: 260, damping: 22, delay: Math.min(0.25, idx * 0.06) }}
              whileHover={{ y: -8, scale: 1.01 }}
              className="h-full"
            >
              <Card className="group relative h-full p-0 overflow-hidden">
                <motion.div
                  className="pointer-events-none absolute -inset-10 blur-2xl"
                  style={{ background: 'radial-gradient(circle at 30% 10%, rgba(59,130,246,0.26), transparent 55%), radial-gradient(circle at 70% 60%, rgba(16,185,129,0.22), transparent 55%)' }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.12 }}
                  whileHover={{ opacity: 0.38 }}
                  transition={{ duration: 0.25 }}
                />
                <motion.div
                  className="pointer-events-none absolute inset-0"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2 }}
                />
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle className="text-sm font-bold text-gray-800 truncate">{w.title}</CardTitle>
                      {w.description && <div className="text-[11px] text-gray-400 truncate">{w.description}</div>}
                    </div>
                    <button
                      type="button"
                      data-drag-handle
                      className="rounded-md border border-gray-200 bg-white/70 px-2 py-1 text-[11px] text-gray-600 hover:bg-gray-50 active:scale-[0.98] transition"
                      aria-label={`Drag ${w.title}`}
                      title="Drag"
                    >
                      Move
                    </button>
                  </div>
                </CardHeader>
                <CardContent className="p-4 pt-2 h-[calc(100%-56px)]">
                  {w.key === 'kpis' && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg bg-gray-50 p-3">
                        <div className="text-[11px] text-gray-400">Total Invested</div>
                        <div className="text-base font-semibold tabular-nums text-gray-900">SAR <AnimatedNumber value={Math.round(totalInvested)} /></div>
                      </div>
                      <div className="rounded-lg bg-gray-50 p-3">
                        <div className="text-[11px] text-gray-400">Portfolio Value</div>
                        <div className="text-base font-semibold tabular-nums text-gray-900">SAR <AnimatedNumber value={Math.round(portfolioValue)} /></div>
                      </div>
                      <div className="rounded-lg bg-gray-50 p-3">
                        <div className="text-[11px] text-gray-400">Yearly Return</div>
                        <div className="text-base font-semibold tabular-nums text-emerald-600">SAR <AnimatedNumber value={Math.round(yearlyReturnValue)} /></div>
                      </div>
                      <div className="rounded-lg bg-gray-50 p-3">
                        <div className="text-[11px] text-gray-400">Year</div>
                        <div className="text-base font-semibold tabular-nums text-gray-900">{selectedYear}</div>
                      </div>
                    </div>
                  )}

                  {w.key === 'cashflow' && (
                    <div className="space-y-2">
                      <MiniBar points={monthlyCashflow} />
                      <div className="flex items-center justify-between text-[11px] text-gray-400">
                        <span>Net</span>
                        <span className="tabular-nums">{formatCompact(monthlyCashflow.reduce((s, p) => s + (Number(p.value) || 0), 0))}</span>
                      </div>
                    </div>
                  )}

                  {w.key === 'trend' && (
                    <MiniLine points={monthlyPortfolioValue} />
                  )}

                  {w.key === 'allocation' && (
                    <div className="space-y-2">
                      {typeBreakdowns.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-sm text-gray-400">No data</div>
                      ) : (
                        typeBreakdowns.slice(0, 6).map((t) => {
                          const total = typeBreakdowns.reduce((s, x) => s + (Number(x.value) || 0), 0)
                          const pct = total > 0 ? (t.value / total) * 100 : 0
                          return (
                            <div key={t.type} className="space-y-1">
                              <div className="flex items-center justify-between text-[11px]">
                                <div className="font-medium text-gray-700">{t.type}</div>
                                <div className="text-gray-400 tabular-nums">SAR {Math.round(t.value).toLocaleString()} ({pct.toFixed(1)}%)</div>
                              </div>
                              <div className="h-2 w-full bg-gray-100 rounded">
                                <div className="h-2 bg-slate-800 rounded" style={{ width: `${Math.max(1, Math.min(100, pct))}%` }} />
                              </div>
                            </div>
                          )
                        })
                      )}
                    </div>
                  )}

                  {w.key === 'activity' && (
                    <div className="space-y-2 overflow-auto h-full pr-1">
                      {activity.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-sm text-gray-400">No recent activity</div>
                      ) : (
                        activity.map((a) => {
                          const dateLabel = formatDisplayDate(a.date, a.date)
                          const amt = Number(a.amount) || 0
                          const amtClass = amt >= 0 ? 'text-emerald-600' : 'text-red-600'
                          return (
                            <div key={a.id} className="flex items-start justify-between gap-3 rounded-lg bg-gray-50 p-3">
                              <div className="min-w-0">
                                <div className="text-[11px] text-gray-400">{dateLabel}</div>
                                <div className="text-sm font-semibold text-gray-900 truncate">{a.investmentName || a.accountType || a.type}</div>
                                <div className="text-[11px] text-gray-400 truncate">{a.description || a.type}</div>
                              </div>
                              <div className={`text-sm font-semibold tabular-nums ${amtClass}`}>SAR {Math.abs(amt).toLocaleString()}</div>
                            </div>
                          )
                        })
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </div>
        ))}
      </ResponsiveAny>
      )}
    </div>
  )
}
