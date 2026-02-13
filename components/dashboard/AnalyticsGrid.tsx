'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import ReactGridLayout, { Responsive } from 'react-grid-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'

const ResponsiveGridLayout = (ReactGridLayout as any).WidthProvider(Responsive)

type RglLayouts = Record<string, any[]>

type WidgetKey = 'kpis' | 'cashflow' | 'allocation' | 'notes'

type Widget = {
  key: WidgetKey
  title: string
  description?: string
}

export function AnalyticsGrid({
  storageKey = 'dashboard:analytics-layout:v1',
  selectedYear,
  totalInvested,
  portfolioValue,
  yearlyReturnValue,
}: {
  storageKey?: string
  selectedYear: number
  totalInvested: number
  portfolioValue: number
  yearlyReturnValue: number
}) {
  const widgets = useMemo<Widget[]>(
    () => [
      { key: 'kpis', title: 'Analytics KPIs', description: `Snapshot • ${selectedYear}` },
      { key: 'cashflow', title: 'Cashflow', description: 'Mini trend' },
      { key: 'allocation', title: 'Allocation', description: 'Top categories' },
      { key: 'notes', title: 'Notes', description: 'Pin reminders' },
    ],
    [selectedYear]
  )

  const defaultLayouts = useMemo<RglLayouts>(() => {
    const lg: any[] = [
      { i: 'kpis', x: 0, y: 0, w: 6, h: 4 },
      { i: 'cashflow', x: 6, y: 0, w: 6, h: 4 },
      { i: 'allocation', x: 0, y: 4, w: 7, h: 4 },
      { i: 'notes', x: 7, y: 4, w: 5, h: 4 },
    ]

    const md: any[] = [
      { i: 'kpis', x: 0, y: 0, w: 6, h: 4 },
      { i: 'cashflow', x: 6, y: 0, w: 6, h: 4 },
      { i: 'allocation', x: 0, y: 4, w: 12, h: 4 },
      { i: 'notes', x: 0, y: 8, w: 12, h: 4 },
    ]

    const sm: any[] = [
      { i: 'kpis', x: 0, y: 0, w: 6, h: 4 },
      { i: 'cashflow', x: 0, y: 4, w: 6, h: 4 },
      { i: 'allocation', x: 0, y: 8, w: 6, h: 4 },
      { i: 'notes', x: 0, y: 12, w: 6, h: 4 },
    ]

    return { lg, md, sm, xs: sm, xxs: sm }
  }, [])

  const [layouts, setLayouts] = useState<RglLayouts>(defaultLayouts)

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

  const formatMoney = (n: number) => `SAR ${Math.round(n).toLocaleString()}`

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-gray-900">Analytics</div>
          <div className="text-[11px] text-gray-400">Drag to move • Resize from bottom-right • Layout saves automatically</div>
        </div>
      </div>

      <ResponsiveGridLayout
        className="analytics-grid"
        layouts={layouts}
        breakpoints={{ lg: 1200, md: 996, sm: 640, xs: 480, xxs: 0 }}
        cols={{ lg: 12, md: 12, sm: 6, xs: 6, xxs: 6 }}
        rowHeight={32}
        margin={[12, 12]}
        containerPadding={[0, 0]}
        onLayoutChange={onLayoutsChange}
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
              initial={{ opacity: 0, y: 10, filter: 'blur(6px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              transition={{ type: 'spring', stiffness: 260, damping: 24, delay: Math.min(0.2, idx * 0.04) }}
              whileHover={{ y: -4 }}
              className="h-full"
            >
              <Card className="group relative h-full p-0 overflow-hidden">
                <div className="pointer-events-none absolute -inset-10 opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100" style={{ background: 'radial-gradient(circle at 30% 10%, rgba(59,130,246,0.20), transparent 55%), radial-gradient(circle at 70% 60%, rgba(16,185,129,0.18), transparent 55%)' }} />
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
                        <div className="text-base font-semibold tabular-nums text-gray-900">{formatMoney(totalInvested)}</div>
                      </div>
                      <div className="rounded-lg bg-gray-50 p-3">
                        <div className="text-[11px] text-gray-400">Portfolio Value</div>
                        <div className="text-base font-semibold tabular-nums text-gray-900">{formatMoney(portfolioValue)}</div>
                      </div>
                      <div className="rounded-lg bg-gray-50 p-3">
                        <div className="text-[11px] text-gray-400">Yearly Return</div>
                        <div className="text-base font-semibold tabular-nums text-emerald-600">{formatMoney(yearlyReturnValue)}</div>
                      </div>
                      <div className="rounded-lg bg-gray-50 p-3">
                        <div className="text-[11px] text-gray-400">Year</div>
                        <div className="text-base font-semibold tabular-nums text-gray-900">{selectedYear}</div>
                      </div>
                    </div>
                  )}

                  {w.key === 'cashflow' && (
                    <div className="h-full flex items-center justify-center text-sm text-gray-400">
                      Add a cashflow mini-chart here
                    </div>
                  )}

                  {w.key === 'allocation' && (
                    <div className="h-full flex items-center justify-center text-sm text-gray-400">
                      Add allocation breakdown here
                    </div>
                  )}

                  {w.key === 'notes' && (
                    <textarea
                      className="h-full w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-500"
                      placeholder="Type notes…"
                      onChange={(e) => {
                        try {
                          localStorage.setItem(`${storageKey}:notes`, e.target.value)
                        } catch {
                          // ignore
                        }
                      }}
                      defaultValue={(() => {
                        try {
                          return localStorage.getItem(`${storageKey}:notes`) || ''
                        } catch {
                          return ''
                        }
                      })()}
                    />
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </div>
        ))}
      </ResponsiveGridLayout>
    </div>
  )
}
