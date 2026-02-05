import { notFound } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { ZakatTypeDetails } from '@/components/zakat/ZakatTypeDetails'

const payoutTypes = [
  'WITHDRAW_PROFIT',
  'WITHDRAW_PRINCIPAL',
  'SELL_TO_PARTNER',
  'BUY_FROM_PARTNER',
  'PAYOUT_PROFIT',
  'PAYOUT_PRINCIPAL',
  'PAYOUT_MIXED',
]

export default async function ZakatTypePage({
  params,
}: {
  params: Promise<{ type: string }>
}) {
  const user = await getCurrentUser()
  if (!user) return null
  const { type } = await params

  const allowedTypes = ['sukuk', 'circlys', 'crypto', 'sip', 'cash', 'other']
  if (!allowedTypes.includes(type)) {
    notFound()
  }

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

  if (type === 'sukuk' && sukukIds.length > 0) {
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

  const sukukDeals = sukukInvestments.map((inv) => {
    const payouts = payoutsByInvestment[inv.id] || []
    const profitModel = payouts.length > 0 ? 'Periodic payouts' : 'Bullet payout at maturity'
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

  const sumCurrentValue = (accountType: string) =>
    investments
      .filter((inv) => inv.account?.type === accountType)
      .reduce((sum, inv) => {
        const value =
          inv.myParticipation?.currentValue ?? inv.currentValue ?? inv.principalAmount ?? 0
        return sum + value
      }, 0)

  const baseValue = (() => {
    switch (type) {
      case 'circlys':
        return sumCurrentValue('CIRCLYS')
      case 'crypto':
        return sumCurrentValue('CRYPTO')
      case 'sip':
        return sumCurrentValue('SIP')
      case 'cash':
        return 0
      case 'other':
        return investments
          .filter((inv) => !['SUKUK', 'CIRCLYS', 'CRYPTO', 'SIP'].includes(inv.account?.type))
          .reduce((sum, inv) => sum + (inv.currentValue ?? inv.principalAmount ?? 0), 0)
      default:
        return 0
    }
  })()

  return (
    <ZakatTypeDetails
      type={type.toUpperCase()}
      sukukDeals={sukukDeals}
      baseValue={baseValue}
    />
  )
}
