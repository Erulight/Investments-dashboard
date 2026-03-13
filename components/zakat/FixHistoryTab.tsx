'use client'

import { motion } from 'framer-motion'

type FixHistoryItem = {
  fixId: string
  warningId: string
  message: string
}

export function FixHistoryTab({
  fixHistory,
  onUndo,
}: {
  fixHistory: FixHistoryItem[]
  onUndo: (fixId: string) => void
}) {
  if (fixHistory.length === 0) {
    return (
      <div className="rounded-xl bg-slate-900/80 border border-slate-700/50 p-10 text-center text-slate-500 text-sm">
        No fixes applied yet
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-gradient-to-br from-violet-500/10 to-purple-500/10 border border-violet-500/30 p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg">🛠️</span>
          <h3 className="text-sm font-semibold text-violet-300">Applied Fixes</h3>
        </div>
        <p className="text-xs text-slate-400">
          These automatic fixes have been applied to resolve zakat audit warnings. You can undo any fix to revert the changes.
        </p>
      </div>

      {fixHistory.map((fix, index) => (
        <motion.div
          key={fix.fixId}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.05 }}
          className="rounded-xl bg-slate-900/80 border border-slate-700/50 p-4"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-emerald-400 text-sm">✅</span>
                <span className="text-xs font-mono text-slate-500">Fix #{index + 1}</span>
              </div>
              <p className="text-sm text-slate-200">{fix.message}</p>
              <p className="text-xs text-slate-500 mt-1">Warning ID: {fix.warningId}</p>
            </div>
            <button
              onClick={() => onUndo(fix.fixId)}
              className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-600/20 border border-amber-500/40 text-amber-300 text-xs font-semibold hover:bg-amber-600/30 transition-all"
            >
              ↩️ Undo
            </button>
          </div>
        </motion.div>
      ))}

      <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3">
        <div className="flex items-start gap-2 text-xs text-slate-300">
          <span className="text-amber-400">⚠️</span>
          <div>
            <span className="font-semibold text-amber-400">Note:</span> Undoing a fix will revert the database changes. 
            The page will reload to show the restored warning.
          </div>
        </div>
      </div>
    </div>
  )
}
