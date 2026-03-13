'use client'

import { useState } from 'react'
import { AnimatedCard } from '@/components/ui/AnimatedCard'
import { StatBreakdownModal } from './StatBreakdownModal'

interface DashboardStatsClientProps {
  liquiditySharePct: number
  cashBalance: number
  displayedValue: number
  avgMonthlyCashflow: number
  monthlyCashflowData: Array<{ month: string; value: number }>
  cashRunwayMonths: number | null
  avgMonthlyOutflow: number
  cashSettingDelta: number
  topTypeConcentrationPct: number
  typeBreakdowns: Array<{ type: string; value: number }>
  activeInvestmentsCount: number
  roscaDebt: number
  netWorth: number
  totalInvested: number
  totalValue: number
  sukukValue: number
  sukukInvested: number
  sukukReceivable: number
  malaaValue: number
  cryptoValue: number
  circlysOngoingSaved: number
  sipValue: number
  currencyPrefix: string
  role: 'OWNER' | 'PARTNER'
}

export function DashboardStatsClient({
  liquiditySharePct,
  cashBalance,
  displayedValue,
  avgMonthlyCashflow,
  monthlyCashflowData,
  cashRunwayMonths,
  avgMonthlyOutflow,
  cashSettingDelta,
  topTypeConcentrationPct,
  typeBreakdowns,
  activeInvestmentsCount,
  roscaDebt,
  netWorth,
  totalInvested,
  totalValue,
  sukukValue,
  sukukReceivable,
  sukukInvested,
  malaaValue,
  cryptoValue,
  circlysOngoingSaved,
  sipValue,
  currencyPrefix,
  role,
}: DashboardStatsClientProps) {
  const [showLiquidityModal, setShowLiquidityModal] = useState(false)
  const [showCashflowModal, setShowCashflowModal] = useState(false)
  const [showRunwayModal, setShowRunwayModal] = useState(false)
  const [showSyncModal, setShowSyncModal] = useState(false)
  const [showConcentrationModal, setShowConcentrationModal] = useState(false)
  const [showDealsModal, setShowDealsModal] = useState(false)
  const [showRoscaModal, setShowRoscaModal] = useState(false)
  const [showNetWorthModal, setShowNetWorthModal] = useState(false)
  const [showSukukModal, setShowSukukModal] = useState(false)
  const [showCirclysModal, setShowCirclysModal] = useState(false)

  const round2 = (n: number) => Math.round(n * 100) / 100
  
  const money = (value: number) => {
    const amount = Number.isFinite(value) ? value : 0
    const formatted = amount.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
    return `${formatted} ${currencyPrefix}`
  }

  return (
    <>
      <div className={`grid gap-3 ${role === 'OWNER' ? 'grid-cols-2 lg:grid-cols-5' : 'grid-cols-2 lg:grid-cols-3'}`}>
        <div onClick={() => setShowLiquidityModal(true)} className="cursor-pointer">
          <AnimatedCard index={2}>
            <div className="p-5">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Liquidity Share</p>
              <div className="text-2xl font-bold text-cyan-400 mt-2 tabular-nums">{liquiditySharePct.toFixed(1)}%</div>
              <p className="text-xs text-slate-500 mt-1">Cash / Total Portfolio</p>
            </div>
          </AnimatedCard>
        </div>

        <div onClick={() => setShowCashflowModal(true)} className="cursor-pointer">
          <AnimatedCard index={3}>
            <div className="p-5">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Avg Monthly Cashflow</p>
              <div className={`text-2xl font-bold mt-2 tabular-nums ${avgMonthlyCashflow >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {money(round2(Math.abs(avgMonthlyCashflow)))}
              </div>
              <p className="text-xs text-slate-500 mt-1">{avgMonthlyCashflow >= 0 ? 'Net inflow trend' : 'Net outflow trend'}</p>
            </div>
          </AnimatedCard>
        </div>

        <div onClick={() => setShowRunwayModal(true)} className="cursor-pointer" data-card-id="runway" data-cat-target="true">
          <AnimatedCard index={4}>
            <div className="p-5">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Cash Runway</p>
              <div className="text-2xl font-bold text-indigo-400 mt-2 tabular-nums">
                {cashRunwayMonths === null ? 'Stable' : `${round2(cashRunwayMonths).toFixed(1)}m`}
              </div>
              <p className="text-xs text-slate-500 mt-1">Based on average monthly outflow</p>
            </div>
          </AnimatedCard>
        </div>

        {role === 'OWNER' && (
          <div onClick={() => setShowSyncModal(true)} className="cursor-pointer" data-card-id="sync" data-cat-target="true">
            <AnimatedCard index={5}>
              <div className="p-5">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Cash Sync Health</p>
                <div className={`text-2xl font-bold mt-2 tabular-nums ${Math.abs(cashSettingDelta) > 0.01 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {Math.abs(cashSettingDelta) > 0.01
                    ? `${cashSettingDelta > 0 ? '+' : ''}${money(Math.abs(round2(cashSettingDelta)))}`
                    : 'Synced'}
                </div>
                <p className="text-xs text-slate-500 mt-1">Setting vs bucket balance drift</p>
              </div>
            </AnimatedCard>
          </div>
        )}

        {role === 'OWNER' && (
          <div onClick={() => setShowConcentrationModal(true)} className="cursor-pointer" data-card-id="concentration" data-cat-target="true">
            <AnimatedCard index={6}>
              <div className="p-5">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Top Allocation Concentration</p>
                <div className={`text-2xl font-bold mt-2 tabular-nums ${topTypeConcentrationPct > 60 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {topTypeConcentrationPct.toFixed(1)}%
                </div>
                <p className="text-xs text-slate-500 mt-1">Largest asset class share</p>
              </div>
            </AnimatedCard>
          </div>
        )}
      </div>

      {/* Second Row Stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 items-start auto-rows-min mt-3">
        <div onClick={() => setShowDealsModal(true)} className="cursor-pointer" data-card-id="deals" data-cat-target="true">
          <AnimatedCard index={4}>
            <div className="p-6">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Active Deals</p>
              <div className="text-2xl font-bold text-cyan-400 mt-2 tabular-nums">{activeInvestmentsCount}</div>
              <p className="text-xs text-slate-500 mt-1">Across all types</p>
            </div>
          </AnimatedCard>
        </div>

        {role === 'OWNER' && roscaDebt > 0 && (
          <div onClick={() => setShowRoscaModal(true)} className="cursor-pointer" data-card-id="rosca" data-cat-target="true">
            <AnimatedCard index={5}>
              <div className="p-6">
                <p className="text-xs font-medium text-red-400 uppercase tracking-wider">ROSCA Remaining</p>
                <div className="text-2xl font-bold text-red-500 mt-2 tabular-nums">
                  {money(roscaDebt)}
                </div>
                <p className="text-xs text-slate-500 mt-1">Unpaid commitments</p>
              </div>
            </AnimatedCard>
          </div>
        )}

        <div onClick={() => setShowNetWorthModal(true)} className="cursor-pointer" data-card-id="networth" data-cat-target="true">
          <AnimatedCard index={6}>
            <div className="p-6">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Net Worth</p>
              <div className={`text-2xl font-bold mt-2 tabular-nums ${netWorth >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {money(netWorth)}
              </div>
              <p className="text-xs text-slate-500 mt-1">Portfolio - Debt</p>
            </div>
          </AnimatedCard>
        </div>
      </div>

      {/* Asset Type Stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 mt-3">
        {sukukValue > 0 && (
          <div onClick={() => setShowSukukModal(true)} className="cursor-pointer" data-card-id="sukuk" data-cat-target="true">
            <AnimatedCard index={0}>
              <div className="p-6">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Sukuk Total</p>
                <div className="text-2xl font-bold text-purple-400 mt-2 tabular-nums">{money(round2(sukukValue))}</div>
                <p className="text-xs text-slate-500 mt-1">Invested {money(sukukInvested)}</p>
              </div>
            </AnimatedCard>
          </div>
        )}

        {circlysOngoingSaved > 0 && (
          <div onClick={() => setShowCirclysModal(true)} className="cursor-pointer">
            <AnimatedCard index={1}>
              <div className="p-6">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Circlys Ongoing</p>
                <div className="text-2xl font-bold text-yellow-400 mt-2 tabular-nums">{money(round2(circlysOngoingSaved))}</div>
                <p className="text-xs text-slate-500 mt-1">Saved (not received)</p>
              </div>
            </AnimatedCard>
          </div>
        )}

        {sipValue > 0 && (
          <AnimatedCard index={2}>
            <div className="p-6">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">SIP Total</p>
              <div className="text-2xl font-bold text-blue-400 mt-2 tabular-nums">{money(round2(sipValue))}</div>
              <p className="text-xs text-slate-500 mt-1">Current value</p>
            </div>
          </AnimatedCard>
        )}

        {cryptoValue > 0 && (
          <AnimatedCard index={3}>
            <div className="p-6">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Crypto Total</p>
              <div className="text-2xl font-bold text-orange-400 mt-2 tabular-nums">{money(round2(cryptoValue))}</div>
              <p className="text-xs text-slate-500 mt-1">Current value</p>
            </div>
          </AnimatedCard>
        )}
      </div>

      {/* Modals */}
      <StatBreakdownModal
        isOpen={showLiquidityModal}
        onClose={() => setShowLiquidityModal(false)}
        title="Liquidity Share"
        emoji="💧"
        subtitle="Cash vs total portfolio ratio"
        accentColor="cyan"
        items={[
          { label: 'Cash Balance', value: money(cashBalance), icon: '💵', description: 'Available liquidity', color: 'cyan' },
          { label: 'Total Portfolio', value: money(displayedValue), icon: '📊', description: 'All investments + cash', color: 'purple' },
        ]}
        totalLabel="Liquidity Ratio"
        totalValue={`${liquiditySharePct.toFixed(1)}%`}
      />

      <StatBreakdownModal
        isOpen={showCashflowModal}
        onClose={() => setShowCashflowModal(false)}
        title="Monthly Cashflow"
        emoji="📈"
        subtitle="Average monthly net flow"
        accentColor={avgMonthlyCashflow >= 0 ? 'green' : 'red'}
        items={monthlyCashflowData.slice(-6).map((item, idx) => ({
          label: item.month,
          value: money(Math.abs(item.value)),
          icon: item.value >= 0 ? '📈' : '📉',
          description: item.value >= 0 ? 'Inflow' : 'Outflow',
          color: item.value >= 0 ? 'green' : 'red',
        }))}
        totalLabel="Average Monthly Flow"
        totalValue={`${avgMonthlyCashflow >= 0 ? '+' : '-'}${money(Math.abs(avgMonthlyCashflow))}`}
      />

      <StatBreakdownModal
        isOpen={showRunwayModal}
        onClose={() => setShowRunwayModal(false)}
        title="Cash Runway"
        emoji="🛤️"
        subtitle="Months until cash depletion"
        accentColor="indigo"
        items={[
          { label: 'Current Cash', value: money(cashBalance), icon: '💵', description: 'Available balance', color: 'cyan' },
          { label: 'Avg Monthly Outflow', value: money(avgMonthlyOutflow), icon: '📉', description: 'Average spending', color: 'red' },
          {
            label: 'Runway',
            value: cashRunwayMonths === null ? 'Infinite' : `${round2(cashRunwayMonths).toFixed(1)} months`,
            icon: '🛤️',
            description: cashRunwayMonths === null ? 'No net outflow' : 'Time until depletion',
            color: 'indigo',
          },
        ]}
      />

      <StatBreakdownModal
        isOpen={showSyncModal}
        onClose={() => setShowSyncModal(false)}
        title="Cash Sync Health"
        emoji="🔄"
        subtitle="Setting vs bucket balance drift"
        accentColor={Math.abs(cashSettingDelta) > 0.01 ? 'amber' : 'green'}
        items={[
          {
            label: 'Sync Status',
            value: Math.abs(cashSettingDelta) > 0.01 ? 'Drifted' : 'Synced',
            icon: Math.abs(cashSettingDelta) > 0.01 ? '⚠️' : '✅',
            description: 'Cash setting alignment',
            color: Math.abs(cashSettingDelta) > 0.01 ? 'amber' : 'green',
          },
          {
            label: 'Delta',
            value: `${cashSettingDelta > 0 ? '+' : ''}${money(cashSettingDelta)}`,
            icon: '📊',
            description: 'Difference from setting',
            color: cashSettingDelta > 0 ? 'amber' : cashSettingDelta < 0 ? 'red' : 'green',
          },
        ]}
      />

      <StatBreakdownModal
        isOpen={showConcentrationModal}
        onClose={() => setShowConcentrationModal(false)}
        title="Asset Concentration"
        emoji="🎯"
        subtitle="Allocation across asset classes"
        accentColor={topTypeConcentrationPct > 60 ? 'amber' : 'green'}
        items={typeBreakdowns.slice().sort((a, b) => b.value - a.value).map((item, idx) => ({
          label: item.type,
          value: money(item.value),
          icon: idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '📊',
          description: `${((item.value / typeBreakdowns.reduce((s, t) => s + t.value, 0)) * 100).toFixed(1)}% share`,
          color: idx === 0 ? 'amber' : 'cyan',
        }))}
        totalLabel="Top Concentration"
        totalValue={`${topTypeConcentrationPct.toFixed(1)}%`}
      />

      <StatBreakdownModal
        isOpen={showDealsModal}
        onClose={() => setShowDealsModal(false)}
        title="Active Investments"
        emoji="💼"
        subtitle="All active deals across types"
        accentColor="cyan"
        items={[
          { label: 'Total Active Deals', value: activeInvestmentsCount.toString(), icon: '📊', description: 'Across all types', color: 'cyan' },
          { label: 'Total Invested', value: money(totalInvested), icon: '💰', description: 'Principal deployed', color: 'purple' },
          { label: 'Current Value', value: money(totalValue), icon: '📈', description: 'Including profit', color: 'green' },
        ]}
      />

      <StatBreakdownModal
        isOpen={showRoscaModal}
        onClose={() => setShowRoscaModal(false)}
        title="ROSCA Debt"
        emoji="🔴"
        subtitle="Outstanding ROSCA commitments"
        accentColor="red"
        items={[
          { label: 'Total Remaining', value: money(roscaDebt), icon: '💳', description: 'Unpaid commitments', color: 'red' },
        ]}
      />

      <StatBreakdownModal
        isOpen={showNetWorthModal}
        onClose={() => setShowNetWorthModal(false)}
        title="Net Worth"
        emoji="💎"
        subtitle="Portfolio value minus debt"
        accentColor={netWorth >= 0 ? 'green' : 'red'}
        items={[
          { label: 'Total Portfolio', value: money(displayedValue), icon: '📊', description: 'All assets', color: 'purple' },
          { label: 'ROSCA Debt', value: money(roscaDebt), icon: '💳', description: 'Outstanding commitments', color: 'red' },
          { label: 'Net Worth', value: money(netWorth), icon: '💎', description: 'Assets - Liabilities', color: netWorth >= 0 ? 'green' : 'red' },
        ]}
        totalLabel="Net Worth"
        totalValue={money(netWorth)}
      />

      <StatBreakdownModal
        isOpen={showSukukModal}
        onClose={() => setShowSukukModal(false)}
        title="Sukuk Holdings"
        emoji="📜"
        subtitle="Islamic bond investments"
        accentColor="purple"
        items={[
          { label: 'Principal Outstanding', value: money(sukukInvested), icon: '💰', description: 'Active invested amount', color: 'emerald' },
          { label: 'Receivable Profit', value: money(sukukReceivable), icon: '📈', description: 'Accrued but not received', color: 'cyan' },
          { label: 'Current Value', value: money(sukukValue), icon: '📊', description: 'Principal + receivable', color: 'purple' },
        ]}
      />

      <StatBreakdownModal
        isOpen={showCirclysModal}
        onClose={() => setShowCirclysModal(false)}
        title="Circlys ROSCA"
        emoji="🎯"
        subtitle="Ongoing savings circles"
        accentColor="amber"
        items={[
          { label: 'Saved (Not Received)', value: money(circlysOngoingSaved), icon: '💰', description: 'Contributed but not distributed', color: 'amber' },
        ]}
      />
    </>
  )
}
  )
}
