import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { SukukList } from '@/components/sukuk/SukukList'
import { requireModuleAccess } from '@/lib/rbac'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function InvestmentsPage() {
  await requireModuleAccess('sukuk')
  const user = await getCurrentUser()
  
  if (!user) {
    return null
  }

  let investments: any[] = []

  if (user.role === 'OWNER') {
    investments = await prisma.investment.findMany({
      where: {
        account: {
          type: 'SUKUK',
          isActive: true,
        },
      },
      include: {
        account: true,
        dealParticipants: {
          include: { person: true },
        },
        transactions: {
          where: {
            type: {
              in: [
                'WITHDRAW_PROFIT',
                'WITHDRAW_PRINCIPAL',
                'SELL_TO_PARTNER',
                'SELL_PROFIT_ACCRUED',
                'BUY_FROM_PARTNER',
                'PARTNER_COMMISSION',
              ],
            },
          },
          orderBy: { date: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    })
  } else if (user.role === 'PARTNER' && user.personId) {
    const participants = await prisma.dealParticipant.findMany({
      where: {
        personId: user.personId,
        investment: {
          account: {
            type: 'SUKUK',
            isActive: true,
          },
        },
      },
      include: {
        investment: {
          include: {
            account: true,
            transactions: {
              where: {
                type: {
                  in: [
                    'WITHDRAW_PROFIT',
                    'WITHDRAW_PRINCIPAL',
                    'SELL_TO_PARTNER',
                    'SELL_PROFIT_ACCRUED',
                    'BUY_FROM_PARTNER',
                    'PARTNER_COMMISSION',
                  ],
                },
              },
              orderBy: { date: 'asc' },
            },
          },
        },
      },
    })
    
    investments = participants.map((p: any) => ({
      ...p.investment,
      myParticipation: {
        investedAmount: p.investedAmount,
        currentValue: p.currentValue,
        profit: p.profit,
        acquiredAt: p.acquiredAt,
        commissionFees: p.commissionFees,
      },
    }))
  }

  const toDate = (value?: string | Date | null) => {
    if (!value) return null
    if (value instanceof Date) return value
    if (typeof value === 'string') {
      const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
      if (match) {
        const [, year, month, day] = match
        return new Date(Number(year), Number(month) - 1, Number(day))
      }
    }
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return null
    return date
  }

  const getPeriodMonths = (start?: string | Date | null, end?: string | Date | null) => {
    const startDate = toDate(start)
    const endDate = toDate(end)
    if (!startDate || !endDate) return 0
    const months = (endDate.getFullYear() - startDate.getFullYear()) * 12
      + (endDate.getMonth() - startDate.getMonth())
      + (endDate.getDate() - startDate.getDate()) / 30
    return Math.max(0, months)
  }

  const round2 = (value: number) => {
    const n = Number(value)
    if (!Number.isFinite(n)) return 0
    return Math.round(n * 100) / 100
  }

  const getViewerReceived = (inv: any) => {
    const transactions = Array.isArray(inv.transactions) ? inv.transactions : []
    const profitWithdrawals = transactions.filter((tx: any) => tx.type === 'WITHDRAW_PROFIT')

    const realizedFromSales = transactions
      .filter((tx: any) => tx.type === 'SELL_PROFIT_ACCRUED')
      .reduce((sum: number, tx: any) => {
        if (user.personId && tx.personId !== user.personId) return sum
        const amount = Number(tx.amount)
        return sum + (Number.isFinite(amount) ? amount : 0)
      }, 0)

    if (user.personId) {
      const withdrawn = profitWithdrawals.reduce((sum: number, tx: any) => {
        if (tx.personId !== user.personId) return sum
        const amount = Number(tx.amount)
        return sum + (Number.isFinite(amount) ? amount : 0)
      }, 0)

      return withdrawn + realizedFromSales
    }

    const totalReceived = Number(inv.totalReceived)
    return Number.isFinite(totalReceived)
      ? totalReceived + realizedFromSales
      : profitWithdrawals.reduce((sum: number, tx: any) => {
          const amount = Number(tx.amount)
          return sum + (Number.isFinite(amount) ? amount : 0)
        }, 0) + realizedFromSales
  }

  const parseMetadata = (value: unknown) => {
    if (!value) return null
    if (typeof value === 'object') return value as any
    if (typeof value !== 'string') return null
    try {
      return JSON.parse(value)
    } catch {
      return null
    }
  }

  const getPartnerCommissionPaid = (inv: any) => {
    if (user.role !== 'PARTNER' || !user.personId) return 0
    const transactions = Array.isArray(inv.transactions) ? inv.transactions : []
    return transactions
      .filter((tx: any) => tx.type === 'BUY_FROM_PARTNER' && tx.personId === user.personId)
      .reduce((sum: number, tx: any) => {
        const meta = parseMetadata(tx.metadata)
        const commission = Number(meta?.commissionAmount ?? 0)
        return sum + (Number.isFinite(commission) ? Math.max(0, commission) : 0)
      }, 0)
  }

  const getOwnerRealizedProfitFromSales = (inv: any) => {
    if (user.role !== 'OWNER' || !user.personId) return 0
    const transactions = Array.isArray(inv.transactions) ? inv.transactions : []
    const profit = transactions
      .filter((tx: any) => tx.type === 'SELL_PROFIT_ACCRUED' && tx.personId === user.personId)
      .reduce((sum: number, tx: any) => {
        const amount = Number(tx.amount)
        return sum + (Number.isFinite(amount) ? amount : 0)
      }, 0)
    return Math.max(0, profit)
  }

  const getOwnerRealizedFromSellMeta = (inv: any) => {
    if (user.role !== 'OWNER' || !user.personId) return { profit: 0, commission: 0 }
    const transactions = Array.isArray(inv.transactions) ? inv.transactions : []
    return transactions
      .filter((tx: any) => tx.type === 'SELL_TO_PARTNER' && tx.personId === user.personId)
      .reduce(
        (acc: { profit: number, commission: number }, tx: any) => {
          const meta = parseMetadata(tx.metadata)
          const profit = Number(meta?.accruedProfitAtSale ?? 0)
          const commission = Number(meta?.commissionAmount ?? 0)
          return {
            profit: acc.profit + (Number.isFinite(profit) ? Math.max(0, profit) : 0),
            commission: acc.commission + (Number.isFinite(commission) ? Math.max(0, commission) : 0),
          }
        },
        { profit: 0, commission: 0 }
      )
  }

  const getNetProfit = (inv: any) => {
    const principal = inv.myParticipation?.investedAmount ?? inv.principalAmount
    const investment = Number.isFinite(principal) ? principal : 0
    const apr = Number.isFinite(inv.interestRate) ? inv.interestRate : 0
    const fees = Number.isFinite(inv.fees) ? inv.fees : 0
    const participationRatio = inv.principalAmount > 0 && investment > 0
      ? Math.min(1, investment / inv.principalAmount)
      : 0
    const startBasis = inv.myParticipation?.acquiredAt ?? inv.startDate
    const totalMonthsFull = getPeriodMonths(inv.startDate, inv.maturityDate)
    const periodMonths = getPeriodMonths(startBasis, inv.maturityDate)
    const periodYears = periodMonths ? periodMonths / 12 : 0
    const grossProfit = investment > 0 && apr > 0 && periodYears > 0
      ? investment * (apr / 100) * periodYears
      : 0

    const manualReceivableFull = Number.isFinite(inv.receivableAmount) ? inv.receivableAmount : null
    const manualReceivable = manualReceivableFull !== null && manualReceivableFull > 0
      ? (inv.myParticipation
          ? (manualReceivableFull * participationRatio) * (totalMonthsFull > 0 ? Math.min(1, Math.max(0, periodMonths / totalMonthsFull)) : 1)
          : manualReceivableFull)
      : null
    if (manualReceivable !== null) {
      const commissionFees = user.role === 'PARTNER'
        ? (Number.isFinite(inv.myParticipation?.commissionFees)
            ? Number(inv.myParticipation.commissionFees)
            : getPartnerCommissionPaid(inv))
        : (Number.isFinite(inv.myParticipation?.commissionFees)
            ? Number(inv.myParticipation.commissionFees)
            : 0)
      return Math.max(0, manualReceivable - commissionFees)
    }
    const commissionFees = user.role === 'PARTNER'
      ? (Number.isFinite(inv.myParticipation?.commissionFees)
          ? Number(inv.myParticipation.commissionFees)
          : getPartnerCommissionPaid(inv))
      : (Number.isFinite(inv.myParticipation?.commissionFees)
          ? Number(inv.myParticipation.commissionFees)
          : 0)
    const timeRatio = inv.myParticipation && totalMonthsFull > 0
      ? Math.min(1, Math.max(0, periodMonths / totalMonthsFull))
      : 1
    const proratedFees = inv.myParticipation
      ? (fees * participationRatio) * timeRatio
      : fees
    return Math.max(0, grossProfit - proratedFees - commissionFees)
  }

  const isActiveDeal = (inv: any) => {
    const netProfit = getNetProfit(inv)
    const totalReceived = getViewerReceived(inv)
    const receivable = netProfit - totalReceived
    return receivable > 0.01
  }

  const displayedInvestments = (() => {
    if (user.role !== 'OWNER' || !user.personId) return investments
    return investments.filter((inv: any) => {
      const participants = Array.isArray(inv.dealParticipants) ? inv.dealParticipants : []
      if (participants.length === 0) return true
      return participants.some((p: any) => p.personId === user.personId)
    })
  })()

  const activeInvestments = displayedInvestments.filter(isActiveDeal)

  const totalInvested = displayedInvestments.reduce((sum, inv) => {
    const principal = inv.myParticipation?.investedAmount || inv.principalAmount
    return sum + (Number.isFinite(principal) ? principal : 0)
  }, 0)

  const totalNetProfit = (() => {
    // Owner: include realized profit + commission from sold deals even after ownership is removed
    if (user.role === 'OWNER') {
      const activeProfit = displayedInvestments.reduce((sum, inv) => sum + getNetProfit(inv), 0)
      const soldProfit = investments.reduce((sum, inv) => sum + getOwnerRealizedProfitFromSales(inv), 0)
      const soldFromMeta = investments.reduce((sum, inv) => sum + getOwnerRealizedFromSellMeta(inv).profit, 0)
      return round2(activeProfit + Math.max(soldProfit, soldFromMeta))
    }

    return round2(displayedInvestments.reduce((sum, inv) => sum + getNetProfit(inv), 0))
  })()

  const totalWithdrawn = (() => {
    const activeReceived = displayedInvestments.reduce((sum, inv) => sum + getViewerReceived(inv), 0)
    if (user.role !== 'OWNER' || !user.personId) return round2(activeReceived)
    const soldProfitAccrued = investments.reduce((sum, inv) => sum + getOwnerRealizedProfitFromSales(inv), 0)
    const soldProfitMeta = investments.reduce((sum, inv) => sum + getOwnerRealizedFromSellMeta(inv).profit, 0)
    return round2(activeReceived + Math.max(soldProfitAccrued, soldProfitMeta))
  })()

  const totalCommissionEarned = (() => {
    if (user.role !== 'OWNER' || !user.personId) return 0
    const fromCommissionTx = investments.reduce((sum, inv) => {
      const transactions = Array.isArray(inv.transactions) ? inv.transactions : []
      const commission = transactions
        .filter((tx: any) => tx.type === 'PARTNER_COMMISSION' && tx.personId === user.personId)
        .reduce((acc: number, tx: any) => {
          const amount = Number(tx.amount)
          return acc + (Number.isFinite(amount) ? amount : 0)
        }, 0)
      return sum + Math.max(0, commission)
    }, 0)

    const fromSellMeta = investments.reduce((sum, inv) => sum + getOwnerRealizedFromSellMeta(inv).commission, 0)
    return Math.max(fromCommissionTx, fromSellMeta)
  })()

  const totalReceivable = round2(Math.max(0, totalNetProfit - totalWithdrawn))

  const totalValue = totalInvested
  const totalReturn = totalNetProfit
  const returnPercentage = totalInvested > 0 ? ((totalReturn / totalInvested) * 100) : 0
  const activeDealsCount = activeInvestments.length

  const totalFeesPaid = round2(displayedInvestments.reduce((sum, inv) => {
    const principal = inv.myParticipation?.investedAmount ?? inv.principalAmount
    const investment = Number.isFinite(principal) ? principal : 0
    const ratio = inv.principalAmount > 0 && investment > 0 ? Math.min(1, investment / inv.principalAmount) : 0
    const fees = Number.isFinite(inv.fees) ? inv.fees : 0
    const startBasis = inv.myParticipation?.acquiredAt ?? inv.startDate
    const monthsHeld = getPeriodMonths(startBasis, inv.maturityDate)
    const totalMonthsFull = getPeriodMonths(inv.startDate, inv.maturityDate)
    const timeRatio = inv.myParticipation && totalMonthsFull > 0
      ? Math.min(1, Math.max(0, monthsHeld / totalMonthsFull))
      : 1
    return sum + (inv.myParticipation ? (fees * ratio) * timeRatio : fees)
  }, 0))

  const avgDaysToMaturity = (() => {
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const withDays = activeInvestments
      .map((inv) => {
        const maturity = toDate(inv.maturityDate)
        if (!maturity) return null
        const mStart = new Date(maturity.getFullYear(), maturity.getMonth(), maturity.getDate())
        const diffMs = mStart.getTime() - todayStart.getTime()
        const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
        return Number.isFinite(days) ? days : null
      })
      .filter((v): v is number => v !== null)

    if (withDays.length === 0) return null
    return withDays.reduce((sum, v) => sum + v, 0) / withDays.length
  })()

  const platformTotals: Array<[string, number]> = Array.from(
    displayedInvestments
      .reduce((map: Map<string, number>, inv: any) => {
        const platform = inv.account?.name || 'Unknown'
        const principal = inv.myParticipation?.investedAmount || inv.principalAmount
        const invested = Number.isFinite(principal) ? principal : 0
        map.set(platform, (map.get(platform) ?? 0) + invested)
        return map
      }, new Map<string, number>())
      .entries()
  ).sort((a, b) => b[1] - a[1])

  const getMonthKey = (value?: string | Date | null) => {
    const date = toDate(value)
    if (!date) return null
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    return `${y}-${m}`
  }

  const monthKeyToLabel = (key: string) => {
    const match = key.match(/^(\d{4})-(\d{2})$/)
    if (!match) return key
    const [, y, m] = match
    return `${m}/${y}`
  }

  const getMonthlySeries = (sourceInvestments: any[]) => {
    const buckets = new Map<string, { received: number; realizedProfit: number }>()

    for (const inv of sourceInvestments) {
      const transactions = Array.isArray(inv.transactions) ? inv.transactions : []
      for (const tx of transactions) {
        const key = getMonthKey(tx.date)
        if (!key) continue

        const type = String(tx.type || '')
        const amountRaw = Number(tx.amount)
        const amount = Number.isFinite(amountRaw) ? amountRaw : 0

        const viewerOk = !user.personId || tx.personId === user.personId
        if (!viewerOk) continue

        const current = buckets.get(key) ?? { received: 0, realizedProfit: 0 }

        if (type === 'WITHDRAW_PROFIT') {
          current.received += Math.max(0, amount)
          current.realizedProfit += Math.max(0, amount)
        }

        if (type === 'SELL_PROFIT_ACCRUED' || type === 'PARTNER_COMMISSION') {
          current.received += Math.max(0, amount)
          current.realizedProfit += Math.max(0, amount)
        }

        buckets.set(key, current)
      }
    }

    const keys = Array.from(buckets.keys()).sort()
    return keys.map((k) => ({
      key: k,
      label: monthKeyToLabel(k),
      received: buckets.get(k)?.received ?? 0,
      realizedProfit: buckets.get(k)?.realizedProfit ?? 0,
    }))
  }

  const analyticsSource = user.role === 'OWNER' ? investments : displayedInvestments
  const monthlySeries = getMonthlySeries(analyticsSource)

  const renderSparkline = (points: number[]) => {
    const width = 560
    const height = 120
    if (points.length === 0) return null

    const max = Math.max(...points, 0)
    const min = Math.min(...points, 0)
    const range = Math.max(1e-6, max - min)
    const stepX = points.length > 1 ? width / (points.length - 1) : width

    const path = points
      .map((v, i) => {
        const x = i * stepX
        const y = height - ((v - min) / range) * height
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
      })
      .join(' ')

    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-28">
        <path d={path} fill="none" stroke="#0f172a" strokeWidth="2" />
      </svg>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-xl shadow-md p-6 text-white">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-2xl font-bold">Sukuk Investments</h1>
            <p className="text-sm text-slate-400 mt-1">Islamic investment portfolio tracking</p>
          </div>
          <span className="hidden lg:block text-4xl opacity-80">💎</span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white/5 rounded-lg p-3 border border-white/10">
            <p className="text-[11px] text-slate-400 uppercase tracking-wider">Portfolio Value</p>
            <p className="text-lg font-bold mt-0.5">SAR {totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
          </div>
          <div className="bg-white/5 rounded-lg p-3 border border-white/10">
            <p className="text-[11px] text-slate-400 uppercase tracking-wider">Total Return</p>
            <p className="text-lg font-bold mt-0.5">SAR {totalReturn.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </div>
          <div className="bg-white/5 rounded-lg p-3 border border-white/10">
            <p className="text-[11px] text-slate-400 uppercase tracking-wider">Return %</p>
            <p className={`text-lg font-bold mt-0.5 ${returnPercentage >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {returnPercentage >= 0 ? '+' : ''}{returnPercentage.toFixed(2)}%
            </p>
          </div>
          <div className="bg-white/5 rounded-lg p-3 border border-white/10">
            <p className="text-[11px] text-slate-400 uppercase tracking-wider">Active Deals</p>
            <p className="text-lg font-bold mt-0.5">{activeDealsCount}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-3">
          <div className="bg-white/5 rounded-lg p-3 border border-white/10">
            <p className="text-[11px] text-slate-400 uppercase tracking-wider">Received</p>
            <p className="text-sm font-bold mt-0.5">SAR {totalWithdrawn.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </div>
          <div className="bg-white/5 rounded-lg p-3 border border-white/10">
            <p className="text-[11px] text-slate-400 uppercase tracking-wider">Fees Paid</p>
            <p className="text-sm font-bold mt-0.5">SAR {totalFeesPaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </div>
          <div className="bg-white/5 rounded-lg p-3 border border-white/10">
            <p className="text-[11px] text-slate-400 uppercase tracking-wider">Commission Earned</p>
            <p className="text-sm font-bold mt-0.5">SAR {totalCommissionEarned.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
          </div>
          <div className="bg-white/5 rounded-lg p-3 border border-white/10">
            <p className="text-[11px] text-slate-400 uppercase tracking-wider">Receivable</p>
            <p className="text-sm font-bold mt-0.5">SAR {totalReceivable.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </div>
          <div className="bg-white/5 rounded-lg p-3 border border-white/10">
            <p className="text-[11px] text-slate-400 uppercase tracking-wider">Avg Days to Maturity</p>
            <p className="text-sm font-bold mt-0.5">{avgDaysToMaturity === null ? '—' : Math.round(avgDaysToMaturity).toLocaleString()}</p>
          </div>
        </div>

        {platformTotals.length > 0 && (
          <div className="mt-3 bg-white/5 rounded-lg p-3 border border-white/10">
            <p className="text-[11px] text-slate-400 uppercase tracking-wider mb-2">By Platform</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
              {platformTotals.map(([platform, value]) => (
                <div key={platform} className="flex items-center justify-between rounded-md bg-white/5 px-3 py-1.5">
                  <span className="text-xs text-white/80 truncate">{platform}</span>
                  <span className="text-xs font-semibold tabular-nums">SAR {value.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Investments List */}
      <Card>
        <CardContent>
          <SukukList
            initialSukuk={investments}
            userRole={user.role}
            ownerPersonId={user.role === 'OWNER' ? (user.personId || null) : null}
            viewerPersonId={user.personId || null}
          />
        </CardContent>
      </Card>

      {/* Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-bold text-gray-800">Analytics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-lg border border-gray-100 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-gray-700">Monthly Received</p>
                  <p className="text-[11px] text-gray-500">Last {monthlySeries.length} months</p>
                </div>
                <div className="mt-2">
                  {renderSparkline(monthlySeries.map((x) => x.received))}
                </div>
              </div>

              <div className="rounded-lg border border-gray-100 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-gray-700">Monthly Realized Profit</p>
                  <p className="text-[11px] text-gray-500">Withdrawals + Sold profit + Commission</p>
                </div>
                <div className="mt-2">
                  {renderSparkline(monthlySeries.map((x) => x.realizedProfit))}
                </div>
              </div>
            </div>

            {monthlySeries.length > 0 && (
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-[11px] text-gray-500">Best Month (Received)</p>
                  {(() => {
                    const best = monthlySeries.reduce((a, b) => (b.received > a.received ? b : a), monthlySeries[0])
                    return (
                      <p className="text-sm font-bold text-gray-900 tabular-nums">
                        {best.label} • SAR {best.received.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </p>
                    )
                  })()}
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-[11px] text-gray-500">Best Month (Profit)</p>
                  {(() => {
                    const best = monthlySeries.reduce(
                      (a, b) => (b.realizedProfit > a.realizedProfit ? b : a),
                      monthlySeries[0]
                    )
                    return (
                      <p className="text-sm font-bold text-gray-900 tabular-nums">
                        {best.label} • SAR {best.realizedProfit.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </p>
                    )
                  })()}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-bold text-gray-800">Platform Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {platformTotals.length === 0 ? (
              <p className="text-xs text-gray-500">No data</p>
            ) : (
              <div className="space-y-2">
                {(() => {
                  const max = Math.max(...platformTotals.map((x) => x[1]), 1)
                  return platformTotals.slice(0, 8).map(([platform, value]) => {
                    const pct = Math.max(0, Math.min(100, (value / max) * 100))
                    return (
                      <div key={platform} className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-gray-700 truncate">{platform}</span>
                          <span className="text-xs font-semibold tabular-nums text-gray-900">
                            SAR {value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-2">
                          <div
                            className="bg-slate-800 h-2 rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    )
                  })
                })()}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Performance Overview for Owner */}
      {user.role === 'OWNER' && investments.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-bold text-gray-800">Portfolio Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {activeInvestments.slice(0, 5).map((inv: any) => {
                  const principal = inv.principalAmount
                  const percentage = totalInvested > 0 ? (principal / totalInvested * 100) : 0
                  return (
                    <div key={inv.id}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-gray-600 truncate pr-2">{inv.name}</span>
                        <span className="text-xs font-semibold text-gray-800 tabular-nums">{percentage.toFixed(1)}%</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-1.5">
                        <div 
                          className="bg-slate-700 h-1.5 rounded-full transition-all duration-500"
                          style={{ width: `${percentage}%` }}
                        ></div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-bold text-gray-800">Quick Stats</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <span className="text-xs text-gray-500">Avg. Deal Size</span>
                  <span className="text-sm font-bold text-gray-900">
                    SAR {(totalInvested / Math.max(1, activeDealsCount)).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <span className="text-xs text-gray-500">Active Deals</span>
                  <span className="text-sm font-bold text-gray-900">{activeDealsCount}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <span className="text-xs text-gray-500">Total Withdrawn</span>
                  <span className="text-sm font-bold text-gray-900">
                    SAR {totalWithdrawn.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <span className="text-xs text-gray-500">Receivable</span>
                  <span className="text-sm font-bold text-gray-900">
                    SAR {totalReceivable.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
