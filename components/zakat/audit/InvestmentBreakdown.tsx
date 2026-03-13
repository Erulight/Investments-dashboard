'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { formatCurrencyAmount, type DisplayCurrency } from '@/lib/currency'

export type FundingSource = {
  bucketLabel: string
  amount: number
  haulDate: string
}

export type ZakatRow = {
  type: 'hawl1' | 'profit' | 'principal'
  label: string
  amount: number
  status: 'paid' | 'due' | 'upcoming'
}

export type InvestmentBreakdownItem = {
  id: string
  name: string
  totalPrincipal: number
  fundingSources: FundingSource[]
  zakatRows: ZakatRow[]
  totalZakat: number
}

type InvestmentBreakdownProps = {
  investments: InvestmentBreakdownItem[]
  displayCurrency: DisplayCurrency
  onRowClick: (investmentId: string, rowType: string) => void
}

export function InvestmentBreakdown({ investments, displayCurrency, onRowClick }: InvestmentBreakdownProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const money = (val: number) => formatCurrencyAmount(val, displayCurrency, 'SAR')

  const toggleExpand = (id: string) => {
    const next = new Set(expandedIds)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    setExpandedIds(next)
  }

  const getStatusColor = (status: 'paid' | 'due' | 'upcoming') => {
    switch (status) {
      case 'paid':
        return 'text-emerald-600 dark:text-emerald-400'
      case 'due':
        return 'text-amber-600 dark:text-amber-400'
      case 'upcoming':
        return 'text-slate-500 dark:text-slate-400'
    }
  }

  const getStatusBadge = (status: 'paid' | 'due' | 'upcoming') => {
    switch (status) {
      case 'paid':
        return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300'
      case 'due':
        return 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300'
      case 'upcoming':
        return 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
    }
  }

  if (investments.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
        No investments found
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-slate-900 dark:text-white">Per Investment Breakdown</h2>
      <div className="space-y-3">
        {investments.map((inv, index) => {
          const isExpanded = expandedIds.has(inv.id)

          return (
            <motion.div
              key={inv.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800"
            >
              {/* Header */}
              <button
                onClick={() => toggleExpand(inv.id)}
                className="w-full p-4 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h3 className="font-bold text-slate-900 dark:text-white">{inv.name}</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      Principal: {money(inv.totalPrincipal)}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-xs text-slate-500 dark:text-slate-400">Total Zakat</p>
                      <p className="text-lg font-bold text-slate-900 dark:text-white">
                        {money(inv.totalZakat)}
                      </p>
                    </div>
                    <motion.div
                      animate={{ rotate: isExpanded ? 180 : 0 }}
                      transition={{ duration: 0.2 }}
                      className="text-slate-400"
                    >
                      ▼
                    </motion.div>
                  </div>
                </div>
              </button>

              {/* Expanded content */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="border-t border-slate-200 dark:border-slate-700"
                  >
                    <div className="p-4 space-y-4">
                      {/* Funding Sources */}
                      {inv.fundingSources.length > 0 && (
                        <div>
                          <h4 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
                            Funded From:
                          </h4>
                          <div className="space-y-2">
                            {inv.fundingSources.map((source, idx) => (
                              <div
                                key={idx}
                                className="flex items-center justify-between rounded-lg bg-slate-50 p-2 text-sm dark:bg-slate-700"
                              >
                                <span className="font-medium text-slate-700 dark:text-slate-300">
                                  {source.bucketLabel}
                                </span>
                                <div className="text-right">
                                  <span className="font-bold text-slate-900 dark:text-white">
                                    {money(source.amount)}
                                  </span>
                                  <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">
                                    {source.haulDate}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Zakat Rows */}
                      {inv.zakatRows.length > 0 && (
                        <div>
                          <h4 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
                            Zakat Breakdown:
                          </h4>
                          <div className="space-y-2">
                            {inv.zakatRows.map((row, idx) => (
                              <button
                                key={idx}
                                onClick={() => onRowClick(inv.id, row.type)}
                                className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white p-3 text-sm transition-all hover:shadow-md dark:border-slate-600 dark:bg-slate-800 dark:hover:border-slate-500"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-slate-700 dark:text-slate-300">
                                    {row.label}
                                  </span>
                                  <span
                                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${getStatusBadge(
                                      row.status
                                    )}`}
                                  >
                                    {row.status.toUpperCase()}
                                  </span>
                                </div>
                                <span className={`font-bold ${getStatusColor(row.status)}`}>
                                  {money(row.amount)}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
