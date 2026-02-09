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

  if (user.role === 'OWNER') {
    const investments = await prisma.investment.findMany({
      where: {
        account: { isActive: true },
        name: { notIn: DEMO_INVESTMENT_NAMES },
        ...investmentDateFilter,
      },
    })

    totalInvested = investments.reduce((sum, inv) => sum + inv.principalAmount, 0)
    totalValue = investments.reduce((sum, inv) => sum + inv.currentValue, 0)
    totalProfit = investments.reduce(
      (sum, inv) => sum + inv.realizedProfit + inv.unrealizedProfit,
      0
    )
    activeInvestments = investments.length
  } else if (user.role === 'PARTNER' && user.personId) {
    const participants = await prisma.dealParticipant.findMany({
      where: {
        personId: user.personId,
        investment: {
          name: { notIn: DEMO_INVESTMENT_NAMES },
          ...investmentDateFilter,
        },
      },
      include: { investment: true },
    })

    totalInvested = participants.reduce((sum, p) => sum + p.investedAmount, 0)
    totalValue = participants.reduce((sum, p) => sum + p.currentValue, 0)
    totalProfit = participants.reduce((sum, p) => sum + p.profit, 0)
    activeInvestments = participants.length
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
  const returnPercentage = totalInvested > 0 ? ((totalValue - totalInvested) / totalInvested * 100) : 0

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

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {user.role === 'OWNER' && (
          <CashBalanceCard initialCash={Number.isFinite(cashBalance) ? cashBalance : 0} />
        )}
        <Card>
          <CardContent>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Total Invested</p>
            <div className="text-2xl font-bold text-gray-900 mt-1">
              SAR {totalInvested.toLocaleString()}
            </div>
            <p className="text-[11px] text-gray-400 mt-1">Principal Amount</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              {user.role === 'OWNER' ? 'Portfolio Value' : 'Investment Value'}
            </p>
            <div className="text-2xl font-bold text-gray-900 mt-1">
              SAR {displayedValue.toLocaleString()}
            </div>
            <p className="text-[11px] text-gray-400 mt-1">
              {user.role === 'OWNER' ? 'Cash + Investments' : 'Your share'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Yearly Return</p>
            <div className={`text-2xl font-bold mt-1 ${yearlyProfitValue >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              SAR {yearlyProfitValue.toLocaleString()}
            </div>
            <p className={`text-[11px] mt-1 font-semibold ${returnPercentage >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {returnPercentage >= 0 ? '↑' : '↓'} {Math.abs(returnPercentage).toFixed(2)}%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Active Deals</p>
            <div className="text-2xl font-bold text-gray-900 mt-1">
              {activeInvestments}
            </div>
            <p className="text-[11px] text-gray-400 mt-1">Investment Deals</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      {user.role === 'OWNER' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card hover variant="bordered">
            <CardContent className="text-center py-6">
              <div className="text-3xl mb-3">📥</div>
              <h3 className="text-sm font-semibold text-gray-900 mb-1">Import Data</h3>
              <p className="text-xs text-gray-500">Upload CSV files to import investments</p>
            </CardContent>
          </Card>
          <Card hover variant="bordered">
            <CardContent className="text-center py-6">
              <div className="text-3xl mb-3">➕</div>
              <h3 className="text-sm font-semibold text-gray-900 mb-1">Add Investment</h3>
              <p className="text-xs text-gray-500">Manually create a new deal</p>
            </CardContent>
          </Card>
          <Card hover variant="bordered">
            <CardContent className="text-center py-6">
              <div className="text-3xl mb-3">📊</div>
              <h3 className="text-sm font-semibold text-gray-900 mb-1">View Reports</h3>
              <p className="text-xs text-gray-500">Generate portfolio reports</p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
