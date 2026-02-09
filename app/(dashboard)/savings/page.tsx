import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { requireModuleAccess } from '@/lib/rbac'

export default async function SavingsPage() {
  await requireModuleAccess('savings')
  const user = await getCurrentUser()
  
  if (!user) {
    return null
  }

  // Get all savings-related investments (we'll use CIRCLYS type for now)
  let circlysInvestments: any[] = []
  let totalSavings = 0
  let totalReward = 0

  if (user.role === 'OWNER') {
    circlysInvestments = await prisma.investment.findMany({
      where: {
        account: {
          type: 'CIRCLYS',
          isActive: true
        }
      },
      include: {
        account: true,
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
    
    circlysInvestments = participants.map((p: any) => ({
      ...p.investment,
      myParticipation: {
        investedAmount: p.investedAmount,
        currentValue: p.currentValue,
        profit: p.profit,
      },
    }))
  }

  totalSavings = circlysInvestments.reduce((sum, inv) => sum + inv.principalAmount, 0)
  totalReward = circlysInvestments.reduce((sum, inv) => sum + (inv.currentValue - inv.principalAmount), 0)

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header Section */}
      <div className="bg-gradient-to-r from-emerald-600 to-cyan-600 rounded-2xl shadow-xl p-8 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold mb-2">Savings Portfolio</h1>
            <p className="text-lg text-emerald-100">
              Track your savings accounts and plans
            </p>
          </div>
          <div className="hidden lg:block text-7xl">
            💰
          </div>
        </div>

        {/* Summary Stats in Header */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
          <div className="bg-white/10 backdrop-blur-lg rounded-xl p-4 border border-white/20">
            <p className="text-sm text-emerald-100 mb-1">Total Savings</p>
            <p className="text-2xl font-bold">SAR {totalSavings.toLocaleString()}</p>
          </div>
          <div className="bg-white/10 backdrop-blur-lg rounded-xl p-4 border border-white/20">
            <p className="text-sm text-emerald-100 mb-1">Total Reward Earned</p>
            <p className="text-2xl font-bold">
              SAR {totalReward.toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {/* Savings Categories */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Circlys Card */}
        <Link href="/savings/circlys">
          <Card hover className="sukuk-card-hover cursor-pointer">
            <CardContent className="py-12">
              <div className="text-center">
                <div className="text-6xl mb-4">🔄</div>
                <h3 className="text-2xl font-bold text-gray-900 mb-2">Circlys</h3>
                <p className="text-gray-600 mb-4">Savings plans with Circlys</p>
                <div className="flex items-center justify-between px-4 py-3 bg-emerald-50 rounded-xl">
                  <span className="text-sm text-gray-600">Active Plans</span>
                  <span className="text-xl font-bold text-emerald-600">{circlysInvestments.length}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        {/* Other Savings - Placeholder */}
        <Card variant="bordered" className="sukuk-card-hover opacity-60">
          <CardContent className="py-12">
            <div className="text-center">
              <div className="text-6xl mb-4">🏦</div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">Other Savings</h3>
              <p className="text-gray-600 mb-4">Additional savings accounts</p>
              <div className="px-4 py-3 bg-gray-100 rounded-xl">
                <span className="text-sm text-gray-500">Coming Soon</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Overview */}
      {circlysInvestments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl font-bold text-gray-900">Circlys Plans Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {circlysInvestments.map((inv: any) => (
                <div key={inv.id} className="flex items-center justify-between p-4 bg-gradient-to-r from-emerald-50 to-cyan-50 rounded-xl hover:shadow-md transition-all duration-200">
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-emerald-500 rounded-xl flex items-center justify-center text-white text-xl">
                      💵
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900">{inv.name}</div>
                      <div className="text-sm text-gray-600">
                        {inv.interestRate ? `${inv.interestRate}% reward rate` : 'Savings plan'}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-bold text-gray-900">
                      SAR {inv.currentValue.toLocaleString()}
                    </div>
                    <div className="text-sm text-green-600 font-semibold">
                      +SAR {(inv.currentValue - inv.principalAmount).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
