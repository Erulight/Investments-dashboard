'use client'

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
  return (
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
      />

      <PremiumCashBalanceCard
        initialCash={cashBalance}
        settingDelta={cashSettingDelta}
        trend={cashTrend}
        sparklineData={cashSparkline}
        index={1}
        role={role}
        currencyPrefix={currencyPrefix}
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
      />
    </div>
  )
}
