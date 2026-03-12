import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
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

  console.log('\n=== GENERAL CASH WITHDRAWAL TIMING CHECK ===\n')
  
  for (const bucket of buckets) {
    if (bucket.movements.length === 0) continue
    
    console.log(`\nBucket: ${bucket.label || '(unlabeled)'} | Balance: ${bucket.balance}`)
    console.log(`Hawl Start: ${bucket.haulStartDate.toISOString().split('T')[0]}`)
    
    const start = new Date(bucket.haulStartDate)
    const now = new Date()
    const elapsed = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
    const completedHawls = Math.floor(elapsed / 354)
    
    console.log(`\nAll Movements:`)
    bucket.movements.forEach((m: any) => {
      console.log(`  ${new Date(m.date).toISOString().split('T')[0]} | ${m.type.padEnd(20)} | ${String(m.amount).padStart(10)}`)
    })
    
    for (let i = 0; i < completedHawls; i++) {
      const hawlStart = new Date(start)
      hawlStart.setDate(hawlStart.getDate() + (i * 354))
      const hawlEnd = new Date(hawlStart)
      hawlEnd.setDate(hawlEnd.getDate() + 354)
      
      const hawlEndStr = hawlEnd.toISOString().split('T')[0]
      
      const cashIn = bucket.movements
        .filter((m: any) => m.type === 'CASH_IN' && new Date(m.date) <= hawlEnd)
        .reduce((sum: number, m: any) => sum + Number(m.amount), 0)
      
      const outflows = bucket.movements.filter((m: any) => {
        const isOutflow = ['CASH_OUT', 'INVEST_OUT', 'DEBT_OUT'].includes(m.type)
        return isOutflow && new Date(m.date) <= hawlEnd
      })
      
      const totalOut = outflows.reduce((sum: number, m: any) => sum + Math.abs(Number(m.amount)), 0)
      const held = Math.max(0, cashIn - totalOut)
      const zakat = held * 0.025
      
      console.log(`\n  Hawl ${i + 1}: ${hawlStart.toISOString().split('T')[0]} → ${hawlEndStr}`)
      console.log(`    Cash In by end: ${cashIn}`)
      console.log(`    Outflows by end: ${totalOut}`)
      console.log(`    Held for full hawl: ${held}`)
      console.log(`    Expected Zakat: ${zakat}`)
      
      if (outflows.length > 0) {
        console.log(`    Withdrawal details:`)
        outflows.forEach((m: any) => {
          const withdrawDate = new Date(m.date).toISOString().split('T')[0]
          const onHawlEnd = withdrawDate === hawlEndStr
          console.log(`      ${withdrawDate} | ${m.type} | ${m.amount} ${onHawlEnd ? '← ON HAWL END DATE' : ''}`)
        })
      }
    }
  }
  
  await prisma.$disconnect()
}

main().catch(console.error)
