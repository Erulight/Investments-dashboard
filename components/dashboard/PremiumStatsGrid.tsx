'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { PremiumStatsCard } from './PremiumStatsCard'
import { PremiumCashBalanceCard } from './PremiumCashBalanceCard'

interface ProfitBreakdown {
  sukukReceivable: number
  sukukReceived: number
  commission: number
  savingsRewards: number
  malaaProfit: number
  cryptoProfit: number
  sipProfit: number
  otherProfit: number
}

interface PortfolioBreakdown {
  cash: number
  sukuk: number
  malaa: number
  crypto: number
  circlys: number
  other: number
}

interface CashBreakdown {
  available: number
  setting: number
}

interface InvestedBreakdown {
  sukuk: number
  malaa: number
  crypto: number
  circlys: number
  other: number
}

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
  profitBreakdown?: ProfitBreakdown
  portfolioBreakdown?: PortfolioBreakdown
  cashBreakdown?: CashBreakdown
  investedBreakdown?: InvestedBreakdown
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
  profitBreakdown,
  portfolioBreakdown,
  cashBreakdown,
  investedBreakdown,
}: StatsData) {
  const [allHidden, setAllHidden] = useState(false)
  const [showProfitBreakdown, setShowProfitBreakdown] = useState(false)
  const [showPortfolioBreakdown, setShowPortfolioBreakdown] = useState(false)
  const [showCashBreakdown, setShowCashBreakdown] = useState(false)
  const [showInvestedBreakdown, setShowInvestedBreakdown] = useState(false)

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
        <div onClick={() => portfolioBreakdown && setShowPortfolioBreakdown(true)} className={portfolioBreakdown ? 'cursor-pointer' : ''}>
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
        </div>

        <div onClick={() => cashBreakdown && setShowCashBreakdown(true)} className={cashBreakdown ? 'cursor-pointer' : ''}>
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
        </div>
      
        <div onClick={() => investedBreakdown && setShowInvestedBreakdown(true)} className={investedBreakdown ? 'cursor-pointer' : ''}>
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
        </div>
      
        <div onClick={() => profitBreakdown && setShowProfitBreakdown(true)} className={profitBreakdown ? 'cursor-pointer' : ''}>
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

      {/* Portfolio Breakdown Modal */}
      {showPortfolioBreakdown && portfolioBreakdown && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setShowPortfolioBreakdown(false)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: 'spring', duration: 0.5 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl border-2 border-yellow-500/30 overflow-hidden"
          >
            <div className="relative px-8 py-6 bg-gradient-to-r from-yellow-500/20 to-amber-500/20 border-b border-yellow-500/30">
              <div className="relative flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold bg-gradient-to-r from-yellow-400 to-amber-400 bg-clip-text text-transparent drop-shadow-lg">
                    📊 Portfolio Breakdown
                  </h2>
                  <p className="text-sm text-slate-400 mt-1">Your wealth allocation</p>
                </div>
                <button
                  onClick={() => setShowPortfolioBreakdown(false)}
                  className="w-10 h-10 rounded-full flex items-center justify-center bg-slate-800/50 hover:bg-slate-700/50 border border-slate-600/50 hover:border-yellow-500/50 transition-all duration-300 group"
                >
                  <svg className="w-5 h-5 text-slate-400 group-hover:text-yellow-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="px-8 py-6 max-h-[70vh] overflow-y-auto">
              <div className="space-y-3">
                {portfolioBreakdown.cash > 0 && (
                  <motion.div initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.1 }} className="group relative p-4 rounded-xl bg-gradient-to-r from-cyan-500/10 to-cyan-600/10 border border-cyan-500/20 hover:border-cyan-400/40 transition-all duration-300">
                    <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-xl" />
                    <div className="relative flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center"><span className="text-lg">💵</span></div>
                        <div><p className="text-sm font-semibold text-slate-200">Cash Balance</p><p className="text-xs text-slate-500">Available liquidity</p></div>
                      </div>
                      <p className="text-lg font-bold text-cyan-400 tabular-nums">{portfolioBreakdown.cash.toLocaleString('en-US', { minimumFractionDigits: 2 })} {currencyPrefix}</p>
                    </div>
                  </motion.div>
                )}
                {portfolioBreakdown.sukuk > 0 && (
                  <motion.div initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.15 }} className="group relative p-4 rounded-xl bg-gradient-to-r from-purple-500/10 to-purple-600/10 border border-purple-500/20 hover:border-purple-400/40 transition-all duration-300">
                    <div className="absolute inset-0 bg-gradient-to-r from-purple-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-xl" />
                    <div className="relative flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center"><span className="text-lg">📜</span></div>
                        <div><p className="text-sm font-semibold text-slate-200">Sukuk Total</p><p className="text-xs text-slate-500">Islamic bonds</p></div>
                      </div>
                      <p className="text-lg font-bold text-purple-400 tabular-nums">{portfolioBreakdown.sukuk.toLocaleString('en-US', { minimumFractionDigits: 2 })} {currencyPrefix}</p>
                    </div>
                  </motion.div>
                )}
                {portfolioBreakdown.malaa > 0 && (
                  <motion.div initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.2 }} className="group relative p-4 rounded-xl bg-gradient-to-r from-blue-500/10 to-blue-600/10 border border-blue-500/20 hover:border-blue-400/40 transition-all duration-300">
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-xl" />
                    <div className="relative flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center"><span className="text-lg">🏦</span></div>
                        <div><p className="text-sm font-semibold text-slate-200">Malaa Capital</p><p className="text-xs text-slate-500">Investment funds</p></div>
                      </div>
                      <p className="text-lg font-bold text-blue-400 tabular-nums">{portfolioBreakdown.malaa.toLocaleString('en-US', { minimumFractionDigits: 2 })} {currencyPrefix}</p>
                    </div>
                  </motion.div>
                )}
                {portfolioBreakdown.crypto > 0 && (
                  <motion.div initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.25 }} className="group relative p-4 rounded-xl bg-gradient-to-r from-orange-500/10 to-orange-600/10 border border-orange-500/20 hover:border-orange-400/40 transition-all duration-300">
                    <div className="absolute inset-0 bg-gradient-to-r from-orange-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-xl" />
                    <div className="relative flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center"><span className="text-lg">₿</span></div>
                        <div><p className="text-sm font-semibold text-slate-200">Crypto</p><p className="text-xs text-slate-500">Digital assets</p></div>
                      </div>
                      <p className="text-lg font-bold text-orange-400 tabular-nums">{portfolioBreakdown.crypto.toLocaleString('en-US', { minimumFractionDigits: 2 })} {currencyPrefix}</p>
                    </div>
                  </motion.div>
                )}
                {portfolioBreakdown.circlys > 0 && (
                  <motion.div initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.3 }} className="group relative p-4 rounded-xl bg-gradient-to-r from-pink-500/10 to-pink-600/10 border border-pink-500/20 hover:border-pink-400/40 transition-all duration-300">
                    <div className="absolute inset-0 bg-gradient-to-r from-pink-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-xl" />
                    <div className="relative flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-pink-500/20 flex items-center justify-center"><span className="text-lg">🎯</span></div>
                        <div><p className="text-sm font-semibold text-slate-200">Circlys Ongoing</p><p className="text-xs text-slate-500">ROSCA contributions</p></div>
                      </div>
                      <p className="text-lg font-bold text-pink-400 tabular-nums">{portfolioBreakdown.circlys.toLocaleString('en-US', { minimumFractionDigits: 2 })} {currencyPrefix}</p>
                    </div>
                  </motion.div>
                )}
                {portfolioBreakdown.other > 0 && (
                  <motion.div initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.35 }} className="group relative p-4 rounded-xl bg-gradient-to-r from-slate-500/10 to-slate-600/10 border border-slate-500/20 hover:border-slate-400/40 transition-all duration-300">
                    <div className="absolute inset-0 bg-gradient-to-r from-slate-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-xl" />
                    <div className="relative flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-slate-500/20 flex items-center justify-center"><span className="text-lg">💼</span></div>
                        <div><p className="text-sm font-semibold text-slate-200">Other</p><p className="text-xs text-slate-500">Other investments</p></div>
                      </div>
                      <p className="text-lg font-bold text-slate-400 tabular-nums">{portfolioBreakdown.other.toLocaleString('en-US', { minimumFractionDigits: 2 })} {currencyPrefix}</p>
                    </div>
                  </motion.div>
                )}
              </div>
              <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.4 }} className="mt-6 p-6 rounded-xl bg-gradient-to-r from-yellow-500/20 to-amber-500/20 border-2 border-yellow-500/40">
                <div className="flex items-center justify-between">
                  <div><p className="text-sm font-medium text-slate-400 uppercase tracking-wider">Total Portfolio Value</p><p className="text-xs text-slate-500 mt-1">Cash + All Investments</p></div>
                  <p className="text-3xl font-bold bg-gradient-to-r from-yellow-400 to-amber-400 bg-clip-text text-transparent tabular-nums">{portfolioValue.toLocaleString('en-US', { minimumFractionDigits: 2 })} {currencyPrefix}</p>
                </div>
              </motion.div>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Cash Breakdown Modal */}
      {showCashBreakdown && cashBreakdown && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setShowCashBreakdown(false)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: 'spring', duration: 0.5 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-2xl shadow-2xl w-full max-w-lg border-2 border-cyan-500/30 overflow-hidden"
          >
            <div className="relative px-8 py-6 bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border-b border-cyan-500/30">
              <div className="relative flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent drop-shadow-lg">
                    💵 Cash Balance
                  </h2>
                  <p className="text-sm text-slate-400 mt-1">Available liquidity</p>
                </div>
                <button
                  onClick={() => setShowCashBreakdown(false)}
                  className="w-10 h-10 rounded-full flex items-center justify-center bg-slate-800/50 hover:bg-slate-700/50 border border-slate-600/50 hover:border-cyan-500/50 transition-all duration-300 group"
                >
                  <svg className="w-5 h-5 text-slate-400 group-hover:text-cyan-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="px-8 py-6">
              <div className="space-y-3">
                <motion.div initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.1 }} className="group relative p-4 rounded-xl bg-gradient-to-r from-emerald-500/10 to-emerald-600/10 border border-emerald-500/20 hover:border-emerald-400/40 transition-all duration-300">
                  <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-xl" />
                  <div className="relative flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center"><span className="text-lg">✅</span></div>
                      <div><p className="text-sm font-semibold text-slate-200">Available Cash</p><p className="text-xs text-slate-500">Current balance</p></div>
                    </div>
                    <p className="text-lg font-bold text-emerald-400 tabular-nums">{cashBreakdown.available.toLocaleString('en-US', { minimumFractionDigits: 2 })} {currencyPrefix}</p>
                  </div>
                </motion.div>
                {cashBreakdown.setting !== 0 && (
                  <motion.div initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.15 }} className={`group relative p-4 rounded-xl ${cashBreakdown.setting > 0 ? 'bg-gradient-to-r from-amber-500/10 to-amber-600/10 border border-amber-500/20 hover:border-amber-400/40' : 'bg-gradient-to-r from-red-500/10 to-red-600/10 border border-red-500/20 hover:border-red-400/40'} transition-all duration-300`}>
                    <div className={`absolute inset-0 ${cashBreakdown.setting > 0 ? 'bg-gradient-to-r from-amber-500/5' : 'bg-gradient-to-r from-red-500/5'} to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-xl`} />
                    <div className="relative flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg ${cashBreakdown.setting > 0 ? 'bg-amber-500/20' : 'bg-red-500/20'} flex items-center justify-center`}><span className="text-lg">{cashBreakdown.setting > 0 ? '⚠️' : '🔻'}</span></div>
                        <div><p className="text-sm font-semibold text-slate-200">Setting Delta</p><p className="text-xs text-slate-500">{cashBreakdown.setting > 0 ? 'Above target' : 'Below target'}</p></div>
                      </div>
                      <p className={`text-lg font-bold ${cashBreakdown.setting > 0 ? 'text-amber-400' : 'text-red-400'} tabular-nums`}>{cashBreakdown.setting > 0 ? '+' : ''}{cashBreakdown.setting.toLocaleString('en-US', { minimumFractionDigits: 2 })} {currencyPrefix}</p>
                    </div>
                  </motion.div>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Invested Breakdown Modal */}
      {showInvestedBreakdown && investedBreakdown && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setShowInvestedBreakdown(false)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: 'spring', duration: 0.5 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl border-2 border-purple-500/30 overflow-hidden"
          >
            <div className="relative px-8 py-6 bg-gradient-to-r from-purple-500/20 to-violet-500/20 border-b border-purple-500/30">
              <div className="relative flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-violet-400 bg-clip-text text-transparent drop-shadow-lg">
                    💼 Total Invested
                  </h2>
                  <p className="text-sm text-slate-400 mt-1">Principal deployed across assets</p>
                </div>
                <button
                  onClick={() => setShowInvestedBreakdown(false)}
                  className="w-10 h-10 rounded-full flex items-center justify-center bg-slate-800/50 hover:bg-slate-700/50 border border-slate-600/50 hover:border-purple-500/50 transition-all duration-300 group"
                >
                  <svg className="w-5 h-5 text-slate-400 group-hover:text-purple-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="px-8 py-6 max-h-[70vh] overflow-y-auto">
              <div className="space-y-3">
                {investedBreakdown.sukuk > 0 && (
                  <motion.div initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.1 }} className="group relative p-4 rounded-xl bg-gradient-to-r from-purple-500/10 to-purple-600/10 border border-purple-500/20 hover:border-purple-400/40 transition-all duration-300">
                    <div className="absolute inset-0 bg-gradient-to-r from-purple-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-xl" />
                    <div className="relative flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center"><span className="text-lg">📜</span></div>
                        <div><p className="text-sm font-semibold text-slate-200">Sukuk</p><p className="text-xs text-slate-500">Islamic bonds</p></div>
                      </div>
                      <p className="text-lg font-bold text-purple-400 tabular-nums">{investedBreakdown.sukuk.toLocaleString('en-US', { minimumFractionDigits: 2 })} {currencyPrefix}</p>
                    </div>
                  </motion.div>
                )}
                {investedBreakdown.malaa > 0 && (
                  <motion.div initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.15 }} className="group relative p-4 rounded-xl bg-gradient-to-r from-blue-500/10 to-blue-600/10 border border-blue-500/20 hover:border-blue-400/40 transition-all duration-300">
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-xl" />
                    <div className="relative flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center"><span className="text-lg">🏦</span></div>
                        <div><p className="text-sm font-semibold text-slate-200">Malaa Capital</p><p className="text-xs text-slate-500">Investment funds</p></div>
                      </div>
                      <p className="text-lg font-bold text-blue-400 tabular-nums">{investedBreakdown.malaa.toLocaleString('en-US', { minimumFractionDigits: 2 })} {currencyPrefix}</p>
                    </div>
                  </motion.div>
                )}
                {investedBreakdown.crypto > 0 && (
                  <motion.div initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.2 }} className="group relative p-4 rounded-xl bg-gradient-to-r from-orange-500/10 to-orange-600/10 border border-orange-500/20 hover:border-orange-400/40 transition-all duration-300">
                    <div className="absolute inset-0 bg-gradient-to-r from-orange-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-xl" />
                    <div className="relative flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center"><span className="text-lg">₿</span></div>
                        <div><p className="text-sm font-semibold text-slate-200">Crypto</p><p className="text-xs text-slate-500">Digital assets</p></div>
                      </div>
                      <p className="text-lg font-bold text-orange-400 tabular-nums">{investedBreakdown.crypto.toLocaleString('en-US', { minimumFractionDigits: 2 })} {currencyPrefix}</p>
                    </div>
                  </motion.div>
                )}
                {investedBreakdown.circlys > 0 && (
                  <motion.div initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.25 }} className="group relative p-4 rounded-xl bg-gradient-to-r from-pink-500/10 to-pink-600/10 border border-pink-500/20 hover:border-pink-400/40 transition-all duration-300">
                    <div className="absolute inset-0 bg-gradient-to-r from-pink-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-xl" />
                    <div className="relative flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-pink-500/20 flex items-center justify-center"><span className="text-lg">🎯</span></div>
                        <div><p className="text-sm font-semibold text-slate-200">Circlys</p><p className="text-xs text-slate-500">ROSCA contributions</p></div>
                      </div>
                      <p className="text-lg font-bold text-pink-400 tabular-nums">{investedBreakdown.circlys.toLocaleString('en-US', { minimumFractionDigits: 2 })} {currencyPrefix}</p>
                    </div>
                  </motion.div>
                )}
                {investedBreakdown.other > 0 && (
                  <motion.div initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.3 }} className="group relative p-4 rounded-xl bg-gradient-to-r from-slate-500/10 to-slate-600/10 border border-slate-500/20 hover:border-slate-400/40 transition-all duration-300">
                    <div className="absolute inset-0 bg-gradient-to-r from-slate-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-xl" />
                    <div className="relative flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-slate-500/20 flex items-center justify-center"><span className="text-lg">💼</span></div>
                        <div><p className="text-sm font-semibold text-slate-200">Other</p><p className="text-xs text-slate-500">Other investments</p></div>
                      </div>
                      <p className="text-lg font-bold text-slate-400 tabular-nums">{investedBreakdown.other.toLocaleString('en-US', { minimumFractionDigits: 2 })} {currencyPrefix}</p>
                    </div>
                  </motion.div>
                )}
              </div>
              <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.35 }} className="mt-6 p-6 rounded-xl bg-gradient-to-r from-purple-500/20 to-violet-500/20 border-2 border-purple-500/40">
                <div className="flex items-center justify-between">
                  <div><p className="text-sm font-medium text-slate-400 uppercase tracking-wider">Total Invested</p><p className="text-xs text-slate-500 mt-1">Principal deployed</p></div>
                  <p className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-violet-400 bg-clip-text text-transparent tabular-nums">{totalInvested.toLocaleString('en-US', { minimumFractionDigits: 2 })} {currencyPrefix}</p>
                </div>
              </motion.div>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Profit Breakdown Modal */}
      {showProfitBreakdown && profitBreakdown && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setShowProfitBreakdown(false)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: 'spring', duration: 0.5 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl border-2 border-emerald-500/30 overflow-hidden"
          >
            {/* Header */}
            <div className="relative px-8 py-6 bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 border-b border-emerald-500/30">
              <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10" />
              <div className="relative flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent drop-shadow-lg">
                    💰 Profit Breakdown
                  </h2>
                  <p className="text-sm text-slate-400 mt-1">Detailed view of all profit sources</p>
                </div>
                <button
                  onClick={() => setShowProfitBreakdown(false)}
                  className="w-10 h-10 rounded-full flex items-center justify-center bg-slate-800/50 hover:bg-slate-700/50 border border-slate-600/50 hover:border-emerald-500/50 transition-all duration-300 group"
                >
                  <svg className="w-5 h-5 text-slate-400 group-hover:text-emerald-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="px-8 py-6 max-h-[70vh] overflow-y-auto">
              <div className="space-y-3">
                {/* Sukuk Receivable */}
                <motion.div
                  initial={{ x: -20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.1 }}
                  className="group relative p-4 rounded-xl bg-gradient-to-r from-purple-500/10 to-purple-600/10 border border-purple-500/20 hover:border-purple-400/40 transition-all duration-300"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-purple-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-xl" />
                  <div className="relative flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                        <span className="text-lg">📊</span>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-200">Sukuk Receivable</p>
                        <p className="text-xs text-slate-500">Pending profit from active deals</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-purple-400 tabular-nums">{profitBreakdown.sukukReceivable.toLocaleString('en-US', { minimumFractionDigits: 2 })} {currencyPrefix}</p>
                    </div>
                  </div>
                </motion.div>

                {/* Sukuk Received */}
                <motion.div
                  initial={{ x: -20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.15 }}
                  className="group relative p-4 rounded-xl bg-gradient-to-r from-emerald-500/10 to-emerald-600/10 border border-emerald-500/20 hover:border-emerald-400/40 transition-all duration-300"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-xl" />
                  <div className="relative flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                        <span className="text-lg">✅</span>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-200">Sukuk Received</p>
                        <p className="text-xs text-slate-500">Profit already withdrawn</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-emerald-400 tabular-nums">{profitBreakdown.sukukReceived.toLocaleString('en-US', { minimumFractionDigits: 2 })} {currencyPrefix}</p>
                    </div>
                  </div>
                </motion.div>

                {/* Commission */}
                <motion.div
                  initial={{ x: -20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="group relative p-4 rounded-xl bg-gradient-to-r from-cyan-500/10 to-cyan-600/10 border border-cyan-500/20 hover:border-cyan-400/40 transition-all duration-300"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-xl" />
                  <div className="relative flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center">
                        <span className="text-lg">💼</span>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-200">Commission</p>
                        <p className="text-xs text-slate-500">Partnership earnings</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-cyan-400 tabular-nums">{profitBreakdown.commission.toLocaleString('en-US', { minimumFractionDigits: 2 })} {currencyPrefix}</p>
                    </div>
                  </div>
                </motion.div>

                {/* Savings Rewards */}
                <motion.div
                  initial={{ x: -20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.25 }}
                  className="group relative p-4 rounded-xl bg-gradient-to-r from-yellow-500/10 to-yellow-600/10 border border-yellow-500/20 hover:border-yellow-400/40 transition-all duration-300"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-yellow-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-xl" />
                  <div className="relative flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-yellow-500/20 flex items-center justify-center">
                        <span className="text-lg">🎁</span>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-200">Savings Rewards</p>
                        <p className="text-xs text-slate-500">Circlys ROSCA earnings</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-yellow-400 tabular-nums">{profitBreakdown.savingsRewards.toLocaleString('en-US', { minimumFractionDigits: 2 })} {currencyPrefix}</p>
                    </div>
                  </div>
                </motion.div>

                {/* Malaa Profit */}
                <motion.div
                  initial={{ x: -20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="group relative p-4 rounded-xl bg-gradient-to-r from-blue-500/10 to-blue-600/10 border border-blue-500/20 hover:border-blue-400/40 transition-all duration-300"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-xl" />
                  <div className="relative flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                        <span className="text-lg">🏦</span>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-200">Malaa Profit</p>
                        <p className="text-xs text-slate-500">Malaa Capital investments</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-blue-400 tabular-nums">{profitBreakdown.malaaProfit.toLocaleString('en-US', { minimumFractionDigits: 2 })} {currencyPrefix}</p>
                    </div>
                  </div>
                </motion.div>

                {/* Crypto Profit */}
                <motion.div
                  initial={{ x: -20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.35 }}
                  className="group relative p-4 rounded-xl bg-gradient-to-r from-orange-500/10 to-orange-600/10 border border-orange-500/20 hover:border-orange-400/40 transition-all duration-300"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-orange-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-xl" />
                  <div className="relative flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center">
                        <span className="text-lg">₿</span>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-200">Crypto Profit</p>
                        <p className="text-xs text-slate-500">Cryptocurrency gains</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-orange-400 tabular-nums">{profitBreakdown.cryptoProfit.toLocaleString('en-US', { minimumFractionDigits: 2 })} {currencyPrefix}</p>
                    </div>
                  </div>
                </motion.div>

                {/* SIP Profit */}
                {profitBreakdown.sipProfit > 0 && (
                  <motion.div
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.4 }}
                    className="group relative p-4 rounded-xl bg-gradient-to-r from-pink-500/10 to-pink-600/10 border border-pink-500/20 hover:border-pink-400/40 transition-all duration-300"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-pink-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-xl" />
                    <div className="relative flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-pink-500/20 flex items-center justify-center">
                          <span className="text-lg">📈</span>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-200">SIP Profit</p>
                          <p className="text-xs text-slate-500">Systematic investment plans</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-pink-400 tabular-nums">{profitBreakdown.sipProfit.toLocaleString('en-US', { minimumFractionDigits: 2 })} {currencyPrefix}</p>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Other Profit */}
                {profitBreakdown.otherProfit > 0 && (
                  <motion.div
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.45 }}
                    className="group relative p-4 rounded-xl bg-gradient-to-r from-slate-500/10 to-slate-600/10 border border-slate-500/20 hover:border-slate-400/40 transition-all duration-300"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-slate-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-xl" />
                    <div className="relative flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-slate-500/20 flex items-center justify-center">
                          <span className="text-lg">💡</span>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-200">Other Profit</p>
                          <p className="text-xs text-slate-500">Other investment sources</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-slate-400 tabular-nums">{profitBreakdown.otherProfit.toLocaleString('en-US', { minimumFractionDigits: 2 })} {currencyPrefix}</p>
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>

              {/* Total Summary */}
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="mt-6 p-6 rounded-xl bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 border-2 border-emerald-500/40"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-400 uppercase tracking-wider">Total Profit</p>
                    <p className="text-xs text-slate-500 mt-1">Sum of all sources</p>
                  </div>
                  <div className="text-right">
                    <p className="text-3xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent tabular-nums">
                      {totalProfit.toLocaleString('en-US', { minimumFractionDigits: 2 })} {currencyPrefix}
                    </p>
                  </div>
                </div>
              </motion.div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  )
}
