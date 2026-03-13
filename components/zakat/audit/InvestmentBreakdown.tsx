'use client'

import { useState } from 'react'

export interface FundingSource {
  bucketLabel: string
  amount: number
  haulDate: string
  bucketId?: string
}

export interface ZakatRow {
  type: 'principal' | 'profit' | 'idle' | 'receipt' | 'reward'
  label: string
  amount: number
  status: 'paid' | 'due' | 'upcoming'
  period?: string
  rowId?: string
}

export interface InvestmentBreakdownItem {
  id: string
  name: string
  totalPrincipal: number
  currentValue: number
  maturityDate: string | null
  isActive: boolean
  isMature: boolean
  fundingSources: FundingSource[]
  zakatRows: ZakatRow[]
  totalZakat: number
}

interface InvestmentBreakdownProps {
  investments: InvestmentBreakdownItem[]
  money: (v: number) => string
  onDrillDown: (rowId: string) => void
}

const statusConfig = {
  paid: { bg: 'bg-emerald-500/20', text: 'text-emerald-300', dot: 'bg-emerald-400', label: 'Paid' },
  due: { bg: 'bg-amber-500/20', text: 'text-amber-300', dot: 'bg-amber-400', label: 'Due Now' },
  upcoming: { bg: 'bg-slate-500/20', text: 'text-slate-400', dot: 'bg-slate-500', label: 'Upcoming' },
}

export function InvestmentBreakdown({ investments, money, onDrillDown }: InvestmentBreakdownProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const toggle = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const expandAll = () => setExpandedIds(new Set(investments.map(i => i.id)))
  const collapseAll = () => setExpandedIds(new Set())

  if (investments.length === 0) {
    return (
      <div className="rounded-xl border border-slate-700/40 bg-slate-900/40 p-6 text-center">
        <p className="text-sm text-slate-400">No investments found for zakat breakdown.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-slate-100">Per Investment Breakdown</h3>
        <div className="flex items-center gap-2">
          <button onClick={expandAll} className="text-xs text-slate-400 hover:text-slate-200 transition-colors">
            Expand All
          </button>
          <span className="text-slate-600">|</span>
          <button onClick={collapseAll} className="text-xs text-slate-400 hover:text-slate-200 transition-colors">
            Collapse All
          </button>
        </div>
      </div>

      {investments.map(inv => {
        const isExpanded = expandedIds.has(inv.id)
        return (
          <div
            key={inv.id}
            className="rounded-xl border border-slate-700/40 bg-slate-900/40 overflow-hidden transition-all duration-200"
          >
            <button
              type="button"
              onClick={() => toggle(inv.id)}
              className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors text-left"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className={`flex h-8 w-8 items-center justify-center rounded-lg shrink-0 ${inv.isActive ? 'bg-blue-500/20' : inv.isMature ? 'bg-emerald-500/20' : 'bg-slate-500/20'}`}>
                  <svg className={`h-4 w-4 ${inv.isActive ? 'text-blue-400' : inv.isMature ? 'text-emerald-400' : 'text-slate-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-100 truncate">{inv.name}</span>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${inv.isActive ? 'bg-blue-500/20 text-blue-300' : inv.isMature ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-500/20 text-slate-400'}`}>
                      {inv.isActive ? 'Active' : inv.isMature ? 'Matured' : 'Closed'}
                    </span>
                  </div>
                  <span className="text-xs text-slate-400">
                    Principal: {money(inv.totalPrincipal)}
                    {inv.maturityDate && ` • Maturity: ${inv.maturityDate}`}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <div className="text-right">
                  <p className="text-sm font-bold tabular-nums text-[#c9a84c]">{money(inv.totalZakat)}</p>
                  <p className="text-[10px] text-slate-400">Total Zakat</p>
                </div>
                <svg
                  className={`h-4 w-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </div>
            </button>

            {isExpanded && (
              <div className="border-t border-slate-700/40">
                {inv.fundingSources.length > 0 && (
                  <div className="px-4 py-3 bg-slate-800/30">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Funding Sources</p>
                    <div className="space-y-1.5">
                      {inv.fundingSources.map((src, i) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <span className="h-1.5 w-1.5 rounded-full bg-blue-400 shrink-0" />
                            <span className="text-slate-300 truncate">{src.bucketLabel}</span>
                          </div>
                          <div className="flex items-center gap-3 text-slate-400 tabular-nums shrink-0">
                            <span>{money(src.amount)}</span>
                            <span className="text-[10px]">Hawl: {src.haulDate}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Zakat Rows</p>
                  <div className="space-y-2">
                    {inv.zakatRows.map((row, i) => {
                      const sc = statusConfig[row.status]
                      return (
                        <div
                          key={i}
                          className="flex items-center justify-between rounded-lg bg-slate-800/40 px-3 py-2 hover:bg-slate-800/60 transition-colors cursor-pointer"
                          onClick={() => row.rowId && onDrillDown(row.rowId)}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`inline-flex items-center gap-1 rounded-full ${sc.bg} px-2 py-0.5 text-[10px] font-semibold ${sc.text}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${sc.dot}`} />
                              {sc.label}
                            </span>
                            <span className="text-xs text-slate-300 truncate">{row.label}</span>
                            {row.period && <span className="text-[10px] text-slate-500">{row.period}</span>}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs font-semibold tabular-nums text-slate-200">{money(row.amount)}</span>
                            {row.rowId && (
                              <svg className="h-3.5 w-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                              </svg>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
