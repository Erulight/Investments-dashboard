import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { SukukList } from '@/components/sukuk/SukukList'
import { requireModuleAccess } from '@/lib/rbac'

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
            type: { in: ['WITHDRAW_PROFIT', 'WITHDRAW_PRINCIPAL'] },
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
                type: { in: ['WITHDRAW_PROFIT', 'WITHDRAW_PRINCIPAL'] },
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

  const getNetProfit = (inv: any) => {
    const principal = inv.myParticipation?.investedAmount ?? inv.principalAmount
    const investment = Number.isFinite(principal) ? principal : 0
    const apr = Number.isFinite(inv.interestRate) ? inv.interestRate : 0
    const fees = Number.isFinite(inv.fees) ? inv.fees : 0
    const startBasis = inv.myParticipation?.acquiredAt ?? inv.startDate
    const periodMonths = getPeriodMonths(startBasis, inv.maturityDate)
    const periodYears = periodMonths ? periodMonths / 12 : 0
    const grossProfit = investment > 0 && apr > 0 && periodYears > 0
      ? investment * (apr / 100) * periodYears
      : 0
    const manualReceivable = Number.isFinite(inv.receivableAmount) ? inv.receivableAmount : null
    if (manualReceivable !== null && manualReceivable > 0) return manualReceivable
    const commissionFees = Number.isFinite(inv.myParticipation?.commissionFees)
      ? Number(inv.myParticipation.commissionFees)
      : 0
    return Math.max(0, grossProfit - fees - commissionFees)
  }

  const isActiveDeal = (inv: any) => {
    const netProfit = getNetProfit(inv)
    const totalReceived = Number.isFinite(inv.totalReceived) ? inv.totalReceived : 0
    const receivable = netProfit - totalReceived
    return receivable > 0.01
  }

  const activeInvestments = investments.filter(isActiveDeal)

  const displayedInvestments = investments

  const totalInvested = displayedInvestments.reduce((sum, inv) => {
    const principal = inv.myParticipation?.investedAmount || inv.principalAmount
    return sum + (Number.isFinite(principal) ? principal : 0)
  }, 0)

  const totalNetProfit = displayedInvestments.reduce((sum, inv) => {
    return sum + getNetProfit(inv)
  }, 0)

  const totalWithdrawn = displayedInvestments.reduce((sum, inv) => {
    const received = Number.isFinite(inv.totalReceived) ? inv.totalReceived : 0
    return sum + received
  }, 0)

  const totalReceivable = Math.max(0, totalNetProfit - totalWithdrawn)

  const totalValue = totalInvested
  const totalReturn = totalNetProfit
  const returnPercentage = totalInvested > 0 ? ((totalReturn / totalInvested) * 100) : 0
  const activeDealsCount = activeInvestments.length

  const totalFeesPaid = displayedInvestments.reduce((sum, inv) => {
    const fees = Number.isFinite(inv.fees) ? inv.fees : 0
    return sum + fees
  }, 0)

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
            <p className="text-lg font-bold mt-0.5">SAR {totalReturn.toLocaleString()}</p>
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

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
          <div className="bg-white/5 rounded-lg p-3 border border-white/10">
            <p className="text-[11px] text-slate-400 uppercase tracking-wider">Received</p>
            <p className="text-sm font-bold mt-0.5">SAR {totalWithdrawn.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
          </div>
          <div className="bg-white/5 rounded-lg p-3 border border-white/10">
            <p className="text-[11px] text-slate-400 uppercase tracking-wider">Fees Paid</p>
            <p className="text-sm font-bold mt-0.5">SAR {totalFeesPaid.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
          </div>
          <div className="bg-white/5 rounded-lg p-3 border border-white/10">
            <p className="text-[11px] text-slate-400 uppercase tracking-wider">Receivable</p>
            <p className="text-sm font-bold mt-0.5">SAR {totalReceivable.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
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
