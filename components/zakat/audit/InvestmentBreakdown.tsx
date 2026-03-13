'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/Card'

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

const statusBadge = {
  paid: 'bg-emerald-500/15 text-emerald-300',
  due: 'bg-amber-500/15 text-amber-300',
  upcoming: 'bg-slate-500/15 text-slate-400',
}
const statusDot = { paid: 'bg-emerald-400', due: 'bg-amber-400', upcoming: 'bg-slate-500' }
const statusLabel = { paid: 'Paid', due: 'Due', upcoming: 'Upcoming' }

export function InvestmentBreakdown({ investments, money, onDrillDown }: InvestmentBreakdownProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const toggle = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  if (investments.length === 0) {
    return (
      <Card>
        <p className="text-sm text-slate-400 text-center py-4">No investments found for zakat breakdown.</p>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-slate-200">Per Investment Breakdown</h3>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <button onClick={() => setExpandedIds(new Set(investments.map(i => i.id)))} className="hover:text-slate-300 transition-colors">Expand All</button>
          <span>·</span>
          <button onClick={() => setExpandedIds(new Set())} className="hover:text-slate-300 transition-colors">Collapse All</button>
        </div>
      </div>

      {investments.map(inv => {
        const isOpen = expandedIds.has(inv.id)
        return (
          <Card key={inv.id} className="!p-0 overflow-hidden">
            <button
              type="button"
              onClick={() => toggle(inv.id)}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/[0.02] transition-colors text-left"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-100 truncate">{inv.name}</span>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${inv.isActive ? 'bg-blue-500/15 text-blue-300' : inv.isMature ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-500/15 text-slate-400'}`}>
                      {inv.isActive ? 'Active' : inv.isMature ? 'Matured' : 'Closed'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Principal: {money(inv.totalPrincipal)}
                    {inv.maturityDate && ` · Maturity: ${inv.maturityDate}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <div className="text-right">
                  <p className="text-sm font-bold tabular-nums text-[#c9a84c]">{money(inv.totalZakat)}</p>
                  <p className="text-[10px] text-slate-500">Total Zakat</p>
                </div>
                <svg className={`h-4 w-4 text-slate-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </div>
            </button>

            {isOpen && (
              <div className="border-t border-white/5">
                {inv.fundingSources.length > 0 && (
                  <div className="px-5 py-3 bg-white/[0.01]">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Funding Sources</p>
                    {inv.fundingSources.map((src, i) => (
                      <div key={i} className="flex items-center justify-between text-xs py-1">
                        <div className="flex items-center gap-2">
                          <span className="h-1.5 w-1.5 rounded-full bg-blue-400/60 shrink-0" />
                          <span className="text-slate-300">{src.bucketLabel}</span>
                        </div>
                        <div className="flex items-center gap-3 text-slate-500 tabular-nums">
                          <span>{money(src.amount)}</span>
                          <span className="text-[10px]">Hawl: {src.haulDate}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="px-5 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Zakat Rows</p>
                  <div className="space-y-1.5">
                    {inv.zakatRows.map((row, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between rounded-lg bg-white/[0.02] px-3 py-2 hover:bg-white/[0.04] transition-colors cursor-pointer"
                        onClick={() => row.rowId && onDrillDown(row.rowId)}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusBadge[row.status]}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${statusDot[row.status]}`} />
                            {statusLabel[row.status]}
                          </span>
                          <span className="text-xs text-slate-300 truncate">{row.label}</span>
                        </div>
                        <span className="text-xs font-semibold tabular-nums text-slate-200 shrink-0">{money(row.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </Card>
        )
      })}
    </div>
  )
}
