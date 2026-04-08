import { prisma } from '../lib/db'

async function diagnoseFutureBuckets() {
  console.log('🔍 Diagnosing Future-Dated Cash Buckets...\n')
  
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]
  console.log(`📅 Today: ${todayStr}\n`)

  // Find all cash buckets with future haulStartDate
  const futureBuckets = await prisma.cashBucket.findMany({
    where: {
      haulStartDate: { gt: today },
    },
    orderBy: { haulStartDate: 'desc' },
    select: {
      id: true,
      label: true,
      balance: true,
      currency: true,
      haulStartDate: true,
      excludeFromZakat: true,
      createdAt: true,
      personId: true,
      movements: {
        select: {
          id: true,
          amount: true,
          type: true,
          date: true,
          investmentId: true,
        },
        orderBy: { date: 'asc' },
      },
    },
  })

  // Get all buckets to show available vs total balance
  const allBuckets = await prisma.cashBucket.findMany({
    where: {
      balance: { gt: 0 },
      personId: null, // Owner buckets only
    },
    select: {
      id: true,
      label: true,
      balance: true,
      haulStartDate: true,
      excludeFromZakat: true,
    },
  })

  const totalBalance = allBuckets.reduce((sum: number, b: any) => sum + Number(b.balance || 0), 0)
  const availableBalance = allBuckets
    .filter((b: any) => {
      const haulDate = new Date(b.haulStartDate)
      return haulDate <= today
    })
    .reduce((sum: number, b: any) => sum + Number(b.balance || 0), 0)

  const blockedBalance = totalBalance - availableBalance

  console.log('💰 BALANCE SUMMARY:')
  console.log(`   Total Balance:     ${totalBalance.toFixed(2)} SAR`)
  console.log(`   Available Balance: ${availableBalance.toFixed(2)} SAR (can withdraw)`)
  console.log(`   Blocked Balance:   ${blockedBalance.toFixed(2)} SAR (future haul dates)`)
  console.log(`   Blocked Buckets:   ${futureBuckets.length}\n`)

  if (futureBuckets.length === 0) {
    console.log('✅ No buckets with future haulStartDate found!')
  } else {
    console.log(`⚠️  FOUND ${futureBuckets.length} BUCKET(S) WITH FUTURE HAUL DATES:\n`)
    
    for (const bucket of futureBuckets) {
      const haulStr = bucket.haulStartDate.toISOString().split('T')[0]
      const createdStr = bucket.createdAt.toISOString().split('T')[0]
      const earliestMovement = bucket.movements[0]
      const earliestDate = earliestMovement 
        ? new Date(earliestMovement.date).toISOString().split('T')[0]
        : 'N/A'

      console.log(`📦 Bucket: ${bucket.label || '(no label)'}`)
      console.log(`   ID: ${bucket.id}`)
      console.log(`   Balance: ${bucket.balance} ${bucket.currency}`)
      console.log(`   Haul Start: ${haulStr} ⚠️ (FUTURE)`)
      console.log(`   Created: ${createdStr}`)
      console.log(`   Earliest Movement: ${earliestDate}`)
      console.log(`   Excluded from Zakat: ${bucket.excludeFromZakat}`)
      console.log(`   Person ID: ${bucket.personId || 'owner'}`)
      
      if (earliestMovement?.investmentId) {
        const investment = await prisma.investment.findUnique({
          where: { id: earliestMovement.investmentId },
          select: { id: true, name: true, startDate: true, category: true },
        })
        
        if (investment) {
          const invStartStr = new Date(investment.startDate).toISOString().split('T')[0]
          console.log(`   Related Investment: ${investment.name}`)
          console.log(`   Investment Category: ${investment.category}`)
          console.log(`   Investment Start: ${invStartStr}`)
        }
      }
      console.log('')
    }
  }

  // Check savings plans
  console.log('\n📊 CHECKING SAVINGS PLANS:\n')
  
  const savingsPlans = await prisma.investment.findMany({
    where: {
      category: 'SAVINGS_ROSCA',
    },
    select: {
      id: true,
      name: true,
      startDate: true,
      metadata: true,
      account: {
        select: {
          name: true,
        },
      },
    },
    orderBy: { startDate: 'desc' },
  })

  if (savingsPlans.length === 0) {
    console.log('   No savings plans found.')
  } else {
    for (const plan of savingsPlans) {
      const startDate = new Date(plan.startDate)
      const startStr = startDate.toISOString().split('T')[0]
      const isFuture = startDate > today

      let metadata: any = {}
      try {
        metadata = JSON.parse(plan.metadata || '{}')
      } catch {}

      console.log(`${isFuture ? '⚠️ ' : '✅ '} ${plan.name}`)
      console.log(`   ID: ${plan.id}`)
      console.log(`   Start Date: ${startStr}${isFuture ? ' (FUTURE!)' : ''}`)
      console.log(`   Account: ${plan.account?.name}`)
      console.log(`   Monthly: ${metadata.monthlyContribution} SAR`)
      console.log(`   Total Months: ${metadata.totalMonths}`)
      console.log(`   Months Paid: ${metadata.monthsPaid || 0}`)
      console.log('')
    }
  }

  await prisma.$disconnect()
}

diagnoseFutureBuckets().catch((error) => {
  console.error('Error:', error)
})
