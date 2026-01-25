import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'

export default async function CirclysPage() {
  const user = await getCurrentUser()
  
  if (!user) {
    return null
  }

  let investments: any[] = []

  if (user.role === 'OWNER') {
    investments = await prisma.investment.findMany({
      where: {
        account: {
          type: 'CIRCLYS',
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
            type: 'CIRCLYS'
          }
        }
      },
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
      {/* Breadcrumb */}
      <div className="flex items-center space-x-2 text-sm text-gray-600">
        <Link href="/savings" className="hover:text-blue-600">Savings</Link>
        <span>/</span>
        <span className="text-gray-900 font-semibold">Circlys</span>
      </div>

      {/* Header Section */}
      <div className="bg-gradient-to-r from-emerald-600 to-cyan-600 rounded-2xl shadow-xl p-8 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold mb-2">Circlys Savings Plans</h1>
            <p className="text-lg text-emerald-100">
              Track your Circlys savings and interest
            </p>
          </div>
          <div className="hidden lg:block text-7xl">
            🔄
          </div>
        </div>

        {/* Summary Stats in Header */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
          <div className="bg-white/10 backdrop-blur-lg rounded-xl p-4 border border-white/20">
            <p className="text-sm text-emerald-100 mb-1">Total Savings</p>
            <p className="text-2xl font-bold">SAR {totalInvested.toLocaleString()}</p>
          </div>
          <div className="bg-white/10 backdrop-blur-lg rounded-xl p-4 border border-white/20">
            <p className="text-sm text-emerald-100 mb-1">Current Value</p>
            <p className="text-2xl font-bold">
              SAR {totalValue.toLocaleString()}
            </p>
          </div>
          <div className="bg-white/10 backdrop-blur-lg rounded-xl p-4 border border-white/20">
            <p className="text-sm text-emerald-100 mb-1">Interest Earned</p>
            <p className="text-2xl font-bold">
              SAR {totalReturn.toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {/* Investments List */}
      <div className="grid grid-cols-1 gap-6">
        {investments.length === 0 ? (
          <Card>
            <CardContent className="py-20 text-center">
              <div className="text-7xl mb-6">🔄</div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">No Circlys Plans Yet</h3>
              <p className="text-gray-500 text-lg">
                {user.role === 'OWNER' 
                  ? 'Start by importing data or creating your first Circlys savings plan.' 
                  : 'Contact the owner to add you to Circlys savings plans.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-2xl font-bold text-gray-900">All Circlys Plans</CardTitle>
                  <p className="text-sm text-gray-500 mt-1">{investments.length} active plans</p>
                </div>
                {user.role === 'OWNER' && (
                  <button className="px-6 py-3 bg-gradient-to-r from-emerald-600 to-cyan-600 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-200">
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
                    <TableHead>Interest</TableHead>
                    <TableHead>Interest Rate</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {investments.map((inv: any) => {
                    const principal = inv.myParticipation?.investedAmount || inv.principalAmount
                    const current = inv.myParticipation?.currentValue || inv.currentValue
                    const interest = current - principal

                    return (
                      <TableRow key={inv.id} className="hover:bg-emerald-50 transition-colors duration-150">
                        <TableCell className="font-semibold text-gray-900">
                          <div className="flex items-center space-x-2">
                            <span className="text-xl">💵</span>
                            <span>{inv.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-medium">
                            {inv.account?.name}
                          </span>
                        </TableCell>
                        <TableCell className="font-semibold text-gray-700">
                          {inv.account?.currency} {principal.toLocaleString()}
                        </TableCell>
                        <TableCell className="font-semibold text-emerald-600">
                          {inv.account?.currency} {current.toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-1 font-bold text-green-600">
                            <span>+</span>
                            <span>{inv.account?.currency} {interest.toLocaleString()}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="font-semibold text-gray-900">
                            {inv.interestRate ? `${inv.interestRate}%` : 'N/A'}
                          </span>
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
