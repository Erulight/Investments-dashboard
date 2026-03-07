const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  console.log('=== DEBUGGING HAUL DATES ===\n')

  // Find OWNER user
  const owner = await prisma.user.findFirst({
    where: { role: 'OWNER' },
    select: { id: true, email: true, personId: true },
  })

  if (!owner) {
    console.log('No OWNER user found')
    return
  }

  console.log(`OWNER: ${owner.email} (personId: ${owner.personId})\n`)

  // Find all cash buckets for OWNER
  const buckets = await prisma.cashBucket.findMany({
    where: { personId: null },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      label: true,
      balance: true,
      haulStartDate: true,
      createdAt: true,
      movements: {
        select: {
          type: true,
          amount: true,
          date: true,
          investmentId: true,
        },
        orderBy: { date: 'asc' },
      },
    },
  })

  console.log(`Found ${buckets.length} OWNER cash buckets:\n`)

  for (const bucket of buckets) {
    console.log(`Bucket: ${bucket.label || 'Unlabeled'}`)
    console.log(`  ID: ${bucket.id}`)
    console.log(`  Haul Start: ${bucket.haulStartDate.toISOString().slice(0, 10)}`)
    console.log(`  Balance: ${bucket.balance}`)
    console.log(`  Created: ${bucket.createdAt.toISOString().slice(0, 10)}`)
    console.log(`  Movements:`)
    
    for (const mov of bucket.movements) {
      console.log(`    - ${mov.type} | ${mov.amount} | ${mov.date.toISOString().slice(0, 10)} | inv: ${mov.investmentId || 'none'}`)
    }
    console.log('')
  }

  // Find all investment bucket allocations
  const allocations = await prisma.investmentBucketAllocation.findMany({
    include: {
      cashBucket: {
        select: {
          id: true,
          label: true,
          haulStartDate: true,
          personId: true,
        },
      },
      investment: {
        select: {
          id: true,
          name: true,
          startDate: true,
        },
      },
    },
  })

  console.log(`\nFound ${allocations.length} investment allocations:\n`)

  for (const alloc of allocations) {
    console.log(`Allocation:`)
    console.log(`  Investment: ${alloc.investment.name} (start: ${alloc.investment.startDate.toISOString().slice(0, 10)})`)
    console.log(`  Bucket: ${alloc.cashBucket.label || 'Unlabeled'} (haul: ${alloc.cashBucket.haulStartDate.toISOString().slice(0, 10)})`)
    console.log(`  Principal Allocated: ${alloc.principalAllocated}`)
    console.log(`  Principal Remaining: ${alloc.principalRemaining}`)
    console.log(`  Bucket PersonId: ${alloc.cashBucket.personId}`)
    console.log('')
  }

  // Find all sukuk investments
  const sukuks = await prisma.investment.findMany({
    where: {
      account: { type: 'SUKUK' },
    },
    select: {
      id: true,
      name: true,
      startDate: true,
      principalAmount: true,
      totalReceived: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  console.log(`\nFound ${sukuks.length} Sukuk investments:\n`)

  for (const sukuk of sukuks) {
    console.log(`Sukuk: ${sukuk.name}`)
    console.log(`  Start Date: ${sukuk.startDate.toISOString().slice(0, 10)}`)
    console.log(`  Principal: ${sukuk.principalAmount}`)
    console.log(`  Total Received: ${sukuk.totalReceived}`)
    console.log('')
  }
}

main()
  .catch((e) => {
    console.error('Error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
