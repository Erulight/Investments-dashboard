const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function main() {
  try {
    console.log('=== CASH BUCKETS DIAGNOSTIC ===\n')

    // Get all cash buckets
    const buckets = await prisma.cashBucket.findMany({
      where: {
        balance: { gt: 0 }
      },
      orderBy: { haulStartDate: 'asc' },
      include: {
        movements: {
          orderBy: { date: 'asc' }
        }
      }
    })

    console.log(`Found ${buckets.length} cash buckets with positive balance:\n`)

    let totalBalance = 0
    let totalZakat = 0

    buckets.forEach((bucket, index) => {
      console.log(`Bucket ${index + 1}:`)
      console.log(`  ID: ${bucket.id}`)
      console.log(`  Label: ${bucket.label || 'No label'}`)
      console.log(`  Balance: SAR ${bucket.balance}`)
      console.log(`  Currency: ${bucket.currency}`)
      console.log(`  Haul Start: ${bucket.haulStartDate.toISOString().split('T')[0]}`)
      console.log(`  Exclude from Zakat: ${bucket.excludeFromZakat}`)
      console.log(`  Person ID: ${bucket.personId || 'Owner'}`)
      
      if (!bucket.excludeFromZakat) {
        const zakatDue = bucket.balance * 0.025
        console.log(`  Zakat Due: SAR ${zakatDue.toFixed(2)}`)
        totalZakat += zakatDue
        totalBalance += bucket.balance
      }
      
      console.log(`  Movements (${bucket.movements.length}):`)
      bucket.movements.forEach(movement => {
        console.log(`    ${movement.date.toISOString().split('T')[0]} | ${movement.type} | SAR ${movement.amount} | ${movement.notes || 'No notes'}`)
      })
      console.log('')
    })

    console.log('=== SUMMARY ===')
    console.log(`Total Balance (Zakat-eligible): SAR ${totalBalance}`)
    console.log(`Total Zakat Due: SAR ${totalZakat.toFixed(2)}`)

    // Get system cash balance for comparison
    const cashSetting = await prisma.systemSetting.findUnique({
      where: { key: 'CASH_BALANCE' }
    })
    
    console.log(`System Cash Balance Setting: SAR ${cashSetting?.value || '0'}`)

    // Get cash account transactions sum
    const cashAccount = await prisma.account.findFirst({
      where: { type: 'CASH' }
    })

    if (cashAccount) {
      const txSum = await prisma.transaction.aggregate({
        where: { accountId: cashAccount.id },
        _sum: { amount: true }
      })
      console.log(`Cash Account Transaction Sum: SAR ${txSum._sum.amount || 0}`)
    }

  } catch (error) {
    console.error('Error:', error)
  } finally {
    await prisma.$disconnect()
  }
}

main()
