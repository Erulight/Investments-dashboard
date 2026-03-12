'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { PremiumStatsCard } from './PremiumStatsCard'
import { PremiumCashBalanceCard } from './PremiumCashBalanceCard'

interface StatsData {
  portfolioValue: number
  cashBalance: number
  cashSettingDelta?: number
  totalInvested: number
  totalProfit: number
  portfolioTrend?: number
  cashTrend?: number
  investedTrend?: number
  profitTrend?: number
  portfolioSparkline?: number[]
  cashSparkline?: number[]
  investedSparkline?: number[]
  profitSparkline?: number[]
  role?: 'OWNER' | 'PARTNER'
  currencyPrefix?: string
}

export function PremiumStatsGrid({
  portfolioValue,
  cashBalance,
  cashSettingDelta,
  totalInvested,
  totalProfit,
  portfolioTrend,
  cashTrend,
  investedTrend,
  profitTrend,
  portfolioSparkline,
  cashSparkline,
  investedSparkline,
  profitSparkline,
  role = 'OWNER',
  currencyPrefix = 'SAR',
}: StatsData) {
  const [allHidden, setAllHidden] = useState(false)

  return (
    <div className="space-y-4">
      {/* Master Toggle Button */}
      <div className="flex justify-end">
        <motion.button
          onClick={() => setAllHidden(!allHidden)}
          className="group relative px-6 py-3 rounded-xl bg-gradient-to-r from-slate-900 to-slate-800 border-2 border-cyan-500/30 hover:border-cyan-400/60 transition-all duration-300 overflow-hidden"
          whileTap={{ scale: 0.95 }}
          whileHover={{ scale: 1.02 }}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 to-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <div className="absolute -top-12 -right-12 w-24 h-24 bg-cyan-500/20 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          
          <div className="relative flex items-center gap-3">
            <motion.div
              animate={{ rotate: allHidden ? 0 : 360 }}
              transition={{ duration: 0.5, ease: "easeInOut" }}
            >
              {allHidden ? (
                <svg className="w-5 h-5 text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.6)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.6)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </motion.div>
            <span className="text-sm font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent drop-shadow-lg">
              {allHidden ? 'Show All Stats' : 'Hide All Stats'}
            </span>
          </div>
          
          <div className="absolute inset-0 rounded-xl bg-cyan-400/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        </motion.button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <PremiumStatsCard
          title="Portfolio Value"
          value={portfolioValue}
          subtitle="Cash + Investments"
          trend={portfolioTrend}
          sparklineData={portfolioSparkline}
          accentColor="gold"
          index={0}
          showProgress={role === 'OWNER' || role === 'PARTNER'}
          progressValue={totalInvested}
          progressMax={portfolioValue}
          prefix={currencyPrefix}
          isHidden={allHidden}
          onToggleHide={() => setAllHidden(!allHidden)}
        />

        <PremiumCashBalanceCard
          initialCash={cashBalance}
          settingDelta={cashSettingDelta}
          trend={cashTrend}
          sparklineData={cashSparkline}
          index={1}
          role={role}
          currencyPrefix={currencyPrefix}
          isHidden={allHidden}
          onToggleHide={() => setAllHidden(!allHidden)}
        />
      
        <PremiumStatsCard
          title="Total Invested"
          value={totalInvested}
          subtitle="Principal deployed"
          trend={investedTrend}
          sparklineData={investedSparkline}
          accentColor="purple"
          index={2}
          prefix={currencyPrefix}
          isHidden={allHidden}
          onToggleHide={() => setAllHidden(!allHidden)}
        />
      
        <PremiumStatsCard
          title="Total Profit"
          value={totalProfit}
          subtitle="Realized & unrealized"
          trend={profitTrend}
          trendLabel={profitTrend !== undefined ? `${profitTrend >= 0 ? '↑' : '↓'} ${Math.abs(profitTrend).toFixed(2)}% ROI` : undefined}
          sparklineData={profitSparkline}
          accentColor="green"
          index={3}
          prefix={currencyPrefix}
          isHidden={allHidden}
          onToggleHide={() => setAllHidden(!allHidden)}
        />
      </div>
    </div>
  )
}
