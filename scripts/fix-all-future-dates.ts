import { config } from 'dotenv'
import { prisma } from '../lib/db'

config()

async function fixAllFutureDates() {
  console.log('🔧 Fixing All Future-Dated Entries...\n')
  
  const today = new Date()
  today.setHours(0, 0, 0, 0) // Start of today
  console.log(`Today: ${today.toISOString()}\n`)

  // Find and fix future transactions
  const futureTx = await prisma.transaction.findMany({
    where: { date: { gt: today } },
    select: { id: true, date: true, type: true, amount: true, description: true, createdAt: true },
  })

  console.log(`Found ${futureTx.length} future transaction(s)`)

  // Find and fix future movements
  const futureMovements = await prisma.cashBucketMovement.findMany({
    where: { date: { gt: today } },
    select: { id: true, date: true, type: true, amount: true, createdAt: true },
  })

  console.log(`Found ${futureMovements.length} future cash movement(s)\n`)

  const shouldApply = process.env.APPLY === 'true'

  if (!shouldApply) {
    console.log('📋 DRY RUN - Preview of changes:\n')
    
    console.log('TRANSACTIONS:')
    for (const tx of futureTx) {
      const createdDate = new Date(tx.createdAt)
      const newDate = createdDate <= today ? createdDate : today
      console.log(`  ${tx.type.padEnd(15)} ${String(tx.amount).padStart(8)} - ${new Date(tx.date).toISOString().split('T')[0]} → ${newDate.toISOString().split('T')[0]}`)
    }

    console.log('\nCASH MOVEMENTS:')
    for (const mov of futureMovements) {
      const createdDate = new Date(mov.createdAt)
      const newDate = createdDate <= today ? createdDate : today
      console.log(`  ${mov.type.padEnd(20)} ${String(mov.amount).padStart(10)} - ${new Date(mov.date).toISOString().split('T')[0]} → ${newDate.toISOString().split('T')[0]}`)
    }

    console.log('\n🤔 Run with APPLY=true to execute: APPLY=true npx tsx scripts/fix-all-future-dates.ts\n')
    await prisma.$disconnect()
    return
  }

  console.log('🚀 Applying fixes...\n')

  let txCount = 0
  let movCount = 0

  // Fix transactions
  for (const tx of futureTx) {
    const createdDate = new Date(tx.createdAt)
    const newDate = createdDate <= today ? createdDate : today
    
    await prisma.transaction.update({
      where: { id: tx.id },
      data: { date: newDate },
    })
    
    console.log(`✅ Fixed transaction: ${tx.type} - ${new Date(tx.date).toISOString().split('T')[0]} → ${newDate.toISOString().split('T')[0]}`)
    txCount++
  }

  // Fix cash movements
  for (const mov of futureMovements) {
    const createdDate = new Date(mov.createdAt)
    const newDate = createdDate <= today ? createdDate : today
    
    await prisma.cashBucketMovement.update({
      where: { id: mov.id },
      data: { date: newDate },
    })
    
    console.log(`✅ Fixed movement: ${mov.type} - ${new Date(mov.date).toISOString().split('T')[0]} → ${newDate.toISOString().split('T')[0]}`)
    movCount++
  }

  console.log(`\n✨ Successfully fixed ${txCount} transaction(s) and ${movCount} movement(s)!`)
  console.log(`\n💡 Your cash ledger and buckets should now be clean!\n`)

  await prisma.$disconnect()
}

fixAllFutureDates().catch(console.error)
