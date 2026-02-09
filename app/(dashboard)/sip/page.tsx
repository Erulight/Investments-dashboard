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
    <div className="space-y-6 animate-fade-in">
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-xl shadow-md p-6 text-white">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-2xl font-bold">SIP Investments</h1>
            <p className="text-sm text-slate-400 mt-1">Systematic Investment Plan tracking</p>
          </div>
          <span className="hidden lg:block text-4xl opacity-80">📈</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-white/5 rounded-lg p-3 border border-white/10">
            <p className="text-[11px] text-slate-400 uppercase tracking-wider">Portfolio Value</p>
            <p className="text-lg font-bold mt-0.5">SAR {totalValue.toLocaleString()}</p>
          </div>
          <div className="bg-white/5 rounded-lg p-3 border border-white/10">
            <p className="text-[11px] text-slate-400 uppercase tracking-wider">Total Return</p>
            <p className="text-lg font-bold mt-0.5">SAR {totalReturn.toLocaleString()}</p>
          </div>
          <div className="bg-white/5 rounded-lg p-3 border border-white/10">
            <p className="text-[11px] text-slate-400 uppercase tracking-wider">Return %</p>
            <p className={`text-lg font-bold mt-0.5 ${returnPercentage >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {returnPercentage >= 0 ? '+' : ''}{returnPercentage.toFixed(2)}%
            </p>
          </div>
        </div>
      </div>

      {investments.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="text-4xl mb-4">📈</div>
            <h3 className="text-lg font-bold text-gray-900 mb-1">No SIP Investments Yet</h3>
            <p className="text-sm text-gray-500">
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
                <CardTitle className="text-sm font-bold text-gray-800">All SIP Plans</CardTitle>
                <p className="text-xs text-gray-500 mt-0.5">{investments.length} active plans</p>
              </div>
              {user.role === 'OWNER' && (
                <button className="px-4 py-2 text-xs font-medium text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors">
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
                    <TableRow key={inv.id} className="hover:bg-gray-50">
                      <TableCell className="font-semibold text-gray-900">{inv.name}</TableCell>
                      <TableCell>
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs font-medium">
                          {inv.account?.name}
                        </span>
                      </TableCell>
                      <TableCell className="font-medium text-gray-700 tabular-nums">
                        {inv.account?.currency} {principal.toLocaleString()}
                      </TableCell>
                      <TableCell className="font-medium text-gray-900 tabular-nums">
                        {inv.account?.currency} {current.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <span className={`font-semibold tabular-nums ${profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {profit >= 0 ? '+' : ''}{inv.account?.currency} {Math.abs(profit).toLocaleString()}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className={`font-semibold tabular-nums ${returnPct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
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
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
