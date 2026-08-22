'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Users } from 'lucide-react'

interface PartnerPortfolioRow {
  personId: string
  name: string
  cash: number
  invested: number
  totalPortfolio: number
}

export function PartnerPortfolioCard({ currencyPrefix = 'SAR' }: { currencyPrefix?: string }) {
  const [partners, setPartners] = useState<PartnerPortfolioRow[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch('/api/partners/portfolio')
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || 'Failed to load partner portfolios')
        if (!cancelled) setPartners(Array.isArray(data.partners) ? data.partners : [])
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load partner portfolios')
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  if (error) return null
  if (partners !== null && partners.length === 0) return null

  const total = (partners || []).reduce((sum, p) => sum + p.totalPortfolio, 0)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 backdrop-blur-xl border-2 border-purple-400/40 shadow-2xl shadow-purple-500/30"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 via-transparent to-cyan-500/5 pointer-events-none" />
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-purple-400/30 to-violet-500/30" />

      <div className="relative p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-purple-400" />
            <p className="text-xs font-bold bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent uppercase tracking-wider">
              Partner Portfolios
            </p>
          </div>
          <span className="text-xs text-slate-500">
            Total {currencyPrefix} {total.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </span>
        </div>

        {partners === null ? (
          <p className="text-sm text-slate-500">Loading...</p>
        ) : (
          <div className="space-y-2">
            {partners.map((p) => (
              <div
                key={p.personId}
                className="flex items-center justify-between rounded-lg px-3 py-2.5 bg-white/[0.03] border border-white/[0.06] hover:border-purple-400/30 transition-colors"
              >
                <span className="text-sm font-medium text-slate-200 truncate max-w-[50%]">{p.name}</span>
                <div className="flex items-center gap-4 text-xs">
                  <span className="text-slate-500">
                    Cash <span className="text-slate-300 font-semibold tabular-nums">{p.cash.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                  </span>
                  <span className="text-slate-500">
                    Invested <span className="text-slate-300 font-semibold tabular-nums">{p.invested.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                  </span>
                  <span className="text-purple-300 font-bold tabular-nums text-sm">
                    {currencyPrefix} {p.totalPortfolio.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  )
}
