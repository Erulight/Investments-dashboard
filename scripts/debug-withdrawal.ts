import { config } from 'dotenv'
import { prisma } from '../lib/db'

config()

async function debugWithdrawal() {
  console.log('🔍 Debug Cash Withdrawal Issue\n')
  
  const now = new Date()
  console.log(`Current Time: ${now.toISOString()}`)
  console.log(`Local Time: ${now.toString()}\n`)

  // Check total balance
  const allBuckets = await prisma.cashBucket.findMany({
    where: {
      personId: null,
      balance: { gt: 0 },
    },
    select: {
      id: true,
      label: true,
      balance: true,
      haulStartDate: true,
      excludeFromZakat: true,
      createdAt: true,
    },
    orderBy: { haulStartDate: 'desc' },
  })

  const totalBalance = allBuckets.reduce((sum: number, b: any) => sum + Number(b.balance || 0), 0)
  console.log(`📊 Total Balance (all buckets): ${totalBalance.toFixed(2)} SAR\n`)

  // Check which buckets are available for withdrawal TODAY
  const availableBuckets = allBuckets.filter((b: any) => {
    const haulDate = new Date(b.haulStartDate)
    return haulDate <= now
  })

  const availableBalance = availableBuckets.reduce((sum: number, b: any) => sum + Number(b.balance || 0), 0)
  console.log(`💰 Available Balance (today): ${availableBalance.toFixed(2)} SAR\n`)

  // Check future buckets
  const futureBuckets = allBuckets.filter((b: any) => {
    const haulDate = new Date(b.haulStartDate)
    return haulDate > now
  })

  if (futureBuckets.length > 0) {
    console.log(`⚠️  FOUND ${futureBuckets.length} BUCKETS WITH FUTURE HAUL DATES:\n`)
    for (const bucket of futureBuckets) {
      const haulDate = new Date(bucket.haulStartDate)
      console.log(`📦 ${bucket.label || '(no label)'}`)
      console.log(`   Balance: ${bucket.balance}`)
      console.log(`   Haul Start: ${haulDate.toISOString()}`)
      console.log(`   Created: ${new Date(bucket.createdAt).toISOString()}`)
      console.log(`   Minutes in future: ${((haulDate.getTime() - now.getTime()) / 1000 / 60).toFixed(2)}`)
      console.log('')
    }
  }

  // Simulate withdrawal logic
  console.log('\n🧪 SIMULATING WITHDRAWAL FOR 500 SAR:\n')
  
  const testAmount = 500
  const testDate = now
  const cutoff = testDate

  const eligibleBuckets = await prisma.cashBucket.findMany({
    where: {
      balance: { gt: 0 },
      personId: null,
      haulStartDate: { lte: cutoff },
    },
    orderBy: [{ haulStartDate: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      label: true,
      balance: true,
      haulStartDate: true,
    },
  })

  console.log(`Found ${eligibleBuckets.length} eligible bucket(s) for withdrawal`)
  console.log(`Total in eligible buckets: ${eligibleBuckets.reduce((sum: number, b: any) => sum + Number(b.balance || 0), 0).toFixed(2)} SAR\n`)

  let remaining = testAmount
  for (const bucket of eligibleBuckets) {
    if (remaining <= 0) break
    const used = Math.min(bucket.balance, remaining)
    console.log(`Would use ${used.toFixed(2)} from "${bucket.label || '(no label)'}" (${bucket.balance} available)`)
    remaining -= used
  }

  if (remaining > 0.0001) {
    console.log(`\n❌ INSUFFICIENT! Still need ${remaining.toFixed(2)} SAR more`)
  } else {
    console.log(`\n✅ SUCCESS! Can withdraw ${testAmount} SAR`)
  }

  // Check cash ledger transactions
  console.log('\n\n📖 RECENT CASH LEDGER TRANSACTIONS:\n')
  
  const recentTx = await prisma.transaction.findMany({
    where: {
      account: { type: 'CASH' },
    },
    orderBy: { date: 'desc' },
    take: 10,
    select: {
      id: true,
      type: true,
      amount: true,
      date: true,
      description: true,
    },
  })

  for (const tx of recentTx) {
    console.log(`${tx.type.padEnd(12)} ${String(tx.amount).padStart(10)} SAR - ${new Date(tx.date).toISOString().split('T')[0]} - ${tx.description || '(no description)'}`)
  }

  await prisma.$disconnect()
}

debugWithdrawal().catch(console.error)
