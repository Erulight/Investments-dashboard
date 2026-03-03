import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const setting = await prisma.systemSetting.findUnique({
    where: { key: 'CASH_BALANCE' },
  })
  console.log('SystemSetting CASH_BALANCE:', setting?.value)

  const cashAccount = await prisma.account.findFirst({
    where: { type: 'CASH' },
  })
  console.log('Cash Account:', cashAccount?.id, cashAccount?.name)

  const txSum = cashAccount?.id
    ? await prisma.transaction.aggregate({
        where: { accountId: cashAccount.id },
        _sum: { amount: true },
      })
    : { _sum: { amount: 0 } }

  console.log('Sum of all cash transactions:', txSum._sum.amount)

  const offset = Number(setting?.value || 0) - Number(txSum._sum.amount || 0)
  console.log('Current cashOffset (should be 0 ideally):', offset)

  const txs = cashAccount?.id
    ? await prisma.transaction.findMany({
        where: { accountId: cashAccount.id },
        orderBy: { date: 'asc' },
        select: { type: true, amount: true, date: true, description: true },
      })
    : []

  console.log('All cash transactions:')
  txs.forEach((t) =>
    console.log(
      ` ${t.date.toISOString().split('T')[0]} | ${t.type} | ${t.amount} | ${t.description}`
    )
  )

  const debts = await prisma.debt.findMany({
    where: { isArchived: false },
    include: { payments: true },
  })

  console.log('\nAll debts:')
  debts.forEach((d) => {
    const paid = Array.isArray(d.payments)
      ? d.payments.reduce((s, p) => s + Number(p.amount || 0), 0)
      : 0
    console.log(
      ` ${d.lenderName} | borrowed: ${d.amount} | paid: ${paid} | outstanding: ${Number(d.amount) - paid}`
    )
  })

  const buckets = await prisma.cashBucket.findMany({
    where: { personId: null },
    select: { label: true, balance: true, excludeFromZakat: true },
  })

  console.log('\nAll owner cash buckets:')
  buckets.forEach((b) =>
    console.log(
      ` "${b.label}" | balance: ${b.balance} | excludeFromZakat: ${b.excludeFromZakat}`
    )
  )
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect()
  })
