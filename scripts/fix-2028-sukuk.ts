import { config } from 'dotenv'
import { prisma } from '../lib/db'

config()

async function fix2028Sukuk() {
  console.log('🔧 Fixing 2028 Sukuk Entries...\n')
  
  const today = new Date()
  const oneYearFromNow = new Date()
  oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1)
  
  console.log(`Today: ${today.toISOString().split('T')[0]}`)
  console.log(`Looking for dates beyond: ${oneYearFromNow.toISOString().split('T')[0]}\n`)

  // Find transactions beyond 1 year (definitely wrong)
  const wrongTx = await prisma.transaction.findMany({
    where: { 
      date: { gt: oneYearFromNow }
    },
    select: { 
      id: true, 
      date: true, 
      type: true, 
      amount: true, 
      description: true, 
      createdAt: true,
      investment: {
        select: { name: true }
      }
    },
  })

  console.log(`Found ${wrongTx.length} transaction(s) with clearly wrong dates:\n`)

  // Find movements beyond 1 year
  const wrongMovements = await prisma.cashBucketMovement.findMany({
    where: { 
      date: { gt: oneYearFromNow }
    },
    select: { 
      id: true, 
      date: true, 
      type: true, 
      amount: true, 
      createdAt: true,
      notes: true,
      investment: {
        select: { name: true }
      }
    },
  })

  console.log(`Found ${wrongMovements.length} movement(s) with clearly wrong dates:\n`)

  const shouldApply = process.env.APPLY === 'true'

  if (!shouldApply) {
    console.log('📋 DRY RUN - Preview:\n')
    
    for (const tx of wrongTx) {
      const createdDate = new Date(tx.createdAt)
      const newDate = createdDate <= today ? createdDate : today
      console.log(`📝 Transaction: ${tx.investment?.name || 'N/A'}`)
      console.log(`   ${tx.type} - ${tx.amount} SAR`)
      console.log(`   Current: ${new Date(tx.date).toISOString().split('T')[0]}`)
      console.log(`   Will change to: ${newDate.toISOString().split('T')[0]}`)
      console.log(`   Description: ${tx.description || '(none)'}`)
      console.log('')
    }

    for (const mov of wrongMovements) {
      const createdDate = new Date(mov.createdAt)
      const newDate = createdDate <= today ? createdDate : today
      console.log(`💸 Movement: ${mov.investment?.name || 'N/A'}`)
      console.log(`   ${mov.type} - ${mov.amount}`)
      console.log(`   Current: ${new Date(mov.date).toISOString().split('T')[0]}`)
      console.log(`   Will change to: ${newDate.toISOString().split('T')[0]}`)
      console.log(`   Notes: ${mov.notes || '(none)'}`)
      console.log('')
    }

    console.log('\n🤔 Run with APPLY=true to execute: APPLY=true npx tsx scripts/fix-2028-sukuk.ts\n')
    await prisma.$disconnect()
    return
  }

  console.log('🚀 Applying fixes...\n')

  let count = 0

  // Fix transactions
  for (const tx of wrongTx) {
    const createdDate = new Date(tx.createdAt)
    const newDate = createdDate <= today ? createdDate : today
    
    await prisma.transaction.update({
      where: { id: tx.id },
      data: { date: newDate },
    })
    
    console.log(`✅ Fixed: ${tx.type} for ${tx.investment?.name} - ${new Date(tx.date).toISOString().split('T')[0]} → ${newDate.toISOString().split('T')[0]}`)
    count++
  }

  // Fix movements
  for (const mov of wrongMovements) {
    const createdDate = new Date(mov.createdAt)
    const newDate = createdDate <= today ? createdDate : today
    
    await prisma.cashBucketMovement.update({
      where: { id: mov.id },
      data: { date: newDate },
    })
    
    console.log(`✅ Fixed: ${mov.type} for ${mov.investment?.name} - ${new Date(mov.date).toISOString().split('T')[0]} → ${newDate.toISOString().split('T')[0]}`)
    count++
  }

  console.log(`\n✨ Successfully fixed ${count} entry/entries!`)
  console.log(`\n💡 The 2028 Sukuk dates have been corrected!\n`)

  await prisma.$disconnect()
}

fix2028Sukuk().catch(console.error)
