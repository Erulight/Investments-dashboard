'use client'

import { useState, useCallback } from 'react'

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

const severityConfig = {
  error: {
    bg: 'bg-red-950/50 border-red-500/40',
    icon: (
      <svg className="h-5 w-5 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
      </svg>
    ),
    badge: 'bg-red-500/20 text-red-300 border-red-500/30',
    dot: 'bg-red-500',
  },
  warning: {
    bg: 'bg-amber-950/50 border-amber-500/40',
    icon: (
      <svg className="h-5 w-5 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
      </svg>
    ),
    badge: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    dot: 'bg-amber-500',
  },
  info: {
    bg: 'bg-blue-950/50 border-blue-500/40',
    icon: (
      <svg className="h-5 w-5 text-blue-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
      </svg>
    ),
    badge: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    dot: 'bg-blue-500',
  },
}

const typeLabels: Record<WarningType, string> = {
  MISSING_HAUL_START: 'Missing Hawl Start',
  DEBT_IN_ZAKAT: 'Debt in Zakat',
  MISSING_SAVINGS_HAUL: 'Missing Savings Hawl',
  DOUBLE_COUNTING: 'Double Counting',
  HAWL_JUMPED_BACKWARDS: 'Hawl Clock Backwards',
  ZAKAT_MISMATCH: 'Amount Mismatch',
  ACTIVE_SUKUK_IN_DUE: 'Active Sukuk in Due',
  CONTRIBUTION_NOT_EXCLUDED: 'Contribution Not Excluded',
  BUCKET_NEGATIVE_BALANCE: 'Negative Balance',
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
        setFixResults(prev => new Map([...prev, [warning.id, 'error']]))
        return
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
      setFixingIds(prev => {
        const next = new Set(prev)
        next.delete(warning.id)
        return next
      })
    }
  }, [onRefresh])

  const handleFixAll = useCallback(async () => {
    const fixableWarnings = warnings.filter(w => w.fixable && w.fixAction)
    for (const w of fixableWarnings) {
      await handleFix(w)
    }
  }, [warnings, handleFix])

  if (warnings.length === 0) {
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-gradient-to-r from-emerald-950/60 to-slate-900/80 p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/20">
            <svg className="h-6 w-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-bold text-emerald-200">All Calculations Verified</h3>
            <p className="text-sm text-emerald-300/70">No warnings found. All zakat calculations are consistent and correct.</p>
          </div>
        </div>
      </div>
    )
  }

  const errorCount = warnings.filter(w => w.severity === 'error').length
  const warningCount = warnings.filter(w => w.severity === 'warning').length
  const fixableCount = warnings.filter(w => w.fixable).length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-bold text-slate-100">Reconciliation Warnings</h3>
          <div className="flex items-center gap-2">
            {errorCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-500/20 border border-red-500/30 px-2.5 py-0.5 text-xs font-semibold text-red-300">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                {errorCount} error{errorCount !== 1 ? 's' : ''}
              </span>
            )}
            {warningCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 border border-amber-500/30 px-2.5 py-0.5 text-xs font-semibold text-amber-300">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                {warningCount} warning{warningCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
        {fixableCount > 0 && (
          <button
            onClick={handleFixAll}
            className="rounded-lg bg-[#c9a84c]/20 border border-[#c9a84c]/40 px-4 py-2 text-xs font-semibold text-[#c9a84c] hover:bg-[#c9a84c]/30 transition-colors"
          >
            Fix All ({fixableCount})
          </button>
        )}
      </div>

      <div className="space-y-3">
        {warnings.map(warning => {
          const config = severityConfig[warning.severity]
          const isFixing = fixingIds.has(warning.id)
          const fixResult = fixResults.get(warning.id)
          const isExpanded = expandedId === warning.id

          return (
            <div
              key={warning.id}
              className={`rounded-xl border ${config.bg} overflow-hidden transition-all duration-200`}
            >
              <div
                className="flex items-start gap-3 p-4 cursor-pointer"
                onClick={() => setExpandedId(isExpanded ? null : warning.id)}
              >
                {config.icon}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${config.badge}`}>
                      {typeLabels[warning.type] || warning.type}
                    </span>
                    {warning.bucketLabel && (
                      <span className="text-[10px] text-slate-400 truncate">Bucket: {warning.bucketLabel}</span>
                    )}
                    {warning.investmentName && (
                      <span className="text-[10px] text-slate-400 truncate">Investment: {warning.investmentName}</span>
                    )}
                  </div>
                  <h4 className="text-sm font-semibold text-slate-200">{warning.title}</h4>
                  <p className="text-xs text-slate-400 mt-0.5">{warning.description}</p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {warning.fixable && !fixResult && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleFix(warning) }}
                      disabled={isFixing}
                      className="rounded-lg bg-[#c9a84c]/20 border border-[#c9a84c]/40 px-3 py-1.5 text-xs font-semibold text-[#c9a84c] hover:bg-[#c9a84c]/30 transition-colors disabled:opacity-50"
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
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                      Fixed
                    </span>
                  )}
                  {fixResult === 'error' && (
                    <span className="text-xs text-red-400 font-semibold">Fix Failed</span>
                  )}
                  <svg
                    className={`h-4 w-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </div>
              </div>

              {isExpanded && (
                <div className="border-t border-white/5 px-4 py-3 bg-black/20">
                  <div className="space-y-2">
                    {warning.details && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Details</p>
                        <p className="text-xs text-slate-300">{warning.details}</p>
                      </div>
                    )}
                    {warning.fixDescription && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">How to Resolve</p>
                        <p className="text-xs text-slate-300">{warning.fixDescription}</p>
                      </div>
                    )}
                    {warning.bucketId && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Bucket ID</p>
                        <code className="text-[10px] text-slate-400 font-mono bg-slate-800/50 px-1.5 py-0.5 rounded">{warning.bucketId}</code>
                      </div>
                    )}
                    {warning.investmentId && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Investment ID</p>
                        <code className="text-[10px] text-slate-400 font-mono bg-slate-800/50 px-1.5 py-0.5 rounded">{warning.investmentId}</code>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
