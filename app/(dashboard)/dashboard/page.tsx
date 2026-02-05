import { getCurrentUser } from '@/lib/auth'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { prisma } from '@/lib/db'
import { DEMO_INVESTMENT_NAMES } from '@/lib/demo'

export default async function DashboardPage() {
  const user = await getCurrentUser()
  
  if (!user) {
    return null
  }

  let totalInvested = 0
  let totalValue = 0
  let totalProfit = 0
  let activeInvestments = 0

  if (user.role === 'OWNER') {
    const investments = await prisma.investment.findMany({
      where: {
        account: { isActive: true },
        name: { notIn: DEMO_INVESTMENT_NAMES },
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

  const recentTransactions = await prisma.transaction.findMany({
    where: transactionWhere,
    take: 10,
    orderBy: { date: 'desc' },
    include: {
      investment: true,
      account: true,
    },
  })

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

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
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
              <p className="text-sm font-medium text-gray-500">Current Value</p>
              <span className="text-2xl">💰</span>
            </div>
            <div className="text-3xl font-bold text-blue-600">
              SAR {totalValue.toLocaleString()}
            </div>
            <p className="text-xs text-gray-500 mt-2">Portfolio Value</p>
          </CardContent>
        </Card>

        <Card hover className="sukuk-card-hover">
          <CardContent>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-gray-500">Total Return</p>
              <span className="text-2xl">{totalProfit >= 0 ? '✨' : '📉'}</span>
            </div>
            <div className={`text-3xl font-bold ${totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              SAR {totalProfit.toLocaleString()}
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

      {/* Recent Transactions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl font-bold text-gray-900">Recent Transactions</CardTitle>
              <p className="text-sm text-gray-500 mt-1">Latest activity in your portfolio</p>
            </div>
            <span className="text-3xl">📊</span>
          </div>
        </CardHeader>
        <CardContent>
          {recentTransactions.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-6xl mb-4">📭</div>
              <p className="text-gray-500 text-lg font-medium">No transactions yet</p>
              <p className="text-gray-400 text-sm mt-2">
                Start by adding investments or importing data
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentTransactions.map((tx) => (
                <div 
                  key={tx.id} 
                  className="flex justify-between items-center p-4 bg-gradient-to-r from-gray-50 to-blue-50 rounded-xl hover:shadow-md transition-all duration-200 border border-gray-100"
                >
                  <div className="flex items-center space-x-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl ${
                      tx.amount >= 0 ? 'bg-green-100' : 'bg-red-100'
                    }`}>
                      {tx.amount >= 0 ? '💵' : '💸'}
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900">
                        {tx.investment?.name || tx.account.name}
                      </div>
                      <div className="text-sm text-gray-600 flex items-center space-x-2">
                        <span>{new Date(tx.date).toLocaleDateString()}</span>
                        <span>•</span>
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                          {tx.type}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-xl font-bold ${tx.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {tx.amount >= 0 ? '+' : '-'}{tx.account.currency} {Math.abs(tx.amount).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

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
