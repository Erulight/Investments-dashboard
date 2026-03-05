const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const id = 'cmmdw3grd0002rzun41d92g70'
  const receivableAmount = 527.3775216138329
  const interestRate = 10.518731988472622
  const fees = 52.737752161383284

  const updated = await prisma.investment.update({
    where: { id },
    data: {
      receivableAmount,
      interestRate,
      fees,
    },
  })
  console.log('Updated investment:', { id: updated.id, receivableAmount: updated.receivableAmount, interestRate: updated.interestRate, fees: updated.fees })
}

main().catch((e) => { console.error(e); process.exitCode = 1 }).finally(() => prisma.$disconnect())
