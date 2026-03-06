const { PrismaClient } = require('@prisma/client')

async function fixRidwanKIA() {
  const prisma = new PrismaClient()
  
  try {
    console.log('=== FIXING RIDWAN KIA INVESTMENT ===\n')

    // Find the investment
    const investment = await prisma.investment.findFirst({
      where: { name: { contains: 'Ridwan KIA' } },
      include: { dealParticipants: true }
    })

    if (!investment) {
      console.log('❌ Investment "Ridwan KIA" not found')
      return
    }

    console.log(`📊 Found investment: ${investment.name}`)
    console.log(`   Current receivableAmount: ${investment.receivableAmount}`)
    console.log(`   Current fees: ${investment.fees}`)

    // Update investment
    const updatedInvestment = await prisma.investment.update({
      where: { id: investment.id },
      data: {
        receivableAmount: 2500.00,
        fees: 250.00,
      }
    })

    console.log(`\n✅ Updated investment:`)
    console.log(`   New receivableAmount: ${updatedInvestment.receivableAmount}`)
    console.log(`   New fees: ${updatedInvestment.fees}`)

    // Update deal participants
    const updatedParticipants = await prisma.dealParticipant.updateMany({
      where: { investmentId: investment.id },
      data: {
        profit: 2500.00,
        receivable: 2500.00,
      }
    })

    console.log(`\n✅ Updated ${updatedParticipants.count} deal participant(s)`)
    console.log(`   New profit: 2500.00`)
    console.log(`   New receivable: 2500.00`)

    console.log('\n✅ RIDWAN KIA INVESTMENT FIXED')

  } catch (error) {
    console.error('❌ Error:', error.message)
  } finally {
    await prisma.$disconnect()
  }
}

fixRidwanKIA()
