'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

type PlatformTotal = [string, number]

type PlatformDeal = { name: string; principal: number; receivable: number }

type DealRow = { name: string; value: number }
type ActiveDealRow = { name: string; platform: string; principal: number; receivable: number }
type DealBreakdowns = {
  totalReturn: DealRow[]
  activeDeals: ActiveDealRow[]
  feesPaid: DealRow[]
  commissionEarned: DealRow[]
  receivable: DealRow[]
}

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
  platformDeals?: Record<string, PlatformDeal[]>
  dealBreakdowns?: DealBreakdowns
}

type DetailRow = { label: string; value: string; color?: string }
type CardDetail = { title: string; color: string; rows: DetailRow[]; extra?: React.ReactNode; dealRows?: DealRow[]; activeDealRows?: ActiveDealRow[] }

function DetailModal({ detail, onClose }: { detail: CardDetail | null; onClose: () => void }) {
  useEffect(() => {
    if (!detail) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [detail, onClose])

  if (!detail) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backdropFilter: 'blur(16px)', background: 'rgba(2,6,23,0.85)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm overflow-hidden rounded-2xl border p-6 shadow-2xl"
        style={{
          background: 'linear-gradient(135deg, rgba(2,6,23,0.98) 0%, rgba(7,28,57,0.98) 100%)',
          borderColor: detail.color,
          boxShadow: `0 0 0 1px ${detail.color}30, 0 0 60px ${detail.color}25, 0 24px 60px rgba(0,0,0,0.8)`,
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="pointer-events-none absolute inset-0 rounded-2xl" style={{ boxShadow: `inset 0 0 40px ${detail.color}10` }} />
        <div className="pointer-events-none absolute -top-8 -right-8 h-24 w-24 rounded-full blur-2xl" style={{ background: `${detail.color}25` }} />

        <div className="relative mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full animate-pulse" style={{ background: detail.color, boxShadow: `0 0 8px ${detail.color}` }} />
            <h3 className="text-base font-bold tracking-tight text-white" style={{ textShadow: `0 0 20px ${detail.color}80` }}>
              {detail.title}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full text-xs text-slate-400 transition-all hover:text-white"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            ✕
          </button>
        </div>

        <div className="relative space-y-2">
          {detail.rows.map((row, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-lg px-3 py-2.5"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <span className="text-[11px] uppercase tracking-wider text-slate-400">{row.label}</span>
              <span className="text-sm font-semibold tabular-nums" style={{ color: row.color ?? '#e2e8f0' }}>
                {row.value}
              </span>
            </div>
          ))}
        </div>

        {detail.dealRows && detail.dealRows.length > 0 && (
          <div className="relative mt-4">
            <p className="mb-2 text-[10px] uppercase tracking-wider text-slate-500">Contributing Deals</p>
            <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
              {detail.dealRows.map((d, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg px-3 py-2"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <span className="text-xs text-slate-300 truncate mr-3 max-w-[55%]">{d.name}</span>
                  <span className="text-xs font-semibold tabular-nums shrink-0" style={{ color: detail.color }}>
                    {d.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {detail.activeDealRows && detail.activeDealRows.length > 0 && (
          <div className="relative mt-4">
            <p className="mb-2 text-[10px] uppercase tracking-wider text-slate-500">Active Deals ({detail.activeDealRows.length})</p>
            <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
              {detail.activeDealRows.map((d, i) => (
                <div
                  key={i}
                  className="rounded-xl p-2.5"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <p className="text-xs font-semibold text-white truncate mb-1.5">{d.name}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-500 truncate flex-1">{d.platform}</span>
                    <span className="text-[10px] tabular-nums shrink-0" style={{ color: '#22d3ee' }}>{d.principal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} principal</span>
                    <span className="text-[10px] tabular-nums shrink-0" style={{ color: '#fb923c' }}>{d.receivable.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} recv</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {detail.extra && <div className="relative mt-4">{detail.extra}</div>}
      </div>
    </div>
  )
}

function NeonCard({
  color,
  children,
  onClick,
  className = '',
}: {
  color: string
  children: React.ReactNode
  onClick: () => void
  className?: string
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`group relative w-full cursor-pointer overflow-hidden rounded-xl border text-left transition-all duration-300 p-3 ${className}`}
      style={{
        background: hovered
          ? `linear-gradient(135deg, rgba(2,6,23,0.95) 0%, ${color}12 100%)`
          : 'rgba(255,255,255,0.03)',
        borderColor: hovered ? color : 'rgba(255,255,255,0.08)',
        boxShadow: hovered ? `0 0 24px ${color}25, 0 0 0 1px ${color}30, 0 8px 32px rgba(0,0,0,0.4)` : '0 0 0 1px transparent',
        transform: hovered ? 'translateY(-3px)' : 'translateY(0)',
      }}
    >
      {hovered && (
        <>
          <div className="pointer-events-none absolute -top-6 -right-6 h-16 w-16 rounded-full blur-xl" style={{ background: `${color}30` }} />
          <div className="pointer-events-none absolute bottom-0 left-0 h-px w-full" style={{ background: `linear-gradient(90deg, transparent, ${color}50, transparent)` }} />
        </>
      )}
      <div className="relative">{children}</div>
    </button>
  )
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
  platformDeals = {},
  dealBreakdowns,
}: SukukStatsHeaderProps) {
  const target = useMemo(() => ({
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
  }), [totalValue, totalReturn, returnPercentage, totalWithdrawn, totalFeesPaid, totalReceivable, totalCommissionEarned, totalCommissionPaid, totalPendingFromSoldDeals, realizedCoveragePct])

  const [animated, setAnimated] = useState(target)
  const previousRef = useRef(target)
  const [modal, setModal] = useState<CardDetail | null>(null)
  const [platformModal, setPlatformModal] = useState<{ platform: string; deals: PlatformDeal[]; total: number } | null>(null)

  useEffect(() => {
    const from = previousRef.current
    const to = target
    const duration = 800
    const start = performance.now()
    let frameId = 0
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const e = 1 - Math.pow(1 - t, 3)
      setAnimated({
        totalValue: lerp(from.totalValue, to.totalValue, e),
        totalReturn: lerp(from.totalReturn, to.totalReturn, e),
        returnPercentage: lerp(from.returnPercentage, to.returnPercentage, e),
        totalWithdrawn: lerp(from.totalWithdrawn, to.totalWithdrawn, e),
        totalFeesPaid: lerp(from.totalFeesPaid, to.totalFeesPaid, e),
        totalReceivable: lerp(from.totalReceivable, to.totalReceivable, e),
        totalCommissionEarned: lerp(from.totalCommissionEarned, to.totalCommissionEarned, e),
        totalCommissionPaid: lerp(from.totalCommissionPaid, to.totalCommissionPaid, e),
        totalPendingFromSoldDeals: lerp(from.totalPendingFromSoldDeals, to.totalPendingFromSoldDeals, e),
        realizedCoveragePct: lerp(from.realizedCoveragePct, to.realizedCoveragePct, e),
      })
      if (t < 1) frameId = requestAnimationFrame(step)
      else previousRef.current = to
    }
    frameId = requestAnimationFrame(step)
    return () => { if (frameId) cancelAnimationFrame(frameId) }
  }, [target])

  const topPlatform = platformTotals[0]
  const topPlatformLabel = topPlatform?.[0] || '—'
  const c = currency

  const platBars = (color: string) => platformTotals.length > 0 ? (
    <div>
      <p className="mb-2 text-[11px] uppercase tracking-wider" style={{ color: '#64748b' }}>Platform Breakdown</p>
      <div className="space-y-2">
        {(() => {
          const max = Math.max(...platformTotals.map(e => e[1]), 1)
          return platformTotals.slice(0, 5).map(([p, v]) => {
            const pct = Math.max(0, Math.min(100, (v / max) * 100))
            return (
              <div key={p}>
                <div className="mb-0.5 flex items-center justify-between text-xs">
                  <span className="text-slate-300 truncate">{p}</span>
                  <span className="ml-2 font-semibold text-slate-100 tabular-nums">{formatMoney(v)} {c}</span>
                </div>
                <div className="h-1 w-full rounded-full bg-white/10">
                  <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color, boxShadow: `0 0 6px ${color}60` }} />
                </div>
              </div>
            )
          })
        })()}
      </div>
    </div>
  ) : undefined

  return (
    <div
      className="relative overflow-hidden rounded-2xl p-6 text-white"
      style={{
        background: 'linear-gradient(135deg, rgba(2,6,23,1) 0%, rgba(7,22,58,1) 50%, rgba(2,6,23,1) 100%)',
        boxShadow: '0 0 0 1px rgba(34,211,238,0.15), 0 25px 80px rgba(0,0,0,0.8)',
      }}
    >
      {/* Ambient neon glows */}
      <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full blur-3xl" style={{ background: 'rgba(34,211,238,0.08)' }} />
      <div className="pointer-events-none absolute -bottom-20 -left-20 h-60 w-60 rounded-full blur-3xl" style={{ background: 'rgba(16,185,129,0.07)' }} />
      <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-96 w-96 rounded-full blur-3xl" style={{ background: 'rgba(139,92,246,0.04)' }} />

      {/* Header */}
      <div className="relative mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white" style={{ textShadow: '0 0 40px rgba(34,211,238,0.3)' }}>
            Sukuk Investments
          </h1>
          <p className="mt-1 text-sm text-slate-400">Islamic investment portfolio tracking</p>
        </div>
        <div
          className="rounded-xl px-3 py-2 text-right"
          style={{ background: 'rgba(34,211,238,0.06)', border: '1px solid rgba(34,211,238,0.2)' }}
        >
          <p className="text-[11px] uppercase tracking-wider text-slate-400">Top Platform</p>
          <p className="text-sm font-semibold" style={{ color: '#22d3ee', textShadow: '0 0 12px rgba(34,211,238,0.5)' }}>{topPlatformLabel}</p>
        </div>
      </div>

      {/* Row 1 — Primary metrics */}
      <div className="relative grid grid-cols-2 lg:grid-cols-5 gap-3">
        <NeonCard color="#22d3ee" onClick={() => setModal({ title: 'Portfolio Value', color: '#22d3ee', rows: [
          { label: 'Active Principal', value: `${formatMoney(animated.totalValue)} ${c}`, color: '#22d3ee' },
          { label: 'Total Profit Earned', value: `${formatMoney(animated.totalReturn)} ${c}`, color: '#10b981' },
          { label: 'Already Received', value: `${formatMoney(animated.totalWithdrawn)} ${c}` },
          { label: 'Still Receivable', value: `${formatMoney(animated.totalReceivable)} ${c}`, color: '#fb923c' },
          { label: 'Fees Deducted', value: `${formatMoney(animated.totalFeesPaid)} ${c}`, color: '#f59e0b' },
        ], extra: platBars('#22d3ee') })}>
          <p className="text-[11px] uppercase tracking-wider text-slate-400">Portfolio Value</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-white">{formatMoney(animated.totalValue)} <span className="text-sm text-slate-400">{c}</span></p>
          <p className="mt-1 text-[10px] text-slate-500">Click for breakdown ›</p>
        </NeonCard>

        <NeonCard color="#10b981" onClick={() => setModal({ title: 'Total Return', color: '#10b981', rows: [
          { label: 'Gross Profit Earned', value: `${formatMoney(animated.totalReturn)} ${c}`, color: '#10b981' },
          { label: 'Received to Date', value: `${formatMoney(animated.totalWithdrawn)} ${c}` },
          { label: 'Pending Receivable', value: `${formatMoney(animated.totalReceivable)} ${c}`, color: '#fb923c' },
          { label: 'Return on Capital', value: `${animated.returnPercentage >= 0 ? '+' : ''}${animated.returnPercentage.toFixed(2)}%`, color: '#10b981' },
        ], dealRows: dealBreakdowns?.totalReturn })}>  
          <p className="text-[11px] uppercase tracking-wider text-slate-400">Total Return</p>
          <p className="mt-1 text-xl font-bold tabular-nums" style={{ color: '#10b981' }}>{formatMoney(animated.totalReturn)} <span className="text-sm text-slate-400">{c}</span></p>
          <p className="mt-1 text-[10px] text-slate-500">Click for breakdown ›</p>
        </NeonCard>

        <NeonCard color={animated.returnPercentage >= 0 ? '#10b981' : '#f87171'} onClick={() => setModal({ title: 'Return %', color: animated.returnPercentage >= 0 ? '#10b981' : '#f87171', rows: [
          { label: 'Total Return Rate', value: `${animated.returnPercentage >= 0 ? '+' : ''}${animated.returnPercentage.toFixed(2)}%`, color: animated.returnPercentage >= 0 ? '#10b981' : '#f87171' },
          { label: 'Profit Earned', value: `${formatMoney(animated.totalReturn)} ${c}` },
          { label: 'Capital Deployed', value: `${formatMoney(animated.totalValue)} ${c}` },
          { label: 'Coverage', value: `${animated.realizedCoveragePct.toFixed(1)}% realized` },
        ], dealRows: dealBreakdowns?.totalReturn })}>
          <p className="text-[11px] uppercase tracking-wider text-slate-400">Return %</p>
          <p className="mt-1 text-xl font-bold tabular-nums" style={{ color: animated.returnPercentage >= 0 ? '#10b981' : '#f87171' }}>
            {animated.returnPercentage >= 0 ? '+' : ''}{animated.returnPercentage.toFixed(2)}%
          </p>
          <p className="mt-1 text-[10px] text-slate-500">Click for breakdown ›</p>
        </NeonCard>

        <NeonCard color="#8b5cf6" onClick={() => setModal({ title: 'Active Deals', color: '#8b5cf6', rows: [
          { label: 'Active Deals', value: formatInt(activeDealsCount), color: '#8b5cf6' },
          { label: 'Near Maturity (\u226430d)', value: formatInt(nearMaturityDealsCount), color: '#f59e0b' },
          { label: 'Overdue Deals', value: formatInt(overdueDealsCount), color: '#f87171' },
          { label: 'Avg Days to Maturity', value: avgDaysToMaturity === null ? '\u2014' : `${formatInt(avgDaysToMaturity)}d` },
          { label: 'Avg Overdue Days', value: avgOverdueDays === null ? '\u2014' : `${formatInt(avgOverdueDays)}d`, color: overdueDealsCount > 0 ? '#f87171' : undefined },
        ], activeDealRows: dealBreakdowns?.activeDeals })}>
          <p className="text-[11px] uppercase tracking-wider text-slate-400">Active Deals</p>
          <p className="mt-1 text-xl font-bold tabular-nums" style={{ color: '#8b5cf6' }}>{formatInt(activeDealsCount)}</p>
          <p className="mt-1 text-[10px] text-slate-500">Click for breakdown ›</p>
        </NeonCard>

        <NeonCard color="#22d3ee" onClick={() => setModal({ title: 'Realized Coverage', color: '#22d3ee', rows: [
          { label: 'Coverage Rate', value: `${animated.realizedCoveragePct.toFixed(1)}%`, color: '#22d3ee' },
          { label: 'Amount Received', value: `${formatMoney(animated.totalWithdrawn)} ${c}` },
          { label: 'Total Profit', value: `${formatMoney(animated.totalReturn)} ${c}` },
          { label: 'Still Pending', value: `${formatMoney(animated.totalReceivable)} ${c}`, color: '#fb923c' },
        ] })}>
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-[11px] uppercase tracking-wider text-slate-400">Realized Coverage</p>
            <p className="text-xs font-bold tabular-nums" style={{ color: '#22d3ee' }}>{animated.realizedCoveragePct.toFixed(0)}%</p>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, Math.max(0, animated.realizedCoveragePct))}%`, background: '#22d3ee', boxShadow: '0 0 8px rgba(34,211,238,0.6)' }} />
          </div>
          <p className="mt-1.5 text-[10px] text-slate-500">Click for breakdown ›</p>
        </NeonCard>
      </div>

      {/* Row 2 — Secondary metrics */}
      <div className="relative mt-3 grid grid-cols-2 lg:grid-cols-5 gap-3">
        <NeonCard color="#38bdf8" onClick={() => setModal({ title: 'Received', color: '#38bdf8', rows: [
          { label: 'Total Received', value: `${formatMoney(animated.totalWithdrawn)} ${c}`, color: '#38bdf8' },
          { label: 'Coverage Rate', value: `${animated.realizedCoveragePct.toFixed(1)}%` },
          { label: 'Still Pending', value: `${formatMoney(animated.totalReceivable)} ${c}`, color: '#fb923c' },
          { label: 'Fees Paid', value: `${formatMoney(animated.totalFeesPaid)} ${c}`, color: '#f59e0b' },
        ] })}>
          <p className="text-[11px] uppercase tracking-wider text-slate-400">Received</p>
          <p className="mt-1 text-sm font-semibold tabular-nums" style={{ color: '#38bdf8' }}>{formatMoney(animated.totalWithdrawn)} <span className="text-xs text-slate-500">{c}</span></p>
        </NeonCard>

        <NeonCard color="#f59e0b" onClick={() => setModal({ title: 'Fees Paid', color: '#f59e0b', rows: [
          { label: 'Total Fees Paid', value: `${formatMoney(animated.totalFeesPaid)} ${c}`, color: '#f59e0b' },
          { label: 'Gross Return', value: `${formatMoney(animated.totalReturn + animated.totalFeesPaid)} ${c}` },
          { label: 'Net Return', value: `${formatMoney(animated.totalReturn)} ${c}`, color: '#10b981' },
          { label: 'Fee Impact', value: animated.totalReturn + animated.totalFeesPaid > 0 ? `${((animated.totalFeesPaid / (animated.totalReturn + animated.totalFeesPaid)) * 100).toFixed(1)}% of gross` : '\u2014' },
        ], dealRows: dealBreakdowns?.feesPaid })}>
          <p className="text-[11px] uppercase tracking-wider text-slate-400">Fees Paid</p>
          <p className="mt-1 text-sm font-semibold tabular-nums" style={{ color: '#f59e0b' }}>{formatMoney(animated.totalFeesPaid)} <span className="text-xs text-slate-500">{c}</span></p>
        </NeonCard>

        <NeonCard color="#a855f7" onClick={() => setModal({ title: role === 'OWNER' ? 'Commission Earned' : 'Commission Paid', color: '#a855f7', rows: role === 'OWNER' ? [
          { label: 'Commission Earned', value: `${formatMoney(animated.totalCommissionEarned)} ${c}`, color: '#a855f7' },
          { label: 'Total Return', value: `${formatMoney(animated.totalReturn)} ${c}` },
          { label: 'Commission Rate', value: animated.totalReturn > 0 ? `${((animated.totalCommissionEarned / animated.totalReturn) * 100).toFixed(1)}%` : '\u2014' },
        ] : [
          { label: 'Commission Paid', value: `${formatMoney(animated.totalCommissionPaid)} ${c}`, color: '#a855f7' },
          { label: 'Gross Return', value: `${formatMoney(animated.totalReturn + animated.totalCommissionPaid)} ${c}` },
          { label: 'Net After Commission', value: `${formatMoney(animated.totalReturn)} ${c}`, color: '#10b981' },
        ], dealRows: role === 'OWNER' ? dealBreakdowns?.commissionEarned : undefined })}>
          <p className="text-[11px] uppercase tracking-wider text-slate-400">{role === 'OWNER' ? 'Commission Earned' : 'Commission Paid'}</p>
          <p className="mt-1 text-sm font-semibold tabular-nums" style={{ color: '#a855f7' }}>
            {formatMoney(role === 'OWNER' ? animated.totalCommissionEarned : animated.totalCommissionPaid)} <span className="text-xs text-slate-500">{c}</span>
          </p>
        </NeonCard>

        <NeonCard color="#fb923c" onClick={() => setModal({ title: 'Receivable', color: '#fb923c', rows: [
          { label: 'Total Receivable', value: `${formatMoney(animated.totalReceivable)} ${c}`, color: '#fb923c' },
          { label: 'Already Received', value: `${formatMoney(animated.totalWithdrawn)} ${c}`, color: '#10b981' },
          { label: 'Total Expected', value: `${formatMoney(animated.totalReceivable + animated.totalWithdrawn)} ${c}` },
          { label: 'Pending %', value: animated.totalReceivable + animated.totalWithdrawn > 0 ? `${((animated.totalReceivable / (animated.totalReceivable + animated.totalWithdrawn)) * 100).toFixed(1)}%` : '\u2014' },
        ], dealRows: dealBreakdowns?.receivable })}>
          <p className="text-[11px] uppercase tracking-wider text-slate-400">Receivable</p>
          <p className="mt-1 text-sm font-semibold tabular-nums" style={{ color: '#fb923c' }}>{formatMoney(animated.totalReceivable)} <span className="text-xs text-slate-500">{c}</span></p>
        </NeonCard>

        <NeonCard color="#94a3b8" onClick={() => setModal({ title: 'Avg Days to Maturity', color: '#94a3b8', rows: [
          { label: 'Avg Days to Maturity', value: avgDaysToMaturity === null ? '\u2014' : `${formatInt(avgDaysToMaturity)} days`, color: '#94a3b8' },
          { label: 'Near Maturity (\u226430d)', value: formatInt(nearMaturityDealsCount), color: nearMaturityDealsCount > 0 ? '#f59e0b' : undefined },
          { label: 'Overdue Deals', value: formatInt(overdueDealsCount), color: overdueDealsCount > 0 ? '#f87171' : undefined },
          { label: 'Avg Overdue Days', value: avgOverdueDays === null ? '\u2014' : `${formatInt(avgOverdueDays)} days`, color: overdueDealsCount > 0 ? '#f87171' : undefined },
        ] })}>
          <p className="text-[11px] uppercase tracking-wider text-slate-400">Avg Days to Maturity</p>
          <p className="mt-1 text-sm font-semibold tabular-nums text-slate-200">
            {avgDaysToMaturity === null ? '\u2014' : `${formatInt(avgDaysToMaturity)}d`}
          </p>
        </NeonCard>
      </div>

      {/* Row 3 — Alert metrics */}
      <div className="relative mt-3 grid grid-cols-1 lg:grid-cols-4 gap-3">
        <NeonCard color="#f59e0b" onClick={() => setModal({ title: 'Near Maturity (≤30d)', color: '#f59e0b', rows: [
          { label: 'Deals Near Maturity', value: formatInt(nearMaturityDealsCount), color: '#f59e0b' },
          { label: 'Threshold', value: '≤ 30 days' },
          { label: 'Total Active Deals', value: formatInt(activeDealsCount) },
          { label: 'Urgency Rate', value: activeDealsCount > 0 ? `${((nearMaturityDealsCount / activeDealsCount) * 100).toFixed(0)}% of active` : '—', color: nearMaturityDealsCount > 0 ? '#f59e0b' : undefined },
        ] })}>
          <p className="text-[11px] uppercase tracking-wider text-slate-400">Near Maturity (≤30d)</p>
          <p className="mt-1 text-sm font-semibold tabular-nums" style={{ color: nearMaturityDealsCount > 0 ? '#f59e0b' : '#64748b' }}>{formatInt(nearMaturityDealsCount)}</p>
        </NeonCard>

        <NeonCard color="#f87171" onClick={() => setModal({ title: 'Overdue Deals', color: '#f87171', rows: [
          { label: 'Overdue Deals Count', value: formatInt(overdueDealsCount), color: overdueDealsCount > 0 ? '#f87171' : undefined },
          { label: 'Avg Overdue Days', value: avgOverdueDays === null ? '—' : `${formatInt(avgOverdueDays)}d`, color: overdueDealsCount > 0 ? '#f87171' : undefined },
          { label: 'Total Active Deals', value: formatInt(activeDealsCount) },
          { label: 'Overdue Rate', value: activeDealsCount > 0 ? `${((overdueDealsCount / activeDealsCount) * 100).toFixed(0)}% of active` : '—', color: overdueDealsCount > 0 ? '#f87171' : undefined },
        ] })}>
          <p className="text-[11px] uppercase tracking-wider text-slate-400">Overdue Deals</p>
          <p className="mt-1 text-sm font-semibold tabular-nums" style={{ color: overdueDealsCount > 0 ? '#f87171' : '#64748b' }}>{formatInt(overdueDealsCount)}</p>
        </NeonCard>

        <NeonCard color="#f87171" onClick={() => setModal({ title: 'Avg Overdue Days', color: '#f87171', rows: [
          { label: 'Avg Overdue Days', value: avgOverdueDays === null ? '—' : `${formatInt(avgOverdueDays)} days`, color: overdueDealsCount > 0 ? '#f87171' : undefined },
          { label: 'Overdue Deals', value: formatInt(overdueDealsCount), color: overdueDealsCount > 0 ? '#f87171' : undefined },
          { label: 'Severity', value: avgOverdueDays === null ? 'None' : avgOverdueDays > 30 ? 'High' : avgOverdueDays > 14 ? 'Medium' : 'Low', color: avgOverdueDays === null ? undefined : avgOverdueDays > 30 ? '#f87171' : '#f59e0b' },
        ] })}>
          <p className="text-[11px] uppercase tracking-wider text-slate-400">Avg Overdue Days</p>
          <p className="mt-1 text-sm font-semibold tabular-nums" style={{ color: overdueDealsCount > 0 ? '#f87171' : '#64748b' }}>
            {avgOverdueDays === null ? '—' : `${formatInt(avgOverdueDays)}d`}
          </p>
        </NeonCard>

        <NeonCard color="#e2e8f0" onClick={() => setModal({ title: 'Pending Sold Settlement', color: '#e2e8f0', rows: [
          { label: 'Pending Settlement', value: `${formatMoney(animated.totalPendingFromSoldDeals)} ${c}`, color: animated.totalPendingFromSoldDeals > 0 ? '#e2e8f0' : '#64748b' },
          { label: 'Total Received', value: `${formatMoney(animated.totalWithdrawn)} ${c}` },
          { label: 'Outstanding Receivable', value: `${formatMoney(animated.totalReceivable)} ${c}`, color: '#fb923c' },
        ] })}>
          <p className="text-[11px] uppercase tracking-wider text-slate-400">Pending Sold Settlement</p>
          <p className="mt-1 text-sm font-semibold tabular-nums text-slate-200">{formatMoney(animated.totalPendingFromSoldDeals)} <span className="text-xs text-slate-500">{c}</span></p>
        </NeonCard>
      </div>

      {/* Platform chart */}
      {platformTotals.length > 0 && (
        <div
          className="relative mt-3 rounded-xl p-4"
          style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          <p className="mb-3 text-[11px] uppercase tracking-wider text-slate-400">By Platform <span className="normal-case text-slate-500">(active only · click to see deals)</span></p>
          <div className="space-y-2.5">
            {(() => {
              const max = Math.max(...platformTotals.map(e => e[1]), 1)
              const colors = ['#22d3ee', '#10b981', '#8b5cf6', '#f59e0b', '#f87171']
              return platformTotals.slice(0, 8).map(([platform, value], i) => {
                const pct = Math.max(0, Math.min(100, (value / max) * 100))
                const col = colors[i % colors.length]
                const deals = platformDeals[platform] ?? []
                return (
                  <button
                    key={platform}
                    type="button"
                    onClick={() => setPlatformModal({ platform, deals, total: value })}
                    className="w-full text-left group"
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-medium group-hover:text-white transition-colors" style={{ color: col }}>{platform}</span>
                      <span className="text-xs font-semibold tabular-nums text-slate-100">{formatMoney(value)} {c}</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full transition-all duration-700 group-hover:brightness-125" style={{ width: `${pct}%`, background: col, boxShadow: `0 0 8px ${col}50` }} />
                    </div>
                  </button>
                )
              })
            })()}
          </div>
        </div>
      )}

      <DetailModal detail={modal} onClose={() => setModal(null)} />

      {/* Platform deal popup */}
      {platformModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backdropFilter: 'blur(16px)', background: 'rgba(2,6,23,0.85)' }}
          onClick={() => setPlatformModal(null)}
        >
          <div
            className="relative w-full max-w-md overflow-hidden rounded-2xl border p-6 shadow-2xl"
            style={{
              background: 'linear-gradient(135deg, rgba(2,6,23,0.98) 0%, rgba(7,28,57,0.98) 100%)',
              borderColor: '#22d3ee',
              boxShadow: '0 0 0 1px rgba(34,211,238,0.3), 0 0 60px rgba(34,211,238,0.15), 0 24px 60px rgba(0,0,0,0.8)',
              maxHeight: '85vh',
              overflowY: 'auto',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div className="pointer-events-none absolute -top-8 -right-8 h-24 w-24 rounded-full blur-2xl" style={{ background: 'rgba(34,211,238,0.2)' }} />

            <div className="relative mb-5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full animate-pulse" style={{ background: '#22d3ee', boxShadow: '0 0 8px #22d3ee' }} />
                <div>
                  <h3 className="text-base font-bold text-white" style={{ textShadow: '0 0 20px rgba(34,211,238,0.6)' }}>{platformModal.platform}</h3>
                  <p className="text-[11px] text-slate-400">{platformModal.deals.length} active deal{platformModal.deals.length !== 1 ? 's' : ''} · {formatMoney(platformModal.total)} {c} total</p>
                </div>
              </div>
              <button
                onClick={() => setPlatformModal(null)}
                className="flex h-7 w-7 items-center justify-center rounded-full text-xs text-slate-400 transition-all hover:text-white"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                ✕
              </button>
            </div>

            {platformModal.deals.length === 0 ? (
              <p className="text-sm text-slate-500">No active deals found for this platform.</p>
            ) : (
              <div className="relative space-y-2">
                {platformModal.deals.map((deal, i) => (
                  <div
                    key={i}
                    className="rounded-xl p-3"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                  >
                    <p className="mb-2 text-sm font-semibold text-white truncate">{deal.name}</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-lg px-2.5 py-1.5" style={{ background: 'rgba(34,211,238,0.06)', border: '1px solid rgba(34,211,238,0.15)' }}>
                        <p className="text-[10px] uppercase tracking-wider text-slate-400">Remaining Principal</p>
                        <p className="mt-0.5 text-sm font-bold tabular-nums" style={{ color: '#22d3ee' }}>{formatMoney(deal.principal)} {c}</p>
                      </div>
                      <div className="rounded-lg px-2.5 py-1.5" style={{ background: 'rgba(251,146,60,0.06)', border: '1px solid rgba(251,146,60,0.15)' }}>
                        <p className="text-[10px] uppercase tracking-wider text-slate-400">Receivable</p>
                        <p className="mt-0.5 text-sm font-bold tabular-nums" style={{ color: '#fb923c' }}>{formatMoney(deal.receivable)} {c}</p>
                      </div>
                    </div>
                  </div>
                ))}

                <div
                  className="mt-3 rounded-xl p-3 flex items-center justify-between"
                  style={{ background: 'rgba(34,211,238,0.06)', border: '1px solid rgba(34,211,238,0.2)' }}
                >
                  <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#22d3ee' }}>Platform Total</span>
                  <span className="text-sm font-bold tabular-nums text-white">{formatMoney(platformModal.total)} {c}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
