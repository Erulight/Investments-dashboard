const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function checkCashBalance() {
  try {
    // Get SystemSetting CASH_BALANCE
    const setting = await prisma.systemSetting.findUnique({
      where: { key: 'CASH_BALANCE' }
    })
    
    // Get cash account
    const cashAccount = await prisma.account.findFirst({
      where: { type: 'CASH' }
    })
    
    // Get transaction sum
    const txSum = await prisma.transaction.aggregate({
      where: { accountId: cashAccount?.id },
      _sum: { amount: true }
    })
    
    // Get all cash transactions for review
    const txs = await prisma.transaction.findMany({
      where: { accountId: cashAccount?.id },
      orderBy: { date: 'asc' },
      select: {
        type: true,
        amount: true,
        date: true,
        description: true,
        createdAt: true
      }
    })
    
    console.log('\n=== CASH BALANCE DIAGNOSTIC ===\n')
    console.log('SystemSetting CASH_BALANCE:', setting?.value || 'NOT FOUND')
    console.log('Transaction Sum:', txSum._sum.amount || 0)
    console.log('Discrepancy:', (Number(setting?.value || 0) - (txSum._sum.amount || 0)))
    console.log('Total Transactions:', txs.length)
    
    console.log('\n=== TRANSACTION DETAILS ===\n')
    let running = 0
    txs.forEach(t => {
      running += t.amount
      console.log(`${t.date.toISOString().split('T')[0]} | ${t.type.padEnd(20)} | ${String(t.amount).padStart(10)} | Running: ${String(running).padStart(10)} | ${t.description || ''}`)
    })
    
    console.log('\n=== DEBTS ===\n')
    const debts = await prisma.debt.findMany({
      select: {
        id: true,
        personId: true,
        amount: true,
        person: { select: { name: true } },
        payments: { select: { amount: true } }
      }
    })
    
    debts.forEach(d => {
      const paid = d.payments.reduce((sum, p) => sum + p.amount, 0)
      const outstanding = d.amount - paid
      console.log(`${d.person.name}: SAR ${d.amount} (Paid: ${paid}, Outstanding: ${outstanding})`)
    })
    
    console.log('\n=== SUMMARY ===\n')
    const totalDebts = debts.reduce((sum, d) => sum + d.amount, 0)
    const totalPaid = debts.reduce((sum, d) => sum + d.payments.reduce((s, p) => s + p.amount, 0), 0)
    const totalOutstanding = totalDebts - totalPaid
    console.log(`Total Debts: SAR ${totalDebts}`)
    console.log(`Total Paid: SAR ${totalPaid}`)
    console.log(`Total Outstanding: SAR ${totalOutstanding}`)
    
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await prisma.$disconnect()
  }
}

checkCashBalance()
