import { getCurrentUser } from '@/lib/auth'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { prisma } from '@/lib/db'
import { DEMO_INVESTMENT_NAMES } from '@/lib/demo'
import { YearFilter } from '@/components/dashboard/YearFilter'
import { CashBalanceCard } from '@/components/dashboard/CashBalanceCard'
import { ReportButton } from '@/components/dashboard/ReportButton'

export const dynamic = 'force-dynamic'

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: { year?: string }
}) {
  const user = await getCurrentUser()
  
  if (!user) {
    return null
  }

  const yearParam = searchParams?.year
  const parsedYear = yearParam ? Number(yearParam) : NaN
  const selectedYear = Number.isFinite(parsedYear) ? parsedYear : new Date().getFullYear()
  const yearStart = new Date(selectedYear, 0, 1)
  const yearEnd = new Date(selectedYear + 1, 0, 1)

  const cashBalance =
    user.role === 'OWNER'
      ? Number(
          (
            await prisma.systemSetting.findUnique({
              where: { key: 'CASH_BALANCE' },
            })
          )?.value || 0
        )
      : 0

  let totalInvested = 0
  let totalValue = 0
  let totalProfit = 0
  let activeInvestments = 0

  const investmentDateFilter = {
    startDate: { lt: yearEnd },
    OR: [{ maturityDate: null }, { maturityDate: { gte: yearStart } }],
  }

  // Per-type breakdown
  type TypeBreakdown = { type: string; invested: number; value: number; count: number }
  let typeBreakdowns: TypeBreakdown[] = []

  // ROSCA / Circlys debt tracking
  let roscaDebt = 0

  let sukukInvested = 0
  let sukukValue = 0
  let sipValue = 0
  let circlysOngoingSaved = 0

  if (user.role === 'OWNER') {
    const investments = await prisma.investment.findMany({
      where: {
        account: { isActive: true },
        name: { notIn: DEMO_INVESTMENT_NAMES },
        ...investmentDateFilter,
      },
      include: { account: { select: { type: true } } },
    })

    totalInvested = investments.reduce((sum, inv) => sum + inv.principalAmount, 0)
    totalValue = investments.reduce(
      (sum, inv) => sum + (inv.account.type === 'SUKUK' ? inv.principalAmount : inv.currentValue),
      0
    )
    totalProfit = investments.reduce(
      (sum, inv) => sum + inv.realizedProfit + inv.unrealizedProfit,
      0
    )
    activeInvestments = investments.length

    sukukInvested = investments
      .filter((inv) => inv.account.type === 'SUKUK')
      .reduce((sum, inv) => sum + inv.principalAmount, 0)
    sukukValue = investments
      .filter((inv) => inv.account.type === 'SUKUK')
      .reduce((sum, inv) => sum + inv.principalAmount, 0)
    sipValue = investments
      .filter((inv) => inv.account.type === 'SIP')
      .reduce((sum, inv) => sum + inv.currentValue, 0)

    circlysOngoingSaved = investments
      .filter((inv) => inv.account.type === 'CIRCLYS')
      .filter((inv) => {
        try {
          const meta = inv.metadata ? JSON.parse(inv.metadata as string) : {}
          return !meta?.received?.date
        } catch {
          return true
        }
      })
      .reduce((sum, inv) => sum + inv.principalAmount, 0)

    // Build per-type breakdown
    const typeMap = new Map<string, { invested: number; value: number; count: number }>()
    for (const inv of investments) {
      const t = inv.account.type
      const existing = typeMap.get(t) || { invested: 0, value: 0, count: 0 }
      existing.invested += inv.principalAmount
      existing.value += t === 'SUKUK' ? inv.principalAmount : inv.currentValue
      existing.count += 1
      typeMap.set(t, existing)
    }
    typeBreakdowns = Array.from(typeMap.entries())
      .map(([type, data]) => ({ type, ...data }))
      .sort((a, b) => b.value - a.value)

    // Calculate ROSCA / Circlys remaining payback debt
    // For ROSCA plans: if totalPaid < (monthlyAmount * durationMonths), the remainder is debt
    const roscaInvestments = investments.filter(inv => inv.account.type === 'CIRCLYS')
    for (const inv of roscaInvestments) {
      try {
        const meta = inv.metadata ? JSON.parse(inv.metadata as string) : {}
        const monthlyAmount = Number(meta.monthlyAmount) || 0
        const durationMonths = Number(meta.durationMonths) || 0
        const totalPaid = Number(meta.totalPaid) || 0
        const totalRequired = monthlyAmount * durationMonths
        if (totalRequired > totalPaid) {
          roscaDebt += (totalRequired - totalPaid)
        }
      } catch {
        // skip invalid metadata
      }
    }
  } else if (user.role === 'PARTNER' && user.personId) {
    const participants = await prisma.dealParticipant.findMany({
      where: {
        personId: user.personId,
        investment: {
          name: { notIn: DEMO_INVESTMENT_NAMES },
          ...investmentDateFilter,
        },
      },
      include: { investment: { include: { account: { select: { type: true } } } } },
    })

    totalInvested = participants.reduce((sum, p) => sum + p.investedAmount, 0)
    totalValue = participants.reduce((sum, p) => sum + p.currentValue, 0)
    totalProfit = participants.reduce((sum, p) => sum + p.profit, 0)
    activeInvestments = participants.length

    const typeMap = new Map<string, { invested: number; value: number; count: number }>()
    for (const p of participants) {
      const t = p.investment.account.type
      const existing = typeMap.get(t) || { invested: 0, value: 0, count: 0 }
      existing.invested += p.investedAmount
      existing.value += p.currentValue
      existing.count += 1
      typeMap.set(t, existing)
    }
    typeBreakdowns = Array.from(typeMap.entries())
      .map(([type, data]) => ({ type, ...data }))
      .sort((a, b) => b.value - a.value)
  }

  const transactionWhere =
    user.role === 'PARTNER' && user.personId
      ? {
          personId: user.personId,
          OR: [
            { investment: { name: { notIn: DEMO_INVESTMENT_NAMES } } },
            { investmentId: null },
          ],
        }
      : {
          OR: [
            { investment: { name: { notIn: DEMO_INVESTMENT_NAMES } } },
            { investmentId: null },
          ],
        }

  const yearlyProfit = await prisma.transaction.aggregate({
    where: {
      ...transactionWhere,
      type: 'WITHDRAW_PROFIT',
      date: { gte: yearStart, lt: yearEnd },
    },
    _sum: { amount: true },
  })

  const yearlyProfitValue = Math.abs(yearlyProfit._sum.amount || 0)

  const displayedValue = user.role === 'OWNER' ? cashBalance + totalValue : totalValue
  const yearlyReturnPercentage =
    totalInvested > 0 ? (yearlyProfitValue / totalInvested) * 100 : 0
  const netWorth = displayedValue - roscaDebt

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-xl shadow-md p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Welcome back, {user.name}</h1>
            <p className="text-sm text-slate-400 mt-1">Portfolio overview for {selectedYear}</p>
          </div>
          <div className="flex items-center gap-3">
            <ReportButton selectedYear={selectedYear} />
            <YearFilter selectedYear={selectedYear} />
          </div>
        </div>
      </div>

      {/* Top Stats Row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {user.role === 'OWNER' && (
          <CashBalanceCard initialCash={Number.isFinite(cashBalance) ? cashBalance : 0} />
        )}
        <Card>
          <CardContent>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Total Invested</p>
            <div className="text-xl font-bold text-gray-900 mt-1 tabular-nums">
              SAR {totalInvested.toLocaleString()}
            </div>
            <p className="text-[11px] text-gray-400 mt-0.5">Principal</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              {user.role === 'OWNER' ? 'Portfolio Value' : 'Investment Value'}
            </p>
            <div className="text-xl font-bold text-gray-900 mt-1 tabular-nums">
              SAR {displayedValue.toLocaleString()}
            </div>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {user.role === 'OWNER' ? 'Cash + Investments' : 'Your share'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Yearly Return</p>
            <div className={`text-xl font-bold mt-1 tabular-nums ${yearlyProfitValue >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              SAR {yearlyProfitValue.toLocaleString()}
            </div>
            <p className={`text-[11px] mt-0.5 font-semibold ${yearlyReturnPercentage >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {yearlyReturnPercentage >= 0 ? '↑' : '↓'} {Math.abs(yearlyReturnPercentage).toFixed(2)}%
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Second Row: Deals + Debt + Net Worth */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card>
          <CardContent>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Active Deals</p>
            <div className="text-xl font-bold text-gray-900 mt-1">{activeInvestments}</div>
            <p className="text-[11px] text-gray-400 mt-0.5">Across all types</p>
          </CardContent>
        </Card>

        {user.role === 'OWNER' && roscaDebt > 0 && (
          <Card>
            <CardContent>
              <p className="text-xs font-medium text-red-500 uppercase tracking-wider">ROSCA Remaining</p>
              <div className="text-xl font-bold text-red-600 mt-1 tabular-nums">
                SAR {roscaDebt.toLocaleString()}
              </div>
              <p className="text-[11px] text-red-400 mt-0.5">Unpaid commitments</p>
            </CardContent>
          </Card>
        )}

        {user.role === 'OWNER' && (
          <Card>
            <CardContent>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Net Worth</p>
              <div className={`text-xl font-bold mt-1 tabular-nums ${netWorth >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                SAR {netWorth.toLocaleString()}
              </div>
              <p className="text-[11px] text-gray-400 mt-0.5">Portfolio − Debt</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Third Row: Key Totals */}
      {user.role === 'OWNER' && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Card>
            <CardContent>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Sukuk Total</p>
              <div className="text-xl font-bold text-gray-900 mt-1 tabular-nums">
                SAR {sukukValue.toLocaleString()}
              </div>
              <p className="text-[11px] text-gray-400 mt-0.5 tabular-nums">
                Invested SAR {sukukInvested.toLocaleString()}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Circlys Ongoing</p>
              <div className="text-xl font-bold text-gray-900 mt-1 tabular-nums">
                SAR {circlysOngoingSaved.toLocaleString()}
              </div>
              <p className="text-[11px] text-gray-400 mt-0.5">Saved (not received)</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">SIP Total</p>
              <div className="text-xl font-bold text-gray-900 mt-1 tabular-nums">
                SAR {sipValue.toLocaleString()}
              </div>
              <p className="text-[11px] text-gray-400 mt-0.5">Current value</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Per-Type Breakdown */}
      {typeBreakdowns.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-bold text-gray-800">Balance by Investment Type</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {typeBreakdowns.map((tb) => {
                const returnPct = tb.invested > 0 ? ((tb.value - tb.invested) / tb.invested * 100) : 0
                return (
                  <div key={tb.type} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-gray-900">{tb.type}</span>
                      <span className="text-[11px] text-gray-400">{tb.count} deal{tb.count !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <div className="text-xs text-gray-400">Invested</div>
                        <div className="text-sm font-medium text-gray-700 tabular-nums">SAR {tb.invested.toLocaleString()}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-gray-400">Value</div>
                        <div className="text-sm font-bold text-gray-900 tabular-nums">SAR {tb.value.toLocaleString()}</div>
                      </div>
                      <div className="text-right min-w-[60px]">
                        <div className="text-xs text-gray-400">Return</div>
                        <div className={`text-sm font-semibold tabular-nums ${returnPct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {returnPct >= 0 ? '+' : ''}{returnPct.toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
