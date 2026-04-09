import { config } from 'dotenv'
import { prisma } from '../lib/db'

config()

async function findFutureTransactions() {
  console.log('🔍 Finding Future-Dated Transactions...\n')
  
  const today = new Date()
  console.log(`Today: ${today.toISOString()}\n`)

  // Find future transactions in cash ledger
  const futureTx = await prisma.transaction.findMany({
    where: {
      date: { gt: today },
    },
    orderBy: { date: 'desc' },
    select: {
      id: true,
      type: true,
      amount: true,
      date: true,
      description: true,
      account: {
        select: {
          name: true,
          type: true,
        },
      },
      investment: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  })

  if (futureTx.length === 0) {
    console.log('✅ No future transactions found!')
    await prisma.$disconnect()
    return
  }

  console.log(`⚠️  Found ${futureTx.length} future transaction(s):\n`)

  for (const tx of futureTx) {
    console.log(`📝 Transaction ID: ${tx.id}`)
    console.log(`   Type: ${tx.type}`)
    console.log(`   Amount: ${tx.amount}`)
    console.log(`   Date: ${new Date(tx.date).toISOString()}`)
    console.log(`   Account: ${tx.account?.name} (${tx.account?.type})`)
    console.log(`   Investment: ${tx.investment?.name || 'N/A'}`)
    console.log(`   Description: ${tx.description || '(none)'}`)
    console.log('')
  }

  // Find future cash bucket movements
  console.log('\n🔍 Checking for future cash bucket movements...\n')

  const futureMovements = await prisma.cashBucketMovement.findMany({
    where: {
      date: { gt: today },
    },
    orderBy: { date: 'desc' },
    select: {
      id: true,
      type: true,
      amount: true,
      date: true,
      notes: true,
      cashBucket: {
        select: {
          id: true,
          label: true,
          balance: true,
        },
      },
      investment: {
        select: {
          name: true,
        },
      },
    },
  })

  if (futureMovements.length > 0) {
    console.log(`⚠️  Found ${futureMovements.length} future movement(s):\n`)
    for (const mov of futureMovements) {
      console.log(`💸 Movement ID: ${mov.id}`)
      console.log(`   Type: ${mov.type}`)
      console.log(`   Amount: ${mov.amount}`)
      console.log(`   Date: ${new Date(mov.date).toISOString()}`)
      console.log(`   Bucket: ${mov.cashBucket.label || '(no label)'} (ID: ${mov.cashBucket.id})`)
      console.log(`   Investment: ${mov.investment?.name || 'N/A'}`)
      console.log(`   Notes: ${mov.notes || '(none)'}`)
      console.log('')
    }
  } else {
    console.log('✅ No future movements found!')
  }

  console.log('\n💡 To fix these, you can either:')
  console.log('   1. Manually update the dates in the database')
  console.log('   2. Delete the transactions if they were mistakes')
  console.log('   3. Run a fix script (I can create one if needed)\n')

  await prisma.$disconnect()
}

findFutureTransactions().catch(console.error)
