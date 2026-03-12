'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Modal } from '@/components/sukuk/SukukModal'
import { formatDisplayDate } from '@/lib/date'
import { motion, AnimatePresence } from 'framer-motion'

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
  const [isHidden, setIsHidden] = useState(false)

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
      <Card className="relative overflow-hidden border-2 border-cyan-500/30 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-2xl shadow-2xl shadow-cyan-500/20 transition-all duration-500 hover:shadow-cyan-500/40 hover:border-cyan-500/50">
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 via-transparent to-purple-500/5 pointer-events-none" />
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <CardHeader className="pb-2 relative z-10">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent drop-shadow-lg">Receivable by Year</CardTitle>
            <motion.button
              onClick={() => setIsHidden(!isHidden)}
              className="group relative p-2 rounded-lg bg-slate-800/50 border border-cyan-500/30 hover:border-cyan-400/60 transition-all duration-300"
              whileTap={{ scale: 0.95 }}
              whileHover={{ scale: 1.05 }}
            >
              <motion.div
                animate={{ rotate: isHidden ? 0 : 360 }}
                transition={{ duration: 0.5, ease: "easeInOut" }}
              >
                {isHidden ? (
                  <svg className="w-5 h-5 text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.6)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.6)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </motion.div>
              <div className="absolute inset-0 rounded-lg bg-cyan-400/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </motion.button>
          </div>
        </CardHeader>
        <CardContent className="relative z-10">
          {safe.length === 0 ? (
            <div className="text-xs text-cyan-400/60">No receivable data.</div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <AnimatePresence mode="wait">
                {safe.map((point, index) => {
                  const amount = Math.max(0, Number(point.amount) || 0)
                  const pct = maxAmount > 0 ? (amount / maxAmount) * 100 : 0
                  return (
                    <motion.button
                      key={point.year}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={{ delay: index * 0.1, duration: 0.4 }}
                      onClick={() => setSelectedYear(point)}
                      className="group relative rounded-2xl border-2 border-cyan-500/30 bg-gradient-to-br from-slate-800/80 to-slate-900/80 px-4 py-4 transition-all duration-500 hover:border-cyan-400/70 hover:shadow-2xl hover:shadow-cyan-500/30 cursor-pointer backdrop-blur-sm"
                      whileHover={{ scale: 1.05, y: -5 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-cyan-500/0 to-purple-500/0 group-hover:from-cyan-500/10 group-hover:to-purple-500/10 transition-all duration-500" />
                      <div className="absolute -inset-0.5 rounded-2xl bg-gradient-to-r from-cyan-500 to-purple-500 opacity-0 group-hover:opacity-20 blur transition-all duration-500" />
                      
                      <div className="relative z-10">
                        <AnimatePresence mode="wait">
                          {isHidden ? (
                            <motion.div
                              key="hidden"
                              initial={{ opacity: 0, scale: 0.8 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.8 }}
                              transition={{ duration: 0.3 }}
                              className="text-xs font-bold text-cyan-400 tabular-nums drop-shadow-[0_0_6px_rgba(34,211,238,0.4)]"
                            >
                              ••••••
                            </motion.div>
                          ) : (
                            <motion.div
                              key="visible"
                              initial={{ opacity: 0, scale: 0.8 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.8 }}
                              transition={{ duration: 0.3 }}
                              className="text-xs font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent drop-shadow-[0_0_6px_rgba(34,211,238,0.4)] tabular-nums"
                            >
                              {amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currencyPrefix}
                            </motion.div>
                          )}
                        </AnimatePresence>
                        
                        <div className="mt-3 h-28 w-full rounded-2xl bg-slate-900/50 border border-cyan-500/20 relative overflow-hidden backdrop-blur-sm">
                          <div className="absolute inset-0 bg-gradient-to-t from-cyan-500/5 to-transparent" />
                          <motion.div
                            className="absolute bottom-0 left-0 right-0 rounded-t-2xl bg-gradient-to-t from-cyan-500 via-cyan-400 to-purple-400"
                            initial={{ height: '8%' }}
                            animate={{ height: `${Math.max(8, pct)}%` }}
                            transition={{ duration: 1, ease: "easeOut" }}
                            style={{
                              boxShadow: '0 0 20px rgba(34,211,238,0.5), 0 0 40px rgba(34,211,238,0.3)'
                            }}
                          />
                          <motion.div
                            className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-transparent via-white to-transparent"
                            animate={{ opacity: [0.5, 1, 0.5] }}
                            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                          />
                        </div>
                        
                        <div className="mt-3 text-center text-base font-black bg-gradient-to-r from-cyan-300 to-purple-300 bg-clip-text text-transparent drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]">
                          {point.year}
                        </div>
                        {point.deals && point.deals.length > 0 && (
                          <div className="mt-1 text-[10px] font-semibold text-cyan-400/70">
                            {point.deals.length} deal{point.deals.length !== 1 ? 's' : ''}
                          </div>
                        )}
                      </div>
                    </motion.button>
                  )
                })}
              </AnimatePresence>
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
