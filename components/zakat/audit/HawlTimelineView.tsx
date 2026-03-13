'use client'

import { motion } from 'framer-motion'
import { formatCurrencyAmount, type DisplayCurrency } from '@/lib/currency'

type TimelineItem = {
  id: string
  source: string
  haulStart: string
  haulEnd: string
  status: 'paid' | 'due' | 'upcoming'
  zakatAmount: number
  nextDueDate: string | null
}

type HawlTimelineViewProps = {
  items: TimelineItem[]
  displayCurrency: DisplayCurrency
}

export function HawlTimelineView({ items, displayCurrency }: HawlTimelineViewProps) {
  const money = (val: number) => formatCurrencyAmount(val, displayCurrency, 'SAR')
  const today = new Date()

  const getProgress = (start: string, end: string) => {
    const startDate = new Date(start)
    const endDate = new Date(end)
    const total = endDate.getTime() - startDate.getTime()
    const elapsed = today.getTime() - startDate.getTime()
    return Math.min(100, Math.max(0, (elapsed / total) * 100))
  }

  const getStatusColor = (status: 'paid' | 'due' | 'upcoming') => {
    switch (status) {
      case 'paid':
        return 'bg-emerald-500'
      case 'due':
        return 'bg-amber-500'
      case 'upcoming':
        return 'bg-slate-400'
    }
  }

  const getStatusLabel = (status: 'paid' | 'due' | 'upcoming') => {
    switch (status) {
      case 'paid':
        return '✅ Paid'
      case 'due':
        return '⏰ Due Now'
      case 'upcoming':
        return '⏳ Upcoming'
    }
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
        No hawl timeline data available
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-slate-900 dark:text-white">Hawl Timeline View</h2>
      <div className="space-y-6">
        {items.map((item, index) => {
          const progress = getProgress(item.haulStart, item.haulEnd)
          const statusColor = getStatusColor(item.status)

          return (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800"
            >
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white">{item.source}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {item.haulStart} → {item.haulEnd}
                  </p>
                </div>
                <div className="text-right">
                  <span
                    className={`inline-block rounded-full px-3 py-1 text-xs font-semibold text-white ${statusColor}`}
                  >
                    {getStatusLabel(item.status)}
                  </span>
                  <p className="mt-1 text-sm font-bold text-slate-900 dark:text-white">
                    {money(item.zakatAmount)}
                  </p>
                </div>
              </div>

              {/* Timeline bar */}
              <div className="relative h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.5, delay: index * 0.05 }}
                  className={`h-full ${statusColor}`}
                />
                {/* Today marker */}
                {progress > 0 && progress < 100 && (
                  <div
                    className="absolute top-0 h-full w-1 bg-slate-900 dark:bg-white"
                    style={{ left: `${progress}%` }}
                  >
                    <div className="absolute -top-1 left-1/2 -translate-x-1/2 text-xs font-bold text-slate-900 dark:text-white">
                      ↓
                    </div>
                  </div>
                )}
              </div>

              {item.nextDueDate && item.status !== 'paid' && (
                <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                  Next due: <span className="font-semibold">{item.nextDueDate}</span>
                </p>
              )}
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
