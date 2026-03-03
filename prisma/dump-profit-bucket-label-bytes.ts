import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const buckets = await prisma.cashBucket.findMany({
    where: {
      OR: [{ label: { contains: 'Profit' } }, { label: { contains: 'Ridwan' } }],
    },
    include: {
      movements: {
        select: { type: true, amount: true, date: true },
      },
    },
  })

  for (const b of buckets) {
    console.log('---')
    console.log('id:', b.id)
    console.log('label bytes:', Buffer.from(b.label ?? '').toString('hex'))
    console.log('label text:', b.label)
    console.log('personId:', b.personId)
    console.log('balance:', b.balance)
    console.log('movements:', b.movements)
  }
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect()
  })
