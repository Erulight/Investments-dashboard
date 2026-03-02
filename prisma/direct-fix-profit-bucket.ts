import { prisma } from '../lib/db'

async function main() {
  // First fetch the investment start date
  const investment = await prisma.investment.findUnique({
    where: { id: "cmm9pd1pk00188sm2kf1lmodx" },
    select: { id: true, name: true, startDate: true }
  })
  console.log("Investment startDate:", investment?.startDate)

  if (!investment) {
    console.log("Investment not found")
    return
  }

  // Then update the profit bucket
  await prisma.cashBucket.update({
    where: { id: "cmm9pdart001j8sm2grjt1zfx" },
    data: { haulStartDate: investment.startDate }
  })

  // Also delete the orphan bucket
  await prisma.cashBucket.delete({
    where: { id: "cmm9p3wmw000m8sm2j1fwsfvo" }
  })

  console.log("Done")
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
