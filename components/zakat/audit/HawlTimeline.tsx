'use client'

import { useMemo } from 'react'
import { Card } from '@/components/ui/Card'

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

const sc = {
  paid: { bar: 'bg-emerald-500', track: 'bg-emerald-500/15', text: 'text-emerald-300', label: 'Paid' },
  due: { bar: 'bg-amber-500', track: 'bg-amber-500/15', text: 'text-amber-300', label: 'Due' },
  upcoming: { bar: 'bg-slate-500', track: 'bg-slate-500/15', text: 'text-slate-400', label: 'Upcoming' },
}

const kindColors: Record<string, string> = {
  PROFIT: 'bg-emerald-500/15 text-emerald-300',
  PRINCIPAL: 'bg-sky-500/15 text-sky-300',
  COMMISSION: 'bg-blue-500/15 text-blue-300',
  IDLE: 'bg-amber-500/15 text-amber-300',
  RECEIPT: 'bg-teal-500/15 text-teal-300',
  REWARD: 'bg-violet-500/15 text-violet-300',
}

export function HawlTimeline({ items, money }: HawlTimelineProps) {
  const grouped = useMemo(() => {
    const map = new Map<string, TimelineItem[]>()
    for (const item of items) {
      const key = item.source || 'General'
      const arr = map.get(key) || []
      arr.push(item)
      map.set(key, arr)
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [items])

  const now = useMemo(() => new Date(), [])

  if (items.length === 0) {
    return <Card><p className="text-sm text-slate-400 text-center py-4">No hawl timeline data available.</p></Card>
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-200 mb-1">Hawl Timeline</h3>

      {grouped.map(([source, sourceItems]) => (
        <Card key={source} className="!p-0 overflow-hidden">
          <div className="px-5 py-3 border-b border-white/5 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300">{source}</span>
            <span className="text-[10px] text-slate-500">{sourceItems.length} period{sourceItems.length !== 1 ? 's' : ''}</span>
          </div>

          <div className="px-5 py-4 space-y-4">
            {sourceItems.map(item => {
              const s = sc[item.status]
              const start = new Date(item.haulStart)
              const end = new Date(item.haulEnd)
              const totalMs = end.getTime() - start.getTime()
              const elapsedMs = now.getTime() - start.getTime()
              const progress = totalMs > 0 ? Math.max(0, Math.min(100, (elapsedMs / totalMs) * 100)) : 0
              const kc = item.rowKind ? kindColors[item.rowKind] || kindColors.IDLE : null

              return (
                <div key={item.id} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${s.text}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${s.bar}`} />
                        {s.label}
                      </span>
                      {kc && (
                        <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${kc}`}>
                          {item.rowKind}
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-semibold tabular-nums text-[#c9a84c]">{money(item.zakatAmount)}</span>
                  </div>

                  <div className="relative">
                    <div className={`h-5 rounded-full ${s.track} overflow-hidden relative`}>
                      <div
                        className={`h-full rounded-full ${s.bar} transition-all duration-500 ease-out`}
                        style={{ width: `${item.status === 'paid' ? 100 : progress}%` }}
                      />
                      {item.status !== 'paid' && progress > 0 && progress < 100 && (
                        <div
                          className="absolute top-0 h-full w-0.5 bg-white/70"
                          style={{ left: `${progress}%` }}
                        >
                          <div className="absolute -top-0.5 -left-[3px] h-2 w-2 rounded-full bg-white shadow" />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-slate-500 tabular-nums">
                    <span>{item.haulStart}</span>
                    <span>{item.status === 'upcoming' && item.nextDueDate ? `Due: ${item.nextDueDate}` : `Bal: ${money(item.balance)}`}</span>
                    <span>{item.haulEnd}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      ))}
    </div>
  )
}
