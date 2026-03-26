'use client'

import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Modal } from '@/components/sukuk/SukukModal'
import { formatDisplayDate } from '@/lib/date'
import { motion, AnimatePresence, useInView } from 'framer-motion'

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

const colors = [
  { from: '#06b6d4', via: '#0891b2', to: '#0e7490', glow: 'rgba(6, 182, 212, 0.5)', name: 'cyan' },
  { from: '#8b5cf6', via: '#7c3aed', to: '#6d28d9', glow: 'rgba(139, 92, 246, 0.5)', name: 'violet' },
  { from: '#ec4899', via: '#db2777', to: '#be185d', glow: 'rgba(236, 72, 153, 0.5)', name: 'pink' },
  { from: '#10b981', via: '#059669', to: '#047857', glow: 'rgba(16, 185, 129, 0.5)', name: 'emerald' },
  { from: '#f59e0b', via: '#d97706', to: '#b45309', glow: 'rgba(245, 158, 11, 0.5)', name: 'amber' },
  { from: '#3b82f6', via: '#2563eb', to: '#1d4ed8', glow: 'rgba(59, 130, 246, 0.5)', name: 'blue' },
]

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
  const containerRef = useRef<HTMLDivElement>(null)
  const isInView = useInView(containerRef, { once: true, margin: '-100px' })

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
          <div ref={containerRef}>
          {safe.length === 0 ? (
            <div className="text-xs text-cyan-400/60">No receivable data.</div>
          ) : (
            <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
              <AnimatePresence mode="wait">
                {safe.map((point, index) => {
                  const amount = Math.max(0, Number(point.amount) || 0)
                  const pct = maxAmount > 0 ? (amount / maxAmount) * 100 : 0
                  const fillHeight = pct // Beaker is 100 units tall (y=10 to y=110)
                  const color = colors[index % colors.length]
                  
                  return (
                    <motion.button
                      key={point.year}
                      initial={{ opacity: 0, y: 30 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={{ delay: index * 0.05, duration: 0.3, type: 'spring' }}
                      onClick={() => setSelectedYear(point)}
                      className="group relative cursor-pointer"
                      whileHover={{ scale: 1.08, y: -8 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      {/* Chemistry beaker container */}
                      <div className="relative">
                        {/* Amount label */}
                        <AnimatePresence mode="wait">
                          {isHidden ? (
                            <motion.div
                              key="hidden"
                              initial={{ opacity: 0, scale: 0.8 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.8 }}
                              className="text-xs font-bold tabular-nums mb-2 text-center"
                              style={{ color: color.from }}
                            >
                              ••••••
                            </motion.div>
                          ) : (
                            <motion.div
                              key="visible"
                              initial={{ opacity: 0, y: -10 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -10 }}
                              className="text-xs font-bold tabular-nums mb-2 text-center"
                              style={{ 
                                background: `linear-gradient(135deg, ${color.from}, ${color.via})`,
                                WebkitBackgroundClip: 'text',
                                WebkitTextFillColor: 'transparent',
                                filter: `drop-shadow(0 0 8px ${color.glow})`
                              }}
                            >
                              {amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} {currencyPrefix}
                            </motion.div>
                          )}
                        </AnimatePresence>
                        
                        {/* Beaker flask */}
                        <div className="relative h-40 w-full">
                          <svg viewBox="0 0 100 140" className="w-full h-full overflow-hidden">
                            <defs>
                              <linearGradient id={`gradient-${index}`} x1="0%" y1="0%" x2="0%" y2="100%">
                                <stop offset="0%" stopColor={color.from} stopOpacity="0.9" />
                                <stop offset="50%" stopColor={color.via} stopOpacity="0.95" />
                                <stop offset="100%" stopColor={color.to} stopOpacity="1" />
                              </linearGradient>
                              <mask id={`beaker-mask-${index}`}>
                                <path d="M 30 10 L 30 50 L 20 90 Q 20 110, 50 110 Q 80 110, 80 90 L 70 50 L 70 10 Z" fill="white" />
                              </mask>
                            </defs>

                            {/* Liquid fill */}
                            <g mask={`url(#beaker-mask-${index})`}>
                              <motion.rect
                                x="20"
                                width="60"
                                fill={`url(#gradient-${index})`}
                                initial={{ y: 110, height: 0 }}
                                animate={{ 
                                  y: isInView ? 110 - fillHeight : 110,
                                  height: isInView ? fillHeight : 0
                                }}
                                transition={{ 
                                  duration: 2,
                                  delay: index * 0.2,
                                  ease: [0.34, 1.56, 0.64, 1]
                                }}
                              />
                            </g>

                            {/* Bubbles */}
                            <g mask={`url(#beaker-mask-${index})`}>
                            {isInView && [0, 1, 2].map((bubble) => (
                              <motion.circle
                                key={bubble}
                                r="1.5"
                                fill="rgba(255, 255, 255, 0.6)"
                                initial={{ 
                                  cx: 35 + (bubble * 12),
                                  cy: 110,
                                  opacity: 0
                                }}
                                animate={{
                                  cx: 35 + (bubble * 12) + Math.sin(bubble) * 5,
                                  cy: [110, 110 - fillHeight, 110 - fillHeight - 20],
                                  opacity: [0, 0.8, 0],
                                }}
                                transition={{
                                  duration: 6 + bubble * 1,
                                  repeat: Infinity,
                                  delay: index * 0.3 + bubble * 0.8,
                                  ease: 'easeInOut'
                                }}
                              />
                            ))}

                            {/* Surface shimmer */}
                            <motion.line
                              x1="25"
                              x2="75"
                              stroke="rgba(255, 255, 255, 0.4)"
                              strokeWidth="1"
                              initial={{ y1: 110, y2: 110 }}
                              animate={{ 
                                y1: isInView ? 110 - fillHeight : 110,
                                y2: isInView ? 110 - fillHeight : 110,
                                opacity: [0.3, 0.7, 0.3]
                              }}
                              transition={{
                                y1: { duration: 2, delay: index * 0.2 },
                                y2: { duration: 2, delay: index * 0.2 },
                                opacity: { duration: 5, repeat: Infinity, ease: 'easeInOut' }
                              }}
                            />
                            </g>
                            
                            {/* Glass beaker outline (drawn on top of liquid) */}
                            <path
                              d="M 30 10 L 30 50 L 20 90 Q 20 110, 50 110 Q 80 110, 80 90 L 70 50 L 70 10 Z"
                              fill="none"
                              stroke="rgba(148, 163, 184, 0.3)"
                              strokeWidth="1.5"
                              className="transition-all duration-500 group-hover:stroke-white/50"
                            />
                            
                            {/* Measurement lines */}
                            <line x1="25" y1="70" x2="30" y2="70" stroke="rgba(148, 163, 184, 0.4)" strokeWidth="0.5" />
                            <line x1="25" y1="50" x2="30" y2="50" stroke="rgba(148, 163, 184, 0.4)" strokeWidth="0.5" />
                            <line x1="25" y1="30" x2="30" y2="30" stroke="rgba(148, 163, 184, 0.4)" strokeWidth="0.5" />
                          </svg>
                          
                          {/* Glow effect */}
                          <motion.div
                            className="absolute inset-0 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                            style={{ background: color.glow }}
                          />
                        </div>
                        
                        {/* Year label */}
                        <div 
                          className="mt-3 text-center text-lg font-black drop-shadow-lg"
                          style={{ 
                            background: `linear-gradient(135deg, ${color.from}, ${color.to})`,
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent'
                          }}
                        >
                          {point.year}
                        </div>
                        
                        {/* Deals count */}
                        {point.deals && point.deals.length > 0 && (
                          <div 
                            className="mt-1 text-[10px] font-semibold text-center opacity-70"
                            style={{ color: color.from }}
                          >
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
          </div>
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
