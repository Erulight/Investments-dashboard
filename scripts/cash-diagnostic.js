const { PrismaClient } = require('@prisma/client')

async function runCashDiagnostic() {
  const prisma = new PrismaClient()
  
  try {
    console.log('=== CASH BALANCE DIAGNOSTIC ===\n')

    const cashAccount = await prisma.account.findFirst({
      where: { type: 'CASH' }
    })

    if (!cashAccount) {
      console.log('❌ No cash account found')
      return
    }

    console.log(`📊 Cash Account: ${cashAccount.name} (ID: ${cashAccount.id})`)

    const txs = await prisma.transaction.findMany({
      where: { accountId: cashAccount.id },
      orderBy: { date: 'asc' },
      select: { 
        type: true, 
        amount: true, 
        date: true, 
        description: true,
        createdAt: true 
      }
    })

    console.log(`\n📋 Transaction History (${txs.length} transactions):\n`)

    let running = 0
    txs.forEach(t => {
      running += t.amount
      const dateStr = t.date.toISOString().split('T')[0]
      const amountStr = t.amount >= 0 ? `+${t.amount}` : `${t.amount}`
      console.log(`${t.type.padEnd(20)} | ${amountStr.padStart(10)} | running: ${running.toFixed(2).padStart(10)} | ${dateStr} | ${t.description || 'No description'}`)
    })

    const setting = await prisma.systemSetting.findUnique({ 
      where: { key: 'CASH_BALANCE' }
    })

    console.log('\n=== SUMMARY ===')
    console.log(`SystemSetting CASH_BALANCE: ${setting?.value || 'NOT FOUND'}`)
    console.log(`Transaction sum: ${running}`)
    console.log(`Discrepancy: ${Number(setting?.value || 0) - running}`)

    if (Math.abs(Number(setting?.value || 0) - running) > 0.01) {
      console.log('\n⚠️  DISCREPANCY DETECTED!')
      console.log('The system setting does not match the transaction sum.')
    } else {
      console.log('\n✅ Balances match!')
    }

  } catch (error) {
    console.error('❌ Error running diagnostic:', error)
  } finally {
    await prisma.$disconnect()
  }
}

runCashDiagnostic()
