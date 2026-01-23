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

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Investments</h1>
          <p className="mt-2 text-gray-600">
            Manage your investment portfolio
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {investments.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-gray-500">
                No investments found. {user.role === 'OWNER' ? 'Start by importing data or creating an investment.' : 'Contact the owner to add you to investments.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>All Investments</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
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
                      <TableRow key={inv.id}>
                        <TableCell className="font-medium">{inv.name}</TableCell>
                        <TableCell>{inv.account?.name}</TableCell>
                        <TableCell>
                          {inv.account?.currency} {principal.toLocaleString()}
                        </TableCell>
                        <TableCell>
                          {inv.account?.currency} {current.toLocaleString()}
                        </TableCell>
                        <TableCell className={profit >= 0 ? 'text-green-600' : 'text-red-600'}>
                          {inv.account?.currency} {profit.toLocaleString()}
                        </TableCell>
                        <TableCell className={returnPct >= 0 ? 'text-green-600' : 'text-red-600'}>
                          {returnPct.toFixed(2)}%
                        </TableCell>
                        <TableCell>
                          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
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
