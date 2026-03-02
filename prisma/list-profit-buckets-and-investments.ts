import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const buckets = await prisma.cashBucket.findMany({
    where: { label: { startsWith: 'Profit •' } },
    select: { id: true, label: true, haulStartDate: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })
  console.log('PROFIT BUCKETS:', JSON.stringify(buckets, null, 2))

  const investments = await prisma.investment.findMany({
    where: { name: { contains: 'Ridwan' } },
    select: { id: true, name: true, startDate: true },
    orderBy: { startDate: 'asc' },
  })
  console.log('INVESTMENTS:', JSON.stringify(investments, null, 2))
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
