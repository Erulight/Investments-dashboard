import { prisma } from '../lib/db'

async function fixFutureBucketDates() {
  console.log('🔧 Fixing Future-Dated Cash Buckets...\n')
  
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]
  console.log(`📅 Today: ${todayStr}\n`)

  // Find all cash buckets with future haulStartDate
  const futureBuckets = await prisma.cashBucket.findMany({
    where: {
      haulStartDate: { gt: today },
    },
    orderBy: { haulStartDate: 'asc' },
    select: {
      id: true,
      label: true,
      balance: true,
      currency: true,
      haulStartDate: true,
      createdAt: true,
      movements: {
        select: {
          date: true,
          type: true,
        },
        orderBy: { date: 'asc' },
      },
    },
  })

  if (futureBuckets.length === 0) {
    console.log('✅ No buckets with future haulStartDate found!')
    await prisma.$disconnect()
    return
  }

  console.log(`⚠️  Found ${futureBuckets.length} bucket(s) with future haul dates\n`)

  for (const bucket of futureBuckets) {
    const haulStr = bucket.haulStartDate.toISOString().split('T')[0]
    const createdStr = new Date(bucket.createdAt).toISOString().split('T')[0]
    
    // Find the earliest CASH_IN movement date
    const earliestCashIn = bucket.movements
      .filter((m: any) => m.type === 'CASH_IN')
      .map((m: any) => new Date(m.date))
      .sort((a, b) => a.getTime() - b.getTime())[0]

    // Determine the correct haul start date:
    // 1. Use earliest CASH_IN date if it exists and is not in future
    // 2. Otherwise use bucket creation date
    // 3. If creation date is also in future (shouldn't happen), use today
    let newHaulStartDate: Date
    
    if (earliestCashIn && earliestCashIn <= today) {
      newHaulStartDate = earliestCashIn
    } else {
      const createdDate = new Date(bucket.createdAt)
      newHaulStartDate = createdDate <= today ? createdDate : today
    }

    const newHaulStr = newHaulStartDate.toISOString().split('T')[0]

    console.log(`📦 Bucket: ${bucket.label || '(no label)'}`)
    console.log(`   ID: ${bucket.id}`)
    console.log(`   Balance: ${bucket.balance} ${bucket.currency}`)
    console.log(`   Current Haul Start: ${haulStr} ⚠️`)
    console.log(`   Created Date: ${createdStr}`)
    console.log(`   New Haul Start: ${newHaulStr} ✅`)
    console.log(`   Action: ${earliestCashIn && earliestCashIn <= today ? 'Using earliest CASH_IN date' : 'Using creation date'}`)
    console.log('')
  }

  console.log('\n🤔 Do you want to apply these fixes? (This will update the database)')
  console.log('   Run with APPLY=true to execute: APPLY=true npx tsx scripts/fix-future-bucket-dates.ts\n')

  const shouldApply = process.env.APPLY === 'true'

  if (!shouldApply) {
    console.log('ℹ️  Dry run completed. No changes made.')
    await prisma.$disconnect()
    return
  }

  console.log('🚀 Applying fixes...\n')

  let fixedCount = 0
  for (const bucket of futureBuckets) {
    const earliestCashIn = bucket.movements
      .filter((m: any) => m.type === 'CASH_IN')
      .map((m: any) => new Date(m.date))
      .sort((a, b) => a.getTime() - b.getTime())[0]

    let newHaulStartDate: Date
    if (earliestCashIn && earliestCashIn <= today) {
      newHaulStartDate = earliestCashIn
    } else {
      const createdDate = new Date(bucket.createdAt)
      newHaulStartDate = createdDate <= today ? createdDate : today
    }

    await prisma.cashBucket.update({
      where: { id: bucket.id },
      data: { haulStartDate: newHaulStartDate },
    })

    console.log(`✅ Fixed: ${bucket.label || '(no label)'} (${bucket.id})`)
    fixedCount++
  }

  console.log(`\n✨ Successfully fixed ${fixedCount} bucket(s)!`)
  console.log(`💰 ${(futureBuckets.reduce((sum: number, b: any) => sum + Number(b.balance || 0), 0)).toFixed(2)} SAR is now available for withdrawal`)

  await prisma.$disconnect()
}

fixFutureBucketDates().catch((error) => {
  console.error('Error:', error)
})
