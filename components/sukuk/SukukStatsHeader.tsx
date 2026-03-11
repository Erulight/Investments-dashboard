'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

type PlatformTotal = [string, number]

type SukukStatsHeaderProps = {
  role: string
  currency: string
  totalValue: number
  totalReturn: number
  returnPercentage: number
  activeDealsCount: number
  totalWithdrawn: number
  totalFeesPaid: number
  totalReceivable: number
  totalCommissionEarned: number
  totalCommissionPaid: number
  totalPendingFromSoldDeals: number
  avgDaysToMaturity: number | null
  nearMaturityDealsCount: number
  overdueDealsCount: number
  avgOverdueDays: number | null
  realizedCoveragePct: number
  platformTotals: PlatformTotal[]
}

const toSafeNumber = (value: number) => (Number.isFinite(value) ? value : 0)

const formatMoney = (value: number) =>
  toSafeNumber(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

const formatInt = (value: number) =>
  Math.round(toSafeNumber(value)).toLocaleString(undefined)

export function SukukStatsHeader({
  role,
  currency,
  totalValue,
  totalReturn,
  returnPercentage,
  activeDealsCount,
  totalWithdrawn,
  totalFeesPaid,
  totalReceivable,
  totalCommissionEarned,
  totalCommissionPaid,
  totalPendingFromSoldDeals,
  avgDaysToMaturity,
  nearMaturityDealsCount,
  overdueDealsCount,
  avgOverdueDays,
  realizedCoveragePct,
  platformTotals,
}: SukukStatsHeaderProps) {
  const target = useMemo(
    () => ({
      totalValue: toSafeNumber(totalValue),
      totalReturn: toSafeNumber(totalReturn),
      returnPercentage: toSafeNumber(returnPercentage),
      totalWithdrawn: toSafeNumber(totalWithdrawn),
      totalFeesPaid: toSafeNumber(totalFeesPaid),
      totalReceivable: toSafeNumber(totalReceivable),
      totalCommissionEarned: toSafeNumber(totalCommissionEarned),
      totalCommissionPaid: toSafeNumber(totalCommissionPaid),
      totalPendingFromSoldDeals: toSafeNumber(totalPendingFromSoldDeals),
      realizedCoveragePct: toSafeNumber(realizedCoveragePct),
    }),
    [
      totalValue,
      totalReturn,
      returnPercentage,
      totalWithdrawn,
      totalFeesPaid,
      totalReceivable,
      totalCommissionEarned,
      totalCommissionPaid,
      totalPendingFromSoldDeals,
      realizedCoveragePct,
    ],
  )

  const [animated, setAnimated] = useState(target)
  const previousRef = useRef(target)

  useEffect(() => {
    const from = previousRef.current
    const to = target
    const duration = 700
    const start = performance.now()
    let frameId = 0

    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)

      const next = {
        totalValue: from.totalValue + (to.totalValue - from.totalValue) * eased,
        totalReturn: from.totalReturn + (to.totalReturn - from.totalReturn) * eased,
        returnPercentage: from.returnPercentage + (to.returnPercentage - from.returnPercentage) * eased,
        totalWithdrawn: from.totalWithdrawn + (to.totalWithdrawn - from.totalWithdrawn) * eased,
        totalFeesPaid: from.totalFeesPaid + (to.totalFeesPaid - from.totalFeesPaid) * eased,
        totalReceivable: from.totalReceivable + (to.totalReceivable - from.totalReceivable) * eased,
        totalCommissionEarned: from.totalCommissionEarned + (to.totalCommissionEarned - from.totalCommissionEarned) * eased,
        totalCommissionPaid: from.totalCommissionPaid + (to.totalCommissionPaid - from.totalCommissionPaid) * eased,
        totalPendingFromSoldDeals:
          from.totalPendingFromSoldDeals + (to.totalPendingFromSoldDeals - from.totalPendingFromSoldDeals) * eased,
        realizedCoveragePct: from.realizedCoveragePct + (to.realizedCoveragePct - from.realizedCoveragePct) * eased,
      }

      setAnimated(next)
      if (t < 1) {
        frameId = requestAnimationFrame(step)
      } else {
        previousRef.current = to
      }
    }

    frameId = requestAnimationFrame(step)
    return () => {
      if (frameId) cancelAnimationFrame(frameId)
    }
  }, [target])

  const topPlatform = platformTotals[0]
  const topPlatformLabel = topPlatform?.[0] || '—'

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 p-6 text-white shadow-xl">
      <div className="pointer-events-none absolute -top-20 -right-20 h-64 w-64 rounded-full bg-cyan-400/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-16 -left-16 h-56 w-56 rounded-full bg-emerald-400/10 blur-3xl" />

      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Sukuk Investments</h1>
          <p className="mt-1 text-sm text-slate-300">Islamic investment portfolio tracking</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-right">
          <p className="text-[11px] uppercase tracking-wider text-slate-400">Top Platform</p>
          <p className="text-sm font-semibold text-cyan-300">{topPlatformLabel}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="rounded-xl border border-white/10 bg-white/5 p-3 transition-transform duration-300 hover:-translate-y-0.5">
          <p className="text-[11px] uppercase tracking-wider text-slate-400">Portfolio Value</p>
          <p className="mt-1 text-xl font-bold tabular-nums">{formatMoney(animated.totalValue)} {currency}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-3 transition-transform duration-300 hover:-translate-y-0.5">
          <p className="text-[11px] uppercase tracking-wider text-slate-400">Total Return</p>
          <p className="mt-1 text-xl font-bold tabular-nums">{formatMoney(animated.totalReturn)} {currency}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-3 transition-transform duration-300 hover:-translate-y-0.5">
          <p className="text-[11px] uppercase tracking-wider text-slate-400">Return %</p>
          <p
            className={`mt-1 text-xl font-bold tabular-nums ${
              animated.returnPercentage >= 0 ? 'text-emerald-300' : 'text-red-300'
            }`}
          >
            {animated.returnPercentage >= 0 ? '+' : ''}
            {animated.returnPercentage.toFixed(2)}%
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-3 transition-transform duration-300 hover:-translate-y-0.5">
          <p className="text-[11px] uppercase tracking-wider text-slate-400">Active Deals</p>
          <p className="mt-1 text-xl font-bold tabular-nums">{formatInt(activeDealsCount)}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-3 transition-transform duration-300 hover:-translate-y-0.5">
          <div className="mb-1 flex items-center justify-between gap-2">
            <p className="text-[11px] uppercase tracking-wider text-slate-400">Realized Coverage</p>
            <p className="text-xs font-semibold text-cyan-300 tabular-nums">{animated.realizedCoveragePct.toFixed(0)}%</p>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-cyan-400 transition-all duration-700"
              style={{ width: `${Math.min(100, Math.max(0, animated.realizedCoveragePct))}%` }}
            />
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <p className="text-[11px] uppercase tracking-wider text-slate-400">Received</p>
          <p className="mt-1 text-sm font-semibold tabular-nums">{formatMoney(animated.totalWithdrawn)} {currency}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <p className="text-[11px] uppercase tracking-wider text-slate-400">Fees Paid</p>
          <p className="mt-1 text-sm font-semibold tabular-nums">{formatMoney(animated.totalFeesPaid)} {currency}</p>
        </div>
        {role === 'OWNER' ? (
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <p className="text-[11px] uppercase tracking-wider text-slate-400">Commission Earned</p>
            <p className="mt-1 text-sm font-semibold tabular-nums">{formatMoney(animated.totalCommissionEarned)} {currency}</p>
          </div>
        ) : (
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <p className="text-[11px] uppercase tracking-wider text-slate-400">Commission Paid</p>
            <p className="mt-1 text-sm font-semibold tabular-nums">{formatMoney(animated.totalCommissionPaid)} {currency}</p>
          </div>
        )}
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <p className="text-[11px] uppercase tracking-wider text-slate-400">Receivable</p>
          <p className="mt-1 text-sm font-semibold tabular-nums">{formatMoney(animated.totalReceivable)} {currency}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <p className="text-[11px] uppercase tracking-wider text-slate-400">Avg Days to Maturity</p>
          <p className="mt-1 text-sm font-semibold tabular-nums">
            {avgDaysToMaturity === null ? '—' : `${formatInt(avgDaysToMaturity)}d`}
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <p className="text-[11px] uppercase tracking-wider text-slate-400">Near Maturity (≤30d)</p>
          <p className="mt-1 text-sm font-semibold tabular-nums text-emerald-300">{formatInt(nearMaturityDealsCount)}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <p className="text-[11px] uppercase tracking-wider text-slate-400">Overdue Deals</p>
          <p className="mt-1 text-sm font-semibold tabular-nums text-red-300">{formatInt(overdueDealsCount)}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <p className="text-[11px] uppercase tracking-wider text-slate-400">Avg Overdue Days</p>
          <p className="mt-1 text-sm font-semibold tabular-nums text-red-300">
            {avgOverdueDays === null ? '—' : `${formatInt(avgOverdueDays)}d`}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <p className="text-[11px] uppercase tracking-wider text-slate-400">Pending Sold Settlement</p>
          <p className="mt-1 text-sm font-semibold tabular-nums">
            {formatMoney(animated.totalPendingFromSoldDeals)} {currency}
          </p>
        </div>
      </div>

      {platformTotals.length > 0 && (
        <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3">
          <p className="mb-2 text-[11px] uppercase tracking-wider text-slate-400">By Platform</p>
          <div className="space-y-2">
            {(() => {
              const max = Math.max(...platformTotals.map((entry) => entry[1]), 1)
              return platformTotals.slice(0, 5).map(([platform, value]) => {
                const pct = Math.max(0, Math.min(100, (value / max) * 100))
                return (
                  <div key={platform}>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="truncate text-xs text-slate-200">{platform}</span>
                      <span className="text-xs font-semibold tabular-nums text-slate-100">{formatMoney(value)} {currency}</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-emerald-400 transition-all duration-700"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
