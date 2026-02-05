import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { ZakatDashboard } from '@/components/zakat/ZakatDashboard'
import type { ZakatSukukDeal } from '@/lib/zakat'

const payoutTypes = [
  'WITHDRAW_PROFIT',
  'WITHDRAW_PRINCIPAL',
  'SELL_TO_PARTNER',
  'BUY_FROM_PARTNER',
  'PAYOUT_PROFIT',
  'PAYOUT_PRINCIPAL',
  'PAYOUT_MIXED',
]

export default async function ZakatPage() {
  const user = await getCurrentUser()
  if (!user) return null

  let investments: any[] = []
  let transactions: any[] = []

  if (user.role === 'OWNER') {
    investments = await prisma.investment.findMany({
      include: {
        account: true,
      },
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

  const sukukInvestments = investments.filter((inv) => inv.account?.type === 'SUKUK')
  const sukukIds = sukukInvestments.map((inv) => inv.id)

  if (sukukIds.length > 0) {
    transactions = await prisma.transaction.findMany({
      where: {
        investmentId: { in: sukukIds },
        type: { in: payoutTypes },
        ...(user.role !== 'OWNER' ? { personId: user.personId || undefined } : {}),
      },
      orderBy: { date: 'asc' },
    })
  }

  const payoutsByInvestment = transactions.reduce<Record<string, any[]>>((acc, tx) => {
    if (!tx.investmentId) return acc
    if (!acc[tx.investmentId]) acc[tx.investmentId] = []
    acc[tx.investmentId].push(tx)
    return acc
  }, {})

  const sukukDeals: ZakatSukukDeal[] = sukukInvestments.map((inv) => {
    const payouts = payoutsByInvestment[inv.id] || []
    const profitModel: ZakatSukukDeal['profitModel'] =
      payouts.length > 0 ? 'Periodic payouts' : 'Bullet payout at maturity'
    const principal =
      inv.myParticipation?.investedAmount ?? inv.principalAmount ?? 0

    return {
      id: inv.id,
      platform: inv.account?.name || '—',
      company: inv.name,
      sukukType: inv.category,
      principalInvested: principal,
      startDate: inv.startDate,
      maturityDate: inv.maturityDate,
      profitModel,
      payouts: payouts.map((payout) => ({
        id: payout.id,
        date: payout.date,
        amount: payout.amount,
        type: payout.type,
        description: payout.description,
      })),
    }
  })

  const sumCurrentValue = (type: string) =>
    investments
      .filter((inv) => inv.account?.type === type)
      .reduce((sum, inv) => {
        const value =
          inv.myParticipation?.currentValue ?? inv.currentValue ?? inv.principalAmount ?? 0
        return sum + value
      }, 0)

  const circlysBase = sumCurrentValue('CIRCLYS')
  const cryptoBase = sumCurrentValue('CRYPTO')
  const sipBase = sumCurrentValue('SIP')

  const otherBase = investments
    .filter((inv) => !['SUKUK', 'CIRCLYS', 'CRYPTO', 'SIP'].includes(inv.account?.type))
    .reduce((sum, inv) => sum + (inv.currentValue ?? inv.principalAmount ?? 0), 0)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Zakat</h1>
        <p className="text-gray-600 mt-1">Calculate zakat across your investment portfolio</p>
      </div>
      <ZakatDashboard
        sukukDeals={sukukDeals}
        circlysBase={circlysBase}
        cryptoBase={cryptoBase}
        sipBase={sipBase}
        otherBase={otherBase}
      />
    </div>
  )
}
