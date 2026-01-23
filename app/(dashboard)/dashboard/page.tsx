import { getCurrentUser } from '@/lib/auth'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { prisma } from '@/lib/db'

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
      where: { account: { isActive: true } },
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
      where: { personId: user.personId },
      include: { investment: true },
    })

    totalInvested = participants.reduce((sum, p) => sum + p.investedAmount, 0)
    totalValue = participants.reduce((sum, p) => sum + p.currentValue, 0)
    totalProfit = participants.reduce((sum, p) => sum + p.profit, 0)
    activeInvestments = participants.length
  }

  const recentTransactions = await prisma.transaction.findMany({
    where:
      user.role === 'PARTNER' && user.personId
        ? { personId: user.personId }
        : {},
    take: 10,
    orderBy: { date: 'desc' },
    include: {
      investment: true,
      account: true,
    },
  })

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-2 text-gray-600">
          Welcome back, {user.name}! Here&apos;s an overview of your investments.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-gray-500">
              Total Invested
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">
              SAR {totalInvested.toLocaleString()}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-gray-500">
              Current Value
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">
              SAR {totalValue.toLocaleString()}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-gray-500">
              Total Profit
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              SAR {totalProfit.toLocaleString()}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-gray-500">
              Active Investments
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">
              {activeInvestments}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          {recentTransactions.length === 0 ? (
            <p className="text-gray-500 text-center py-8">
              No transactions yet. Start by adding investments or importing data.
            </p>
          ) : (
            <div className="space-y-4">
              {recentTransactions.map((tx) => (
                <div key={tx.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                  <div>
                    <div className="font-medium text-gray-900">
                      {tx.investment?.name || tx.account.name}
                    </div>
                    <div className="text-sm text-gray-600">
                      {new Date(tx.date).toLocaleDateString()} - {tx.type}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`font-semibold ${tx.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {tx.account.currency} {Math.abs(tx.amount).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
