'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'

type YearPoint = {
  year: number
  amount: number
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

  return (
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
                <div key={point.year} className="rounded-lg border border-slate-700/40 bg-slate-800/30 px-3 py-3">
                  <div className="text-xs font-semibold text-slate-300 tabular-nums">
                    {currencyPrefix} {amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div className="mt-2 h-24 w-full rounded-full bg-emerald-500/10 relative overflow-hidden">
                    <div
                      className="absolute bottom-0 left-0 right-0 rounded-full bg-emerald-500/70"
                      style={{ height: `${Math.max(8, pct)}%` }}
                    />
                  </div>
                  <div className="mt-2 text-center text-sm font-bold text-slate-200">{point.year}</div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
