const { PrismaClient } = require('../node_modules/@prisma/client')

const prisma = new PrismaClient()

async function main() {
  const tx = await prisma.transaction.findFirst({
    where: {
      type: 'SELL_TO_PARTNER',
      investment: {
        name: { contains: 'Malaa' },
      },
    },
    orderBy: { date: 'asc' },
    include: { investment: true },
  })

  console.log('Malaa SELL_TO_PARTNER metadata raw:', tx ? tx.metadata : null)
  if (tx && tx.metadata) {
    try {
      const parsed = JSON.parse(tx.metadata)
      console.log('Malaa SELL_TO_PARTNER metadata parsed:', JSON.stringify(parsed, null, 2))
    } catch (e) {
      console.error('Failed to parse metadata JSON:', e)
    }
  }

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
