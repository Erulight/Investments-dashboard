const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  console.log('Starting fix for OWNER transaction personId...')

  // Find OWNER users
  const owners = await prisma.user.findMany({
    where: { role: 'OWNER' },
    select: { id: true, email: true, personId: true },
  })

  if (owners.length === 0) {
    console.log('No OWNER users found')
    return
  }

  console.log(`Found ${owners.length} OWNER user(s):`)
  owners.forEach(o => console.log(`  - ${o.email} (personId: ${o.personId})`))

  // Find cash account
  const cashAccount = await prisma.account.findFirst({
    where: { type: 'CASH', isActive: true },
  })

  if (!cashAccount) {
    console.log('No CASH account found')
    return
  }

  console.log(`\nCash account: ${cashAccount.name} (${cashAccount.id})`)

  // Find all transactions with OWNER's personId that should be null
  const ownerPersonIds = owners.map(o => o.personId).filter(Boolean)

  if (ownerPersonIds.length === 0) {
    console.log('\nNo OWNER users have personId set - nothing to fix')
    return
  }

  const affectedTransactions = await prisma.transaction.findMany({
    where: {
      accountId: cashAccount.id,
      personId: { in: ownerPersonIds },
    },
    select: {
      id: true,
      type: true,
      amount: true,
      date: true,
      personId: true,
    },
  })

  console.log(`\nFound ${affectedTransactions.length} transactions to fix:`)
  affectedTransactions.forEach(tx => {
    console.log(`  - ${tx.type} | ${tx.amount} | ${tx.date.toISOString().slice(0, 10)} | personId: ${tx.personId}`)
  })

  if (affectedTransactions.length === 0) {
    console.log('\nNo transactions need fixing!')
    return
  }

  // Confirm before proceeding
  console.log('\n⚠️  This will update all these transactions to have personId = null')
  console.log('Press Ctrl+C to cancel, or wait 5 seconds to proceed...\n')
  
  await new Promise(resolve => setTimeout(resolve, 5000))

  // Update transactions
  const result = await prisma.transaction.updateMany({
    where: {
      accountId: cashAccount.id,
      personId: { in: ownerPersonIds },
    },
    data: {
      personId: null,
    },
  })

  console.log(`\n✅ Updated ${result.count} transactions`)
  console.log('\nDone! Your cash ledger should now show all transactions.')
}

main()
  .catch((e) => {
    console.error('Error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
