const { PrismaClient } = require('@prisma/client')

async function findProblematicInvestment() {
  const prisma = new PrismaClient()
  
  try {
    console.log('=== FINDING PROBLEMATIC INVESTMENT ===\n')

    // Find investments with SOLD_DEAL_SETTLEMENT or PARTNER_COMMISSION transactions
    const problematicTransactions = await prisma.transaction.findMany({
      where: {
        type: { in: ['SOLD_DEAL_SETTLEMENT', 'PARTNER_COMMISSION'] }
      },
      include: {
        investment: {
          select: {
            id: true,
            name: true,
            principalAmount: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    })

    if (problematicTransactions.length === 0) {
      console.log('✅ No problematic transactions found')
      return
    }

    console.log(`🔍 Found ${problematicTransactions.length} problematic transactions:\n`)

    const investmentGroups = new Map()
    
    problematicTransactions.forEach(tx => {
      const investmentId = tx.investmentId
      if (!investmentGroups.has(investmentId)) {
        investmentGroups.set(investmentId, {
          investment: tx.investment,
          transactions: []
        })
      }
      investmentGroups.get(investmentId).transactions.push(tx)
    })

    investmentGroups.forEach((group, investmentId) => {
      console.log(`📊 Investment: ${group.investment?.name || 'Unknown'} (ID: ${investmentId})`)
      console.log(`   Principal: SAR ${group.investment?.principalAmount || 0}`)
      
      let totalAmount = 0
      group.transactions.forEach(tx => {
        console.log(`   - ${tx.type}: SAR ${tx.amount} (${tx.date.toISOString().split('T')[0]})`)
        totalAmount += tx.amount
      })
      
      console.log(`   💰 Total problematic amount: SAR ${totalAmount}`)
      console.log(`   🔧 To fix this investment, use:`)
      console.log(`      POST /api/admin/fix-cash-data`)
      console.log(`      Body: { "investmentId": "${investmentId}", "confirm": true }`)
      console.log('')
    })

    // Show current cash balance
    const cashSetting = await prisma.systemSetting.findUnique({
      where: { key: 'CASH_BALANCE' }
    })
    
    console.log(`💰 Current CASH_BALANCE: SAR ${cashSetting?.value || 'NOT FOUND'}`)
    
    // Calculate what it should be after fixes
    const totalProblematicAmount = problematicTransactions.reduce((sum, tx) => sum + tx.amount, 0)
    const currentBalance = Number(cashSetting?.value || 0)
    const correctedBalance = currentBalance - totalProblematicAmount
    
    console.log(`📉 Total problematic amount across all investments: SAR ${totalProblematicAmount}`)
    console.log(`✅ Corrected balance should be: SAR ${correctedBalance}`)

  } catch (error) {
    console.error('❌ Error finding problematic investment:', error)
  } finally {
    await prisma.$disconnect()
  }
}

findProblematicInvestment()
