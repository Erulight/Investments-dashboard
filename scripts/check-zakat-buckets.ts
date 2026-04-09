import { config } from 'dotenv'
import { prisma } from '../lib/db'

config()

async function checkZakatBuckets() {
  console.log('🔍 Checking Zakat Bucket Balances...\n')
  
  // Get all cash buckets with balance
  const buckets = await prisma.cashBucket.findMany({
    where: {
      balance: { gt: 0 },
    },
    orderBy: { balance: 'desc' },
    select: {
      id: true,
      label: true,
      balance: true,
      currency: true,
      personId: true,
      excludeFromZakat: true,
      haulStartDate: true,
    },
  })

  console.log(`Found ${buckets.length} bucket(s) with balance:\n`)

  let totalCash = 0
  let zakatEligibleCash = 0

  for (const bucket of buckets) {
    const isZakatEligible = !bucket.excludeFromZakat
    const personLabel = bucket.personId ? `(Person: ${bucket.personId})` : '(Owner)'
    const zakatLabel = isZakatEligible ? '✅ Zakat' : '❌ No Zakat'
    
    console.log(`${bucket.label || '(no label)'}`)
    console.log(`  ID: ${bucket.id}`)
    console.log(`  Balance: ${bucket.balance} ${bucket.currency}`)
    console.log(`  ${personLabel} ${zakatLabel}`)
    console.log(`  Haul Start: ${new Date(bucket.haulStartDate).toISOString().split('T')[0]}`)
    console.log('')

    totalCash += Number(bucket.balance)
    if (isZakatEligible) {
      zakatEligibleCash += Number(bucket.balance)
    }
  }

  console.log(`\n📊 Summary:`)
  console.log(`  Total Cash: ${totalCash.toFixed(2)} SAR`)
  console.log(`  Zakat Eligible: ${zakatEligibleCash.toFixed(2)} SAR`)
  console.log(`  Excluded from Zakat: ${(totalCash - zakatEligibleCash).toFixed(2)} SAR`)

  await prisma.$disconnect()
}

checkZakatBuckets().catch(console.error)
