'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Modal } from '@/components/sukuk/SukukModal'
import { formatDisplayDate } from '@/lib/date'

type DealDetail = {
  id: string
  name: string
  maturityDate: Date
  receivable: number
}

type YearPoint = {
  year: number
  amount: number
  deals?: DealDetail[]
}

export function ReceivableByYearCard({
  data,
  currencyPrefix = 'SAR',
}: {
  data: YearPoint[]
  currencyPrefix?: string
}) {
  const safe = Array.isArray(data) ? data : []
  const maxAmount = safe.reduce((m, x) => Math.max(m, Number(x.amount) || 0), 0)
  const [selectedYear, setSelectedYear] = useState<YearPoint | null>(null)

  const getMonthlyBreakdown = (yearData: YearPoint) => {
    if (!yearData.deals) return []
    const monthMap = new Map<number, DealDetail[]>()
    for (const deal of yearData.deals) {
      const maturity = deal.maturityDate instanceof Date ? deal.maturityDate : new Date(deal.maturityDate)
      const month = maturity.getMonth()
      const existing = monthMap.get(month) || []
      existing.push(deal)
      monthMap.set(month, existing)
    }
    return Array.from(monthMap.entries())
      .map(([month, deals]) => ({ month, deals }))
      .sort((a, b) => a.month - b.month)
  }

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

  return (
    <>
      <Card className="border-slate-700/40 bg-slate-900/40 rounded-xl shadow-md">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-bold text-slate-200">Receivable by Year</CardTitle>
        </CardHeader>
        <CardContent>
          {safe.length === 0 ? (
            <div className="text-xs text-slate-500">No receivable data.</div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {safe.map((point) => {
                const amount = Math.max(0, Number(point.amount) || 0)
                const pct = maxAmount > 0 ? (amount / maxAmount) * 100 : 0
                return (
                  <button
                    key={point.year}
                    onClick={() => setSelectedYear(point)}
                    className="rounded-lg border border-slate-700/40 bg-slate-800/30 px-3 py-3 transition-all hover:border-emerald-500/50 hover:bg-slate-800/50 cursor-pointer"
                  >
                    <div className="text-xs font-semibold text-slate-300 tabular-nums">
                      {amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currencyPrefix}
                    </div>
                    <div className="mt-2 h-24 w-full rounded-full bg-emerald-500/10 relative overflow-hidden">
                      <div
                        className="absolute bottom-0 left-0 right-0 rounded-full bg-emerald-500/70"
                        style={{ height: `${Math.max(8, pct)}%` }}
                      />
                    </div>
                    <div className="mt-2 text-center text-sm font-bold text-slate-200">{point.year}</div>
                    {point.deals && point.deals.length > 0 && (
                      <div className="mt-1 text-[10px] text-slate-400">{point.deals.length} deal{point.deals.length !== 1 ? 's' : ''}</div>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Modal
        isOpen={!!selectedYear}
        onClose={() => setSelectedYear(null)}
        title={`Maturity Calendar - ${selectedYear?.year || ''}`}
      >
        {selectedYear && (
          <div className="space-y-4">
            <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
              <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Total Receivable: {selectedYear.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currencyPrefix}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {selectedYear.deals?.length || 0} deal{(selectedYear.deals?.length || 0) !== 1 ? 's' : ''} maturing in {selectedYear.year}
              </div>
            </div>

            <div className="space-y-3">
              {getMonthlyBreakdown(selectedYear).map(({ month, deals }) => {
                const monthTotal = deals.reduce((sum, d) => sum + (d.receivable || 0), 0)
                return (
                  <div key={month} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-semibold text-slate-900 dark:text-slate-100">
                        {monthNames[month]} {selectedYear.year}
                      </div>
                      <div className="text-sm font-medium text-emerald-700 dark:text-emerald-300 tabular-nums">
                        {monthTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currencyPrefix}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      {deals.map((deal) => (
                        <div
                          key={deal.id}
                          className="flex items-start justify-between gap-3 rounded bg-slate-50 px-2 py-1.5 dark:bg-slate-800/30"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                              {deal.name}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">
                              Matures: {formatDisplayDate(deal.maturityDate)}
                            </div>
                          </div>
                          <div className="text-sm font-semibold text-slate-700 dark:text-slate-300 tabular-nums whitespace-nowrap">
                            {deal.receivable.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currencyPrefix}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
