const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function checkCashWithdrawals() {
  try {
    // Find General Cash buckets
    const buckets = await prisma.cashBucket.findMany({
      where: {
        personId: null,
        OR: [
          { label: 'General Cash' },
          { label: null }
        ]
      },
      include: {
        movements: {
          orderBy: { date: 'asc' }
        }
      }
    })

    console.log('\n=== GENERAL CASH BUCKETS ===\n')
    
    for (const bucket of buckets) {
      console.log(`\nBucket ID: ${bucket.id}`)
      console.log(`Label: ${bucket.label || '(null)'}`)
      console.log(`Balance: ${bucket.balance}`)
      console.log(`Hawl Start: ${bucket.haulStartDate.toISOString().split('T')[0]}`)
      console.log(`\nMovements:`)
      
      for (const m of bucket.movements) {
        console.log(`  ${m.date.toISOString().split('T')[0]} | ${m.type.padEnd(20)} | ${m.amount.toString().padStart(10)} | ${m.notes || ''}`)
      }
      
      // Calculate hawl periods
      const start = new Date(bucket.haulStartDate)
      const now = new Date()
      const dayMs = 1000 * 60 * 60 * 24
      const elapsed = Math.floor((now - start) / dayMs)
      const completedHawls = Math.floor(elapsed / 354)
      
      console.log(`\nCompleted Hawls: ${completedHawls}`)
      
      for (let i = 0; i < completedHawls; i++) {
        const hawlStart = new Date(start)
        hawlStart.setDate(hawlStart.getDate() + (i * 354))
        const hawlEnd = new Date(hawlStart)
        hawlEnd.setDate(hawlEnd.getDate() + 354)
        
        console.log(`\n  Hawl ${i + 1}: ${hawlStart.toISOString().split('T')[0]} → ${hawlEnd.toISOString().split('T')[0]}`)
        
        // Check for withdrawals before or on hawl end
        const withdrawalsBeforeEnd = bucket.movements.filter(m => {
          const isOutflow = ['CASH_OUT', 'INVEST_OUT', 'DEBT_OUT'].includes(m.type)
          const mDate = new Date(m.date)
          return isOutflow && mDate <= hawlEnd
        })
        
        if (withdrawalsBeforeEnd.length > 0) {
          console.log(`    Withdrawals before/on hawl end:`)
          withdrawalsBeforeEnd.forEach(w => {
            console.log(`      ${w.date.toISOString().split('T')[0]} | ${w.type} | ${w.amount}`)
          })
        }
      }
    }
    
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await prisma.$disconnect()
  }
}

checkCashWithdrawals()
