import { PrismaClient } from "@prisma/client"
const prisma = new PrismaClient()

async function main() {
  const inv = await prisma.investment.findFirst({
    where: { name: { contains: 'Ridwan KIA 2015' } },
    include: {
      dealParticipants: true,
      transactions: {
        where: { type: { in: ['SELL_TO_PARTNER', 'BUY_FROM_PARTNER', 'WITHDRAW_PROFIT', 'WITHDRAW_PRINCIPAL'] }},
        orderBy: { date: 'asc' }
      }
    }
  })

  console.log('Investment:', {
    id: inv?.id,
    name: inv?.name,
    principalAmount: inv?.principalAmount,
    receivableAmount: inv?.receivableAmount,
    totalReceived: inv?.totalReceived,
    interestRate: inv?.interestRate,
    fees: inv?.fees,
    reopenedAt: inv?.reopenedAt,
    startDate: inv?.startDate,
  })

  console.log('DealParticipants:')
  inv?.dealParticipants.forEach(p => console.log({
    personId: p.personId,
    investedAmount: p.investedAmount,
    profit: p.profit,
    receivable: p.receivable,
    currentValue: p.currentValue,
    acquiredAt: p.acquiredAt,
  }))

  console.log('Transactions:')
  inv?.transactions.forEach(t => console.log({
    type: t.type,
    amount: t.amount,
    date: t.date,
    metadata: t.metadata,
  }))
}

main().catch(console.error).finally(() => prisma.$disconnect())
