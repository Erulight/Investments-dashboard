'use client'

import { useState, useCallback } from 'react'
import { Card } from '@/components/ui/Card'

export type WarningType =
  | 'MISSING_HAUL_START'
  | 'DEBT_IN_ZAKAT'
  | 'MISSING_SAVINGS_HAUL'
  | 'DOUBLE_COUNTING'
  | 'HAWL_JUMPED_BACKWARDS'
  | 'ZAKAT_MISMATCH'
  | 'ACTIVE_SUKUK_IN_DUE'
  | 'CONTRIBUTION_NOT_EXCLUDED'
  | 'BUCKET_NEGATIVE_BALANCE'

export interface Warning {
  id: string
  type: WarningType
  severity: 'error' | 'warning' | 'info'
  title: string
  description: string
  bucketId?: string
  investmentId?: string
  bucketLabel?: string
  investmentName?: string
  fixable: boolean
  fixAction?: string
  fixDescription?: string
  fixPayload?: Record<string, unknown>
  details?: string
}

interface ReconciliationWarningsProps {
  warnings: Warning[]
  onRefresh: () => void
}

const sev = {
  error: { dot: 'bg-red-500', text: 'text-red-400', badge: 'bg-red-500/15 text-red-300' },
  warning: { dot: 'bg-amber-500', text: 'text-amber-400', badge: 'bg-amber-500/15 text-amber-300' },
  info: { dot: 'bg-blue-500', text: 'text-blue-400', badge: 'bg-blue-500/15 text-blue-300' },
}

export function ReconciliationWarnings({ warnings, onRefresh }: ReconciliationWarningsProps) {
  const [fixingIds, setFixingIds] = useState<Set<string>>(new Set())
  const [fixResults, setFixResults] = useState<Map<string, 'success' | 'error'>>(new Map())
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const handleFix = useCallback(async (warning: Warning) => {
    if (!warning.fixable || !warning.fixAction) return
    setFixingIds(prev => new Set([...prev, warning.id]))
    try {
      let res: Response
      if (warning.fixAction === 'SET_HAUL_START' && warning.bucketId) {
        res = await fetch(`/api/zakat/buckets/${warning.bucketId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ haulStartDate: new Date().toISOString(), ...(warning.fixPayload || {}) }),
        })
      } else if (warning.fixAction === 'EXCLUDE_BUCKET' && warning.bucketId) {
        res = await fetch(`/api/zakat/buckets/${warning.bucketId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ excludeFromZakat: true }),
        })
      } else if (warning.fixAction === 'SET_SAVINGS_HAUL' && warning.investmentId) {
        res = await fetch(`/api/sukuk/${warning.investmentId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ metadata: JSON.stringify(warning.fixPayload || {}) }),
        })
      } else {
        setFixResults(prev => new Map([...prev, [warning.id, 'error']])); return
      }
      if (res.ok) {
        setFixResults(prev => new Map([...prev, [warning.id, 'success']]))
        setTimeout(() => onRefresh(), 500)
      } else {
        setFixResults(prev => new Map([...prev, [warning.id, 'error']]))
      }
    } catch {
      setFixResults(prev => new Map([...prev, [warning.id, 'error']]))
    } finally {
      setFixingIds(prev => { const next = new Set(prev); next.delete(warning.id); return next })
    }
  }, [onRefresh])

  const fixableCount = warnings.filter(w => w.fixable && w.fixAction).length

  if (warnings.length === 0) {
    return (
      <Card className="!bg-emerald-500/5 !border-emerald-500/20">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/15">
            <svg className="h-5 w-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-emerald-300">All Calculations Verified</p>
            <p className="text-xs text-emerald-400/60">No warnings found. All zakat data is consistent.</p>
          </div>
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-slate-200">Reconciliation Warnings</h3>
          <span className="text-xs text-slate-500">{warnings.length} issue{warnings.length !== 1 ? 's' : ''}</span>
        </div>
        {fixableCount > 0 && (
          <button
            onClick={async () => { for (const w of warnings.filter(w => w.fixable && w.fixAction)) await handleFix(w) }}
            className="rounded-lg bg-[#c9a84c]/15 border border-[#c9a84c]/30 px-3 py-1.5 text-xs font-semibold text-[#c9a84c] hover:bg-[#c9a84c]/25 transition-colors"
          >
            Fix All ({fixableCount})
          </button>
        )}
      </div>

      {warnings.map(warning => {
        const s = sev[warning.severity]
        const isFixing = fixingIds.has(warning.id)
        const fixResult = fixResults.get(warning.id)
        const isOpen = expandedId === warning.id

        return (
          <Card key={warning.id} className="!p-0 overflow-hidden">
            <div
              className="flex items-start gap-3 px-5 py-4 cursor-pointer hover:bg-white/[0.01] transition-colors"
              onClick={() => setExpandedId(isOpen ? null : warning.id)}
            >
              <span className={`mt-0.5 h-2 w-2 rounded-full ${s.dot} shrink-0`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${s.badge}`}>
                    {warning.severity.toUpperCase()}
                  </span>
                  {warning.bucketLabel && <span className="text-[10px] text-slate-500 truncate">{warning.bucketLabel}</span>}
                  {warning.investmentName && <span className="text-[10px] text-slate-500 truncate">{warning.investmentName}</span>}
                </div>
                <h4 className="text-sm font-semibold text-slate-200">{warning.title}</h4>
                <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{warning.description}</p>
              </div>

              <div className="flex items-center gap-2 shrink-0 mt-1">
                {warning.fixable && !fixResult && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleFix(warning) }}
                    disabled={isFixing}
                    className="rounded-lg bg-[#c9a84c]/15 border border-[#c9a84c]/30 px-3 py-1.5 text-xs font-semibold text-[#c9a84c] hover:bg-[#c9a84c]/25 transition-colors disabled:opacity-50"
                  >
                    {isFixing ? (
                      <span className="flex items-center gap-1">
                        <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Fixing...
                      </span>
                    ) : 'Auto Fix'}
                  </button>
                )}
                {fixResult === 'success' && (
                  <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                    Fixed
                  </span>
                )}
                {fixResult === 'error' && <span className="text-xs text-red-400 font-semibold">Failed</span>}
                <svg className={`h-4 w-4 text-slate-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </div>
            </div>

            {isOpen && (
              <div className="border-t border-white/5 px-5 py-3 space-y-2.5">
                {warning.details && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Details</p>
                    <p className="text-xs text-slate-300 leading-relaxed">{warning.details}</p>
                  </div>
                )}
                {warning.fixDescription && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">How to Resolve</p>
                    <p className="text-xs text-slate-300 leading-relaxed">{warning.fixDescription}</p>
                  </div>
                )}
                {(warning.bucketId || warning.investmentId) && (
                  <div className="flex items-center gap-4 pt-1">
                    {warning.bucketId && (
                      <div>
                        <span className="text-[10px] text-slate-500">Bucket: </span>
                        <code className="text-[10px] text-slate-400 font-mono">{warning.bucketId.slice(0, 12)}…</code>
                      </div>
                    )}
                    {warning.investmentId && (
                      <div>
                        <span className="text-[10px] text-slate-500">Investment: </span>
                        <code className="text-[10px] text-slate-400 font-mono">{warning.investmentId.slice(0, 12)}…</code>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </Card>
        )
      })}
    </div>
  )
}
