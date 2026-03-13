'use client'

import { motion } from 'framer-motion'

interface BreakdownItem {
  label: string
  value: string | number
  icon?: string
  description?: string
  color?: string
}

interface StatBreakdownModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  emoji: string
  subtitle?: string
  items: BreakdownItem[]
  totalLabel?: string
  totalValue?: string | number
  accentColor?: string
}

export function StatBreakdownModal({
  isOpen,
  onClose,
  title,
  emoji,
  subtitle,
  items,
  totalLabel,
  totalValue,
  accentColor = 'cyan',
}: StatBreakdownModalProps) {
  if (!isOpen) return null

  const colorMap: Record<string, { from: string; to: string; text: string; border: string }> = {
    cyan: { from: 'from-cyan-500/20', to: 'to-blue-500/20', text: 'from-cyan-400 to-blue-400', border: 'border-cyan-500/30' },
    green: { from: 'from-emerald-500/20', to: 'to-green-500/20', text: 'from-emerald-400 to-green-400', border: 'border-emerald-500/30' },
    purple: { from: 'from-purple-500/20', to: 'to-violet-500/20', text: 'from-purple-400 to-violet-400', border: 'border-purple-500/30' },
    amber: { from: 'from-amber-500/20', to: 'to-yellow-500/20', text: 'from-amber-400 to-yellow-400', border: 'border-amber-500/30' },
    red: { from: 'from-red-500/20', to: 'to-rose-500/20', text: 'from-red-400 to-rose-400', border: 'border-red-500/30' },
    indigo: { from: 'from-indigo-500/20', to: 'to-blue-500/20', text: 'from-indigo-400 to-blue-400', border: 'border-indigo-500/30' },
  }

  const colors = colorMap[accentColor] || colorMap.cyan

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        transition={{ type: 'spring', duration: 0.5 }}
        onClick={(e) => e.stopPropagation()}
        className={`bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl border-2 ${colors.border} overflow-hidden`}
      >
        <div className={`relative px-8 py-6 bg-gradient-to-r ${colors.from} ${colors.to} border-b ${colors.border}`}>
          <div className="relative flex items-center justify-between">
            <div>
              <h2 className={`text-2xl font-bold bg-gradient-to-r ${colors.text} bg-clip-text text-transparent drop-shadow-lg`}>
                {emoji} {title}
              </h2>
              {subtitle && <p className="text-sm text-slate-400 mt-1">{subtitle}</p>}
            </div>
            <button
              onClick={onClose}
              className={`w-10 h-10 rounded-full flex items-center justify-center bg-slate-800/50 hover:bg-slate-700/50 border border-slate-600/50 hover:border-${accentColor}-500/50 transition-all duration-300 group`}
            >
              <svg className={`w-5 h-5 text-slate-400 group-hover:text-${accentColor}-400 transition-colors`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        <div className="px-8 py-6 max-h-[70vh] overflow-y-auto">
          <div className="space-y-3">
            {items.map((item, index) => {
              const itemColor = item.color || accentColor
              const itemColors = colorMap[itemColor] || colors
              
              return (
                <motion.div
                  key={index}
                  initial={{ x: -20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.1 + index * 0.05 }}
                  className={`group relative p-4 rounded-xl bg-gradient-to-r ${itemColors.from} ${itemColors.to} border ${itemColors.border} hover:border-opacity-60 transition-all duration-300`}
                >
                  <div className={`absolute inset-0 bg-gradient-to-r ${itemColors.from} to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-xl`} />
                  <div className="relative flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {item.icon && (
                        <div className={`w-10 h-10 rounded-lg bg-${itemColor}-500/20 flex items-center justify-center`}>
                          <span className="text-lg">{item.icon}</span>
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-semibold text-slate-200">{item.label}</p>
                        {item.description && <p className="text-xs text-slate-500">{item.description}</p>}
                      </div>
                    </div>
                    <p className={`text-lg font-bold text-${itemColor}-400 tabular-nums`}>
                      {typeof item.value === 'number' ? item.value.toLocaleString('en-US', { minimumFractionDigits: 2 }) : item.value}
                    </p>
                  </div>
                </motion.div>
              )
            })}
          </div>
          {totalLabel && totalValue && (
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.1 + items.length * 0.05 }}
              className={`mt-6 p-6 rounded-xl bg-gradient-to-r ${colors.from} ${colors.to} border-2 ${colors.border}`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-400 uppercase tracking-wider">{totalLabel}</p>
                </div>
                <p className={`text-3xl font-bold bg-gradient-to-r ${colors.text} bg-clip-text text-transparent tabular-nums`}>
                  {typeof totalValue === 'number' ? totalValue.toLocaleString('en-US', { minimumFractionDigits: 2 }) : totalValue}
                </p>
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}
