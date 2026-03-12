import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { prisma } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { requireModuleAccess } from '@/lib/rbac'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/Table'
import { DISPLAY_CURRENCY_KEY, formatCurrencyAmount, normalizeDisplayCurrency } from '@/lib/currency'

export default async function BusinessDealsPage() {
  await requireModuleAccess('business-deals')
  const user = await getCurrentUser()

  if (!user) {
    return null
  }

  const displayCurrencySetting = await prisma.systemSetting.findUnique({
    where: { key: DISPLAY_CURRENCY_KEY },
  })
  const displayCurrency = normalizeDisplayCurrency(displayCurrencySetting?.value)
  const money = (value: number) => formatCurrencyAmount(value, displayCurrency, 'SAR')

  let investments: any[] = []

  if (user.role === 'OWNER') {
    investments = await prisma.investment.findMany({
      where: {
        account: {
          type: 'BUSINESS',
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
            type: 'BUSINESS'
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
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-xl shadow-md p-6 text-white">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-2xl font-bold">Business Deals</h1>
            <p className="text-sm text-slate-400 mt-1">Private business investments and partnerships</p>
          </div>
          <span className="hidden lg:block text-4xl opacity-80">🤝</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-white/5 rounded-lg p-3 border border-white/10">
            <p className="text-[11px] text-slate-400 uppercase tracking-wider">Portfolio Value</p>
            <p className="text-lg font-bold mt-0.5">{money(totalValue)}</p>
          </div>
          <div className="bg-white/5 rounded-lg p-3 border border-white/10">
            <p className="text-[11px] text-slate-400 uppercase tracking-wider">Total Return</p>
            <p className="text-lg font-bold mt-0.5">{money(totalReturn)}</p>
          </div>
          <div className="bg-white/5 rounded-lg p-3 border border-white/10">
            <p className="text-[11px] text-slate-400 uppercase tracking-wider">Return %</p>
            <p className={`text-lg font-bold mt-0.5 ${returnPercentage >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {returnPercentage >= 0 ? '+' : ''}{returnPercentage.toFixed(2)}%
            </p>
          </div>
        </div>
      </div>

      {/* Investments List */}
      {investments.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="text-4xl mb-4">🤝</div>
            <h3 className="text-lg font-bold text-gray-900 mb-1">No Business Deals Yet</h3>
            <p className="text-sm text-gray-500">
              {user.role === 'OWNER' 
                ? 'Start by importing data or creating your first business deal.' 
                : 'Contact the owner to add you to business deals.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-bold text-gray-800">All Business Deals</CardTitle>
                <p className="text-xs text-gray-500 mt-0.5">{investments.length} active deals</p>
              </div>
              {user.role === 'OWNER' && (
                <button className="px-4 py-2 text-xs font-medium text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors">
                  + Add New Deal
                </button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {(() => {
              const totals = investments.reduce(
                (acc: { principal: number; current: number; profit: number }, inv: any) => {
                  const principal = inv.myParticipation?.investedAmount || inv.principalAmount || 0
                  const current = inv.myParticipation?.currentValue || inv.currentValue || 0
                  const profit = inv.myParticipation?.profit || (inv.realizedProfit + inv.unrealizedProfit) || 0
                  acc.principal += Number.isFinite(principal) ? principal : 0
                  acc.current += Number.isFinite(current) ? current : 0
                  acc.profit += Number.isFinite(profit) ? profit : 0
                  return acc
                },
                { principal: 0, current: 0, profit: 0 }
              )
              const currency = investments[0]?.account?.currency || 'SAR'

              return (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Deal Name</TableHead>
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
                        <TableRow key={inv.id} className="hover:bg-gray-50">
                          <TableCell className="font-semibold text-gray-900">{inv.name}</TableCell>
                          <TableCell>
                            <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs font-medium">
                              {inv.account?.name}
                            </span>
                          </TableCell>
                          <TableCell className="font-medium text-gray-700 dark:text-slate-200 tabular-nums">
                            {inv.account?.currency} {principal.toLocaleString()}
                          </TableCell>
                          <TableCell className="font-medium text-gray-900 dark:text-slate-200 tabular-nums">
                            {inv.account?.currency} {current.toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <span
                              className={`font-semibold tabular-nums ${profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}
                            >
                              {profit >= 0 ? '+' : ''}{inv.account?.currency} {Math.abs(profit).toLocaleString()}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span
                              className={`font-semibold tabular-nums ${returnPct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}
                            >
                              {returnPct >= 0 ? '+' : ''}{returnPct.toFixed(2)}%
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded bg-emerald-50 text-emerald-700">
                              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                              Active
                            </span>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell className="font-semibold text-gray-900">Total</TableCell>
                      <TableCell>{null}</TableCell>
                      <TableCell className="font-semibold text-gray-900 tabular-nums">
                        {currency} {totals.principal.toLocaleString()}
                      </TableCell>
                      <TableCell className="font-semibold text-gray-900 tabular-nums">
                        {currency} {totals.current.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`font-semibold tabular-nums ${totals.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}
                        >
                          {totals.profit >= 0 ? '+' : ''}{currency} {Math.abs(totals.profit).toLocaleString()}
                        </span>
                      </TableCell>
                      <TableCell>{null}</TableCell>
                      <TableCell>{null}</TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              )
            })()}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
