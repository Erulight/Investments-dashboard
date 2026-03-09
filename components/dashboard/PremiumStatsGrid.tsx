'use client'

import { PremiumStatsCard } from './PremiumStatsCard'
import { PremiumCashBalanceCard } from './PremiumCashBalanceCard'

interface StatsData {
  portfolioValue: number
  cashBalance: number
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
}

export function PremiumStatsGrid({
  portfolioValue,
  cashBalance,
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
}: StatsData) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <PremiumStatsCard
        title={role === 'OWNER' ? 'Portfolio Value' : 'Investment Value'}
        value={portfolioValue}
        subtitle={role === 'OWNER' ? 'Cash + Investments' : 'Your share'}
        trend={portfolioTrend}
        sparklineData={portfolioSparkline}
        accentColor="gold"
        index={0}
        showProgress={role === 'OWNER'}
        progressValue={totalInvested}
        progressMax={portfolioValue}
      />
      
      {role === 'OWNER' && (
        <PremiumCashBalanceCard
          initialCash={cashBalance}
          trend={cashTrend}
          sparklineData={cashSparkline}
          index={1}
        />
      )}
      
      <PremiumStatsCard
        title="Total Invested"
        value={totalInvested}
        subtitle="Principal deployed"
        trend={investedTrend}
        sparklineData={investedSparkline}
        accentColor="purple"
        index={role === 'OWNER' ? 2 : 1}
      />
      
      <PremiumStatsCard
        title="Total Profit"
        value={totalProfit}
        subtitle="Realized & unrealized"
        trend={profitTrend}
        trendLabel={profitTrend !== undefined ? `${profitTrend >= 0 ? '↑' : '↓'} ${Math.abs(profitTrend).toFixed(2)}% ROI` : undefined}
        sparklineData={profitSparkline}
        accentColor="green"
        index={role === 'OWNER' ? 3 : 2}
      />
    </div>
  )
}
