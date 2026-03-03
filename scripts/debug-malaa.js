const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function main() {
  const bucket = await prisma.cashBucket.findFirst({
    where: { label: 'Malaa' },
    include: {
      movements: {
        orderBy: { date: 'asc' },
        select: {
          type: true,
          amount: true,
          date: true,
          notes: true,
        },
      },
    },
  })

  console.log(JSON.stringify(bucket, null, 2))
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    try {
      await prisma.$disconnect()
    } catch (e) {
      // ignore
    }
  })
