import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { requireModuleAccess } from '@/lib/rbac'

export default async function SIPPage() {
  await requireModuleAccess('sip')
  const user = await getCurrentUser()
  
  if (!user) {
    return null
  }

  let investments: any[] = []

  if (user.role === 'OWNER') {
    investments = await prisma.investment.findMany({
      where: {
        account: {
          type: 'SIP',
          isActive: true
        }
      },
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
      where: { 
        personId: user.personId,
        investment: {
          account: {
            type: 'SIP'
          }
        }
      },
      include: {
        investment: {
          include: { account: true },
        },
      },
    })
    
    investments = participants.map((p: any) => ({
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
      <div className="bg-gradient-to-r from-indigo-600 to-pink-600 rounded-2xl shadow-xl p-8 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold mb-2">SIP Investments</h1>
            <p className="text-lg text-indigo-100">
              Systematic Investment Plan tracking
            </p>
          </div>
          <div className="hidden lg:block text-7xl">
            📈
          </div>
        </div>

        {/* Summary Stats in Header */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
          <div className="bg-white/10 backdrop-blur-lg rounded-xl p-4 border border-white/20">
            <p className="text-sm text-indigo-100 mb-1">Total Portfolio Value</p>
            <p className="text-2xl font-bold">SAR {totalValue.toLocaleString()}</p>
          </div>
          <div className="bg-white/10 backdrop-blur-lg rounded-xl p-4 border border-white/20">
            <p className="text-sm text-indigo-100 mb-1">Total Return</p>
            <p className="text-2xl font-bold">
              SAR {totalReturn.toLocaleString()}
            </p>
          </div>
          <div className="bg-white/10 backdrop-blur-lg rounded-xl p-4 border border-white/20">
            <p className="text-sm text-indigo-100 mb-1">Return Percentage</p>
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
              <div className="text-7xl mb-6">📈</div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">No SIP Investments Yet</h3>
              <p className="text-gray-500 text-lg">
                {user.role === 'OWNER' 
                  ? 'Start by importing data or creating your first SIP investment.' 
                  : 'Contact the owner to add you to SIP investments.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-2xl font-bold text-gray-900">All SIP Plans</CardTitle>
                  <p className="text-sm text-gray-500 mt-1">{investments.length} active plans</p>
                </div>
                {user.role === 'OWNER' && (
                  <button className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-pink-600 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-200">
                    + Add New Plan
                  </button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Plan Name</TableHead>
                    <TableHead>Account</TableHead>
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
                      <TableRow key={inv.id} className="hover:bg-indigo-50 transition-colors duration-150">
                        <TableCell className="font-semibold text-gray-900">
                          <div className="flex items-center space-x-2">
                            <span className="text-xl">💹</span>
                            <span>{inv.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-xs font-medium">
                            {inv.account?.name}
                          </span>
                        </TableCell>
                        <TableCell className="font-semibold text-gray-700">
                          {inv.account?.currency} {principal.toLocaleString()}
                        </TableCell>
                        <TableCell className="font-semibold text-indigo-600">
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
    </div>
  )
}
