import { config } from 'dotenv'
import { prisma } from '../lib/db'

config()

async function checkBucketTimes() {
  console.log('🔍 Checking Bucket Exact Times...\n')
  
  const buckets = await prisma.cashBucket.findMany({
    where: {
      balance: { gt: 0 },
      personId: null,
    },
    orderBy: { haulStartDate: 'desc' },
    select: {
      id: true,
      label: true,
      balance: true,
      haulStartDate: true,
      createdAt: true,
    },
    take: 10,
  })

  const now = new Date()
  console.log(`Current Time: ${now.toISOString()}`)
  console.log(`Current Time (local): ${now.toString()}\n`)

  for (const bucket of buckets) {
    const haulDate = new Date(bucket.haulStartDate)
    const isFuture = haulDate > now
    
    console.log(`${isFuture ? '⚠️ ' : '✅'} ${bucket.label || '(no label)'}`)
    console.log(`   Balance: ${bucket.balance}`)
    console.log(`   Haul Start: ${haulDate.toISOString()}`)
    console.log(`   Haul Start (local): ${haulDate.toString()}`)
    console.log(`   Is Future: ${isFuture}`)
    console.log(`   Difference: ${(haulDate.getTime() - now.getTime()) / 1000 / 60} minutes`)
    console.log('')
  }

  await prisma.$disconnect()
}

checkBucketTimes().catch(console.error)
