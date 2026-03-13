'use client'

import { motion, AnimatePresence } from 'framer-motion'

export type Warning = {
  id: string
  type: 'MISSING_HAUL_START' | 'MISSING_SAVINGS_HAUL' | 'DOUBLE_COUNTING' | 'HAUL_BACKWARDS' | 'INCORRECT_AMOUNT' | 'ACTIVE_SUKUK_DUE' | 'CONTRIBUTION_NOT_EXCLUDED' | 'DEBT_IN_ZAKAT'
  severity: 'error' | 'warning'
  title: string
  description: string
  bucketId?: string
  investmentId?: string
}

type ReconciliationWarningsProps = {
  warnings: Warning[]
}

export function ReconciliationWarnings({ warnings }: ReconciliationWarningsProps) {
  if (warnings.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="rounded-xl border-2 border-green-500 bg-green-50 p-6 text-green-900"
      >
        <div className="flex items-center gap-3">
          <span className="text-3xl">✅</span>
          <div>
            <h3 className="text-lg font-bold">All Calculations Verified</h3>
            <p className="text-sm mt-1">No issues detected in zakat calculations</p>
          </div>
        </div>
      </motion.div>
    )
  }

  const errorCount = warnings.filter(w => w.severity === 'error').length
  const warningCount = warnings.filter(w => w.severity === 'warning').length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">
          Reconciliation Warnings
        </h2>
        <div className="flex gap-2 text-sm">
          {errorCount > 0 && (
            <span className="rounded-full bg-red-100 px-3 py-1 font-semibold text-red-700">
              {errorCount} Error{errorCount !== 1 ? 's' : ''}
            </span>
          )}
          {warningCount > 0 && (
            <span className="rounded-full bg-amber-100 px-3 py-1 font-semibold text-amber-700">
              {warningCount} Warning{warningCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <AnimatePresence>
          {warnings.map((warning, index) => (
            <motion.div
              key={warning.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ delay: index * 0.05 }}
              className={`rounded-xl border-2 p-4 ${
                warning.severity === 'error'
                  ? 'border-red-300 bg-red-50 text-red-900'
                  : 'border-amber-300 bg-amber-50 text-amber-900'
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl">
                  {warning.severity === 'error' ? '🔴' : '⚠️'}
                </span>
                <div className="flex-1">
                  <h4 className="font-bold">{warning.title}</h4>
                  <p className="mt-1 text-sm">{warning.description}</p>
                  {(warning.bucketId || warning.investmentId) && (
                    <div className="mt-2 flex gap-2 text-xs">
                      {warning.bucketId && (
                        <span className="rounded bg-white bg-opacity-50 px-2 py-1 font-mono">
                          Bucket: {warning.bucketId.slice(0, 8)}...
                        </span>
                      )}
                      {warning.investmentId && (
                        <span className="rounded bg-white bg-opacity-50 px-2 py-1 font-mono">
                          Investment: {warning.investmentId.slice(0, 8)}...
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}
