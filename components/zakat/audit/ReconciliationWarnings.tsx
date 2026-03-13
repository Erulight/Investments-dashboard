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

export interface FixOption {
  id: string
  label: string
  description: string
  recommended: boolean
  action: string
  bucketId?: string
  investmentId?: string
  payload?: Record<string, unknown>
}

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
  explanation: string
  example: string
  fixOptions: FixOption[]
  details?: string
  // legacy compat
  fixable?: boolean
  fixAction?: string
  fixDescription?: string
  fixPayload?: Record<string, unknown>
}

interface ReconciliationWarningsProps {
  warnings: Warning[]
  onRefresh: () => void
}

const sevStyle = {
  error: { dot: 'bg-red-500', badge: 'bg-red-500/15 text-red-300', ring: 'ring-red-500/20' },
  warning: { dot: 'bg-amber-500', badge: 'bg-amber-500/15 text-amber-300', ring: 'ring-amber-500/20' },
  info: { dot: 'bg-blue-500', badge: 'bg-blue-500/15 text-blue-300', ring: 'ring-blue-500/20' },
}

const Spinner = () => (
  <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
)

export function ReconciliationWarnings({ warnings, onRefresh }: ReconciliationWarningsProps) {
  const [fixingKey, setFixingKey] = useState<string | null>(null)
  const [fixResults, setFixResults] = useState<Map<string, 'success' | 'error'>>(new Map())
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const handleFixOption = useCallback(async (warningId: string, option: FixOption, skipRefresh = false) => {
    const key = `${warningId}:${option.id}`
    setFixingKey(key)
    try {
      const res = await fetch('/api/zakat/audit-fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: option.action,
          bucketId: option.bucketId,
          investmentId: option.investmentId,
          payload: option.payload,
        }),
      })
      if (res.ok) {
        setFixResults(prev => new Map([...prev, [warningId, 'success']]))
        if (!skipRefresh) {
          setTimeout(() => onRefresh(), 600)
        }
      } else {
        setFixResults(prev => new Map([...prev, [warningId, 'error']]))
      }
    } catch {
      setFixResults(prev => new Map([...prev, [warningId, 'error']]))
    } finally {
      setFixingKey(null)
    }
  }, [onRefresh])

  const handleFixAllRecommended = useCallback(async () => {
    let fixedAny = false
    for (const w of warnings) {
      if (fixResults.get(w.id) === 'success') continue
      const rec = w.fixOptions.find(o => o.recommended)
      if (rec) {
        await handleFixOption(w.id, rec, true)
        fixedAny = true
      }
    }
    if (fixedAny) {
      setTimeout(() => onRefresh(), 600)
    }
  }, [warnings, fixResults, handleFixOption, onRefresh])

  const fixableCount = warnings.filter(w => w.fixOptions.some(o => o.recommended) && fixResults.get(w.id) !== 'success').length

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
            onClick={handleFixAllRecommended}
            disabled={!!fixingKey}
            className="rounded-lg bg-[#c9a84c]/15 border border-[#c9a84c]/30 px-3 py-1.5 text-xs font-semibold text-[#c9a84c] hover:bg-[#c9a84c]/25 transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            {fixingKey ? <Spinner /> : null}
            Fix All Recommended ({fixableCount})
          </button>
        )}
      </div>

      {warnings.map(warning => {
        const s = sevStyle[warning.severity]
        const fixResult = fixResults.get(warning.id)
        const isOpen = expandedId === warning.id
        const hasFixOptions = warning.fixOptions.length > 0

        return (
          <Card key={warning.id} className="!p-0 overflow-hidden">
            {/* Header */}
            <div
              className="flex items-start gap-3 px-5 py-4 cursor-pointer hover:bg-white/[0.01] transition-colors"
              onClick={() => setExpandedId(isOpen ? null : warning.id)}
            >
              <span className={`mt-1 h-2.5 w-2.5 rounded-full ${s.dot} shrink-0`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${s.badge}`}>
                    {warning.severity.toUpperCase()}
                  </span>
                  {warning.bucketLabel && <span className="text-[10px] text-slate-500">{warning.bucketLabel}</span>}
                  {warning.investmentName && <span className="text-[10px] text-slate-500">{warning.investmentName}</span>}
                </div>
                <h4 className="text-sm font-semibold text-slate-200">{warning.title}</h4>
                <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{warning.description}</p>
              </div>

              <div className="flex items-center gap-2 shrink-0 mt-1">
                {fixResult === 'success' && (
                  <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                    Fixed
                  </span>
                )}
                {fixResult === 'error' && <span className="text-xs text-red-400 font-semibold">Failed</span>}
                {!fixResult && hasFixOptions && (
                  <span className="text-[10px] text-[#c9a84c]/70 font-semibold">{warning.fixOptions.length} fix option{warning.fixOptions.length > 1 ? 's' : ''}</span>
                )}
                <svg className={`h-4 w-4 text-slate-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </div>
            </div>

            {/* Expanded Details */}
            {isOpen && (
              <div className="border-t border-white/5">
                {/* Explanation */}
                <div className="px-5 py-3 bg-white/[0.01]">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">What does this mean?</p>
                  <p className="text-xs text-slate-300 leading-relaxed">{warning.explanation}</p>
                </div>

                {/* Example */}
                <div className="px-5 py-3 border-t border-white/5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Example</p>
                  <div className="rounded-lg bg-slate-700/30 px-3 py-2.5">
                    <p className="text-xs text-slate-300 leading-relaxed italic">{warning.example}</p>
                  </div>
                </div>

                {/* Technical Details */}
                {warning.details && (
                  <div className="px-5 py-3 border-t border-white/5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Technical Details</p>
                    <p className="text-xs text-slate-400 leading-relaxed font-mono">{warning.details}</p>
                  </div>
                )}

                {/* Fix Options */}
                {hasFixOptions && fixResult !== 'success' && (
                  <div className="px-5 py-4 border-t border-white/5 bg-white/[0.015]">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-3">
                      Choose a fix option
                    </p>
                    <div className="space-y-2.5">
                      {warning.fixOptions.map(option => {
                        const optKey = `${warning.id}:${option.id}`
                        const isFixingThis = fixingKey === optKey
                        return (
                          <div
                            key={option.id}
                            className={`rounded-lg border transition-all ${
                              option.recommended
                                ? 'border-[#c9a84c]/30 bg-[#c9a84c]/[0.04]'
                                : 'border-white/5 bg-white/[0.02]'
                            }`}
                          >
                            <div className="flex items-start gap-3 px-4 py-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-0.5">
                                  <span className="text-xs font-semibold text-slate-200">{option.label}</span>
                                  {option.recommended && (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-[#c9a84c]/15 px-2 py-0.5 text-[9px] font-bold text-[#c9a84c] uppercase tracking-wider">
                                      <svg className="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                                      </svg>
                                      Recommended
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-slate-400 leading-relaxed">{option.description}</p>
                              </div>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleFixOption(warning.id, option) }}
                                disabled={!!fixingKey}
                                className={`shrink-0 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors disabled:opacity-50 flex items-center gap-1.5 ${
                                  option.recommended
                                    ? 'bg-[#c9a84c]/20 border border-[#c9a84c]/40 text-[#c9a84c] hover:bg-[#c9a84c]/30'
                                    : 'bg-slate-700/50 border border-slate-600/30 text-slate-300 hover:bg-slate-700/70'
                                }`}
                              >
                                {isFixingThis ? <><Spinner /> Fixing...</> : 'Apply Fix'}
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Fixed state */}
                {fixResult === 'success' && (
                  <div className="px-5 py-3 border-t border-white/5 bg-emerald-500/[0.03]">
                    <div className="flex items-center gap-2">
                      <svg className="h-4 w-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="text-xs font-semibold text-emerald-400">This issue has been fixed. The page will refresh to reflect the changes.</span>
                    </div>
                  </div>
                )}

                {/* IDs footer */}
                {(warning.bucketId || warning.investmentId) && (
                  <div className="px-5 py-2 border-t border-white/5 flex items-center gap-4">
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
