'use client'

import { useMemo } from 'react'

export interface TimelineItem {
  id: string
  source: string
  sourceType: string
  haulStart: string
  haulEnd: string
  status: 'paid' | 'due' | 'upcoming'
  zakatAmount: number
  balance: number
  rowKind?: string
  nextDueDate: string | null
}

interface HawlTimelineProps {
  items: TimelineItem[]
  money: (v: number) => string
}

const statusColors = {
  paid: { bar: 'bg-emerald-500', track: 'bg-emerald-500/20', text: 'text-emerald-300', label: 'Paid' },
  due: { bar: 'bg-amber-500', track: 'bg-amber-500/20', text: 'text-amber-300', label: 'Due Now' },
  upcoming: { bar: 'bg-slate-500', track: 'bg-slate-500/20', text: 'text-slate-400', label: 'Upcoming' },
}

const kindBadge: Record<string, { bg: string; text: string }> = {
  PROFIT: { bg: 'bg-purple-500/20', text: 'text-purple-300' },
  PRINCIPAL: { bg: 'bg-blue-500/20', text: 'text-blue-300' },
  COMMISSION: { bg: 'bg-cyan-500/20', text: 'text-cyan-300' },
  IDLE: { bg: 'bg-slate-500/20', text: 'text-slate-400' },
  RECEIPT: { bg: 'bg-amber-500/20', text: 'text-amber-300' },
  REWARD: { bg: 'bg-pink-500/20', text: 'text-pink-300' },
}

export function HawlTimeline({ items, money }: HawlTimelineProps) {
  const grouped = useMemo(() => {
    const map = new Map<string, TimelineItem[]>()
    for (const item of items) {
      const key = item.source || 'General'
      const list = map.get(key) || []
      list.push(item)
      map.set(key, list)
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [items])

  const now = useMemo(() => new Date(), [])

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-slate-700/40 bg-slate-900/40 p-6 text-center">
        <p className="text-sm text-slate-400">No hawl timeline data available.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold text-slate-100">Hawl Timeline</h3>

      <div className="space-y-6">
        {grouped.map(([source, sourceItems]) => (
          <div key={source} className="rounded-xl border border-slate-700/40 bg-slate-900/40 overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-800/50 border-b border-slate-700/40">
              <span className="text-xs font-semibold text-slate-300">{source}</span>
              <span className="text-[10px] text-slate-500 ml-2">({sourceItems.length} period{sourceItems.length !== 1 ? 's' : ''})</span>
            </div>

            <div className="p-4 space-y-3">
              {sourceItems.map(item => {
                const sc = statusColors[item.status]
                const start = new Date(item.haulStart)
                const end = new Date(item.haulEnd)
                const totalMs = end.getTime() - start.getTime()
                const elapsedMs = now.getTime() - start.getTime()
                const progress = totalMs > 0 ? Math.max(0, Math.min(100, (elapsedMs / totalMs) * 100)) : 0
                const kb = item.rowKind ? kindBadge[item.rowKind] || kindBadge.IDLE : null

                return (
                  <div key={item.id} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${sc.text}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${sc.bar}`} />
                          {sc.label}
                        </span>
                        {kb && (
                          <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${kb.bg} ${kb.text}`}>
                            {item.rowKind}
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-semibold tabular-nums text-slate-300">
                        {money(item.zakatAmount)}
                      </span>
                    </div>

                    <div className="relative">
                      <div className={`h-6 rounded-full ${sc.track} overflow-hidden relative`}>
                        <div
                          className={`h-full rounded-full ${sc.bar} transition-all duration-500`}
                          style={{ width: `${item.status === 'paid' ? 100 : progress}%` }}
                        />
                        {item.status !== 'paid' && progress > 0 && progress < 100 && (
                          <div
                            className="absolute top-0 h-full w-0.5 bg-white/80 z-10"
                            style={{ left: `${progress}%` }}
                            title={`Today: ${now.toISOString().split('T')[0]}`}
                          >
                            <div className="absolute -top-1 -left-1 h-2 w-2 rounded-full bg-white shadow-md" />
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-500 tabular-nums">
                      <span>{item.haulStart}</span>
                      <span>
                        {item.status === 'upcoming' && item.nextDueDate
                          ? `Due: ${item.nextDueDate}`
                          : `Balance: ${money(item.balance)}`
                        }
                      </span>
                      <span>{item.haulEnd}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
