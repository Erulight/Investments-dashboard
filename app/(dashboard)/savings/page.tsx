import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { requireModuleAccess } from '@/lib/rbac'
import { DISPLAY_CURRENCY_KEY, formatCurrencyAmount, normalizeDisplayCurrency } from '@/lib/currency'

export default async function SavingsPage() {
  await requireModuleAccess('savings')
  const user = await getCurrentUser()
  
  if (!user) {
    return null
  }

  const displayCurrencySetting = await prisma.systemSetting.findUnique({
    where: { key: DISPLAY_CURRENCY_KEY },
  })
  const displayCurrency = normalizeDisplayCurrency(displayCurrencySetting?.value)
  const money = (value: number) => formatCurrencyAmount(value, displayCurrency, 'SAR')

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
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-xl shadow-md p-6 text-white">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-2xl font-bold">Savings Portfolio</h1>
            <p className="text-sm text-slate-400 mt-1">Track your savings accounts and plans</p>
          </div>
          <span className="hidden lg:block text-4xl opacity-80">💰</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="bg-white/5 rounded-lg p-3 border border-white/10">
            <p className="text-[11px] text-slate-400 uppercase tracking-wider">Total Savings</p>
            <p className="text-lg font-bold mt-0.5">{money(totalSavings)}</p>
          </div>
          <div className="bg-white/5 rounded-lg p-3 border border-white/10">
            <p className="text-[11px] text-slate-400 uppercase tracking-wider">Reward Earned</p>
            <p className="text-lg font-bold mt-0.5">{money(totalReward)}</p>
          </div>
        </div>
      </div>

      {/* Savings Categories */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link href="/savings/circlys">
          <Card hover className="cursor-pointer">
            <CardContent className="py-8">
              <div className="text-center">
                <div className="text-3xl mb-3">🔄</div>
                <h3 className="text-sm font-bold text-gray-900 mb-1">Circlys</h3>
                <p className="text-xs text-gray-500 mb-3">Savings plans with Circlys</p>
                <div className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg">
                  <span className="text-xs text-gray-500">Active Plans</span>
                  <span className="text-sm font-bold text-gray-900">{circlysInvestments.length}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Card variant="bordered" className="opacity-50">
          <CardContent className="py-8">
            <div className="text-center">
              <div className="text-3xl mb-3">🏦</div>
              <h3 className="text-sm font-bold text-gray-900 mb-1">Other Savings</h3>
              <p className="text-xs text-gray-500 mb-3">Additional savings accounts</p>
              <div className="px-3 py-2 bg-gray-50 rounded-lg">
                <span className="text-xs text-gray-400">Coming Soon</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Overview */}
      {circlysInvestments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-bold text-gray-800">Circlys Plans Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {circlysInvestments.map((inv: any) => (
                <div key={inv.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">{inv.name}</div>
                    <div className="text-xs text-gray-500">
                      {inv.interestRate ? `${inv.interestRate}% reward rate` : 'Savings plan'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-gray-900 tabular-nums">
                      {money(Number(inv.currentValue || 0))}
                    </div>
                    <div className="text-xs text-emerald-600 font-semibold tabular-nums">
                      +{money(Number(inv.currentValue || 0) - Number(inv.principalAmount || 0))}
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
