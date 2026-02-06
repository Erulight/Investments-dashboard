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

  const cashSetting = await prisma.systemSetting.findUnique({
    where: { key: 'CASH_BALANCE' },
  })
  const cashBalance = cashSetting ? Number(cashSetting.value) : 0

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

  const totalPortfolioValue = cashBalance + totalValue
  const returnPercentage = totalInvested > 0 ? ((totalValue - totalInvested) / totalInvested * 100) : 0

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Welcome Header */}
      <div className="bg-white rounded-2xl shadow-lg p-8 border border-gray-100">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              Welcome back, {user.name}!
            </h1>
            <p className="mt-2 text-lg text-gray-600">
              Here&apos;s an overview of your Sukuk portfolio performance
            </p>
          </div>
          <div className="hidden lg:block">
            <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg">
              <span className="text-4xl">💎</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <YearFilter selectedYear={selectedYear} />
        <div className="flex items-center gap-3">
          <ReportButton selectedYear={selectedYear} />
          <div className="text-sm text-gray-500">
            Showing gains for {selectedYear}
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-5">
        {user.role === 'OWNER' && (
          <CashBalanceCard initialCash={Number.isFinite(cashBalance) ? cashBalance : 0} />
        )}
        <Card hover className="sukuk-card-hover">
          <CardContent>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-gray-500">Total Invested</p>
              <span className="text-2xl">📈</span>
            </div>
            <div className="text-3xl font-bold text-gray-900">
              SAR {totalInvested.toLocaleString()}
            </div>
            <p className="text-xs text-gray-500 mt-2">Principal Amount</p>
          </CardContent>
        </Card>

        <Card hover className="sukuk-card-hover">
          <CardContent>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-gray-500">Portfolio Value</p>
              <span className="text-2xl">💰</span>
            </div>
            <div className="text-3xl font-bold text-blue-600">
              SAR {totalPortfolioValue.toLocaleString()}
            </div>
            <p className="text-xs text-gray-500 mt-2">Cash + Investments</p>
          </CardContent>
        </Card>

        <Card hover className="sukuk-card-hover">
          <CardContent>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-gray-500">Yearly Return</p>
              <span className="text-2xl">{yearlyProfitValue >= 0 ? '✨' : '📉'}</span>
            </div>
            <div className={`text-3xl font-bold ${yearlyProfitValue >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              SAR {yearlyProfitValue.toLocaleString()}
            </div>
            <p className={`text-xs mt-2 font-semibold ${returnPercentage >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {returnPercentage >= 0 ? '↑' : '↓'} {Math.abs(returnPercentage).toFixed(2)}% Return
            </p>
          </CardContent>
        </Card>

        <Card variant="gradient" className="sukuk-card-hover">
          <CardContent>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-white/90">Active Sukuk</p>
              <span className="text-2xl">🎯</span>
            </div>
            <div className="text-3xl font-bold text-white">
              {activeInvestments}
            </div>
            <p className="text-xs text-white/80 mt-2">Investment Deals</p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Transactions removed per user request */}
      {/* Quick Actions */}
      {user.role === 'OWNER' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card hover variant="bordered" className="sukuk-card-hover">
            <CardContent className="text-center py-8">
              <div className="text-5xl mb-4">📥</div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Import Data</h3>
              <p className="text-sm text-gray-600">Upload CSV files to import Sukuk investments</p>
            </CardContent>
          </Card>
          
          <Card hover variant="bordered" className="sukuk-card-hover">
            <CardContent className="text-center py-8">
              <div className="text-5xl mb-4">➕</div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Add Investment</h3>
              <p className="text-sm text-gray-600">Manually create a new Sukuk deal</p>
            </CardContent>
          </Card>
          
          <Card hover variant="bordered" className="sukuk-card-hover">
            <CardContent className="text-center py-8">
              <div className="text-5xl mb-4">📊</div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">View Reports</h3>
              <p className="text-sm text-gray-600">Generate detailed portfolio reports</p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
