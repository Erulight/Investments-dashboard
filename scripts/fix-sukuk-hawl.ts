import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Set savingsHaulStartDate in Sukuk2024 metadata
  await prisma.investment.updateMany({
    where: { name: { contains: 'Sukuk2024' } },
    data: { metadata: JSON.stringify({ savingsHaulStartDate: '2024-01-01' }) }
  })

  // Update existing profit bucket haulStartDate
  await prisma.cashBucket.updateMany({
    where: { label: { contains: 'Sukuk2024' } },
    data: { haulStartDate: new Date('2024-01-01') }
  })

  console.log('✓ Fixed Sukuk2024 hawl start dates')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
