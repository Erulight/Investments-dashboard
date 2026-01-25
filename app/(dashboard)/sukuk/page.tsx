import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'

export default async function InvestmentsPage() {
  const user = await getCurrentUser()
  
  if (!user) {
    return null
  }

  let investments: any[] = []

  if (user.role === 'OWNER') {
    investments = await prisma.investment.findMany({
      include: {
        account: true,
        dealParticipants: {
          include: { person: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })
  } else if (user.role === 'PARTNER' && user.personId) {
    const participants = await prisma.dealParticipant.findMany({
      where: { personId: user.personId },
      include: {
        investment: {
          include: { account: true },
        },
      },
    })
    
    investments = participants.map((p) => ({
      ...p.investment,
      myParticipation: {
        investedAmount: p.investedAmount,
        currentValue: p.currentValue,
        profit: p.profit,
      },
    }))
  }

  const totalInvested = investments.reduce((sum, inv) => {
    const principal = inv.myParticipation?.investedAmount || inv.principalAmount
    return sum + principal
  }, 0)

  const totalValue = investments.reduce((sum, inv) => {
    const current = inv.myParticipation?.currentValue || inv.currentValue
    return sum + current
  }, 0)

  const totalReturn = totalValue - totalInvested
  const returnPercentage = totalInvested > 0 ? ((totalReturn / totalInvested) * 100) : 0

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header Section */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl shadow-xl p-8 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold mb-2">Sukuk Investments</h1>
            <p className="text-lg text-blue-100">
              Islamic investment portfolio tracking and management
            </p>
          </div>
          <div className="hidden lg:block text-7xl">
            💎
          </div>
        </div>

        {/* Summary Stats in Header */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
          <div className="bg-white/10 backdrop-blur-lg rounded-xl p-4 border border-white/20">
            <p className="text-sm text-blue-100 mb-1">Total Portfolio Value</p>
            <p className="text-2xl font-bold">SAR {totalValue.toLocaleString()}</p>
          </div>
          <div className="bg-white/10 backdrop-blur-lg rounded-xl p-4 border border-white/20">
            <p className="text-sm text-blue-100 mb-1">Total Return</p>
            <p className="text-2xl font-bold">
              SAR {totalReturn.toLocaleString()}
            </p>
          </div>
          <div className="bg-white/10 backdrop-blur-lg rounded-xl p-4 border border-white/20">
            <p className="text-sm text-blue-100 mb-1">Return Percentage</p>
            <p className="text-2xl font-bold">
              {returnPercentage >= 0 ? '+' : ''}{returnPercentage.toFixed(2)}%
            </p>
          </div>
        </div>
      </div>

      {/* Investments List */}
      <div className="grid grid-cols-1 gap-6">
        {investments.length === 0 ? (
          <Card>
            <CardContent className="py-20 text-center">
              <div className="text-7xl mb-6">💼</div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">No Sukuk Investments Yet</h3>
              <p className="text-gray-500 text-lg">
                {user.role === 'OWNER' 
                  ? 'Start by importing data or creating your first Sukuk investment.' 
                  : 'Contact the owner to add you to Sukuk investments.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-2xl font-bold text-gray-900">All Sukuk Deals</CardTitle>
                  <p className="text-sm text-gray-500 mt-1">{investments.length} active investments</p>
                </div>
                {user.role === 'OWNER' && (
                  <button className="px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-200">
                    + Add New Deal
                  </button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Deal Name</TableHead>
                    <TableHead>Account Type</TableHead>
                    <TableHead>Principal</TableHead>
                    <TableHead>Current Value</TableHead>
                    <TableHead>Profit/Loss</TableHead>
                    <TableHead>Return %</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {investments.map((inv: any) => {
                    const principal = inv.myParticipation?.investedAmount || inv.principalAmount
                    const current = inv.myParticipation?.currentValue || inv.currentValue
                    const profit = inv.myParticipation?.profit || (inv.realizedProfit + inv.unrealizedProfit)
                    const returnPct = principal > 0 ? ((current - principal) / principal * 100) : 0

                    return (
                      <TableRow key={inv.id} className="hover:bg-blue-50 transition-colors duration-150">
                        <TableCell className="font-semibold text-gray-900">
                          <div className="flex items-center space-x-2">
                            <span className="text-xl">📄</span>
                            <span>{inv.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                            {inv.account?.name}
                          </span>
                        </TableCell>
                        <TableCell className="font-semibold text-gray-700">
                          {inv.account?.currency} {principal.toLocaleString()}
                        </TableCell>
                        <TableCell className="font-semibold text-blue-600">
                          {inv.account?.currency} {current.toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <div className={`flex items-center space-x-1 font-bold ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            <span>{profit >= 0 ? '↑' : '↓'}</span>
                            <span>{inv.account?.currency} {Math.abs(profit).toLocaleString()}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className={`flex items-center space-x-1 font-bold ${returnPct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            <span>{returnPct >= 0 ? '↑' : '↓'}</span>
                            <span>{Math.abs(returnPct).toFixed(2)}%</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="px-3 py-1.5 inline-flex items-center text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800 shadow-sm">
                            <span className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></span>
                            Active
                          </span>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Performance Overview for Owner */}
      {user.role === 'OWNER' && investments.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card hover className="sukuk-card-hover">
            <CardHeader>
              <CardTitle className="text-xl font-bold text-gray-900">Portfolio Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {investments.slice(0, 5).map((inv: any) => {
                  const principal = inv.principalAmount
                  const percentage = totalInvested > 0 ? (principal / totalInvested * 100) : 0
                  return (
                    <div key={inv.id}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-700">{inv.name}</span>
                        <span className="text-sm font-semibold text-gray-900">{percentage.toFixed(1)}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-gradient-to-r from-blue-500 to-purple-600 h-2 rounded-full transition-all duration-500"
                          style={{ width: `${percentage}%` }}
                        ></div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          <Card hover className="sukuk-card-hover">
            <CardHeader>
              <CardTitle className="text-xl font-bold text-gray-900">Quick Stats</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-blue-50 rounded-xl">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 bg-blue-500 rounded-xl flex items-center justify-center text-white text-xl">
                      📊
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Avg. Deal Size</p>
                      <p className="text-xl font-bold text-gray-900">
                        SAR {(totalInvested / investments.length).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </p>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center justify-between p-4 bg-green-50 rounded-xl">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 bg-green-500 rounded-xl flex items-center justify-center text-white text-xl">
                      ✅
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Total Deals</p>
                      <p className="text-xl font-bold text-gray-900">{investments.length}</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-purple-50 rounded-xl">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 bg-purple-500 rounded-xl flex items-center justify-center text-white text-xl">
                      💵
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Avg. Return</p>
                      <p className="text-xl font-bold text-gray-900">{returnPercentage.toFixed(2)}%</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
