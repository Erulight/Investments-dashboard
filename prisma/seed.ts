import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.log('Skipping seed in production')
    process.exit(0)
  }

  console.log('Starting seed...')
  console.warn('⚠️  WARNING: This seed script creates demo accounts with hardcoded passwords.')
  console.warn('⚠️  These should NEVER be used in production. Change passwords immediately after deployment.')

  const demoInvestmentNames = [
    'Tech Startup Sukuk A',
    'Real Estate Sukuk B',
    'Circlys Plan 2024',
    'Malaa Managed Portfolio',
    'Crypto Trading Portfolio',
    'Local Restaurant Investment',
  ]
  const demoGoalNames = ['Retirement Fund', 'House Down Payment']

  const demoInvestments = await prisma.investment.findMany({
    where: { name: { in: demoInvestmentNames } },
    select: { id: true },
  })
  const demoInvestmentIds = demoInvestments.map((inv) => inv.id)

  if (demoInvestmentIds.length > 0) {
    await prisma.transaction.deleteMany({
      where: { investmentId: { in: demoInvestmentIds } },
    })
    await prisma.dealParticipant.deleteMany({
      where: { investmentId: { in: demoInvestmentIds } },
    })
    await prisma.investment.deleteMany({
      where: { id: { in: demoInvestmentIds } },
    })
  }

  await prisma.valuation.deleteMany({
    where: {
      account: { name: 'Malaa Portfolio' },
    },
  })

  await prisma.goal.deleteMany({
    where: { name: { in: demoGoalNames } },
  })

  const ownerPassword = await bcrypt.hash('OwnerDemo123!', 10)
  const partnerPassword = await bcrypt.hash('PartnerDemo123!', 10)

  const getOrCreatePerson = async (email: string, name: string) => {
    const existing = await prisma.person.findFirst({ where: { email } })
    if (existing) return existing
    return prisma.person.create({
      data: {
        name,
        email,
      },
    })
  }

  const ownerPerson = await getOrCreatePerson('owner@example.local', 'Demo Owner')
  const partnerPerson = await getOrCreatePerson('partner@example.local', 'Demo Partner')

  // Check if user with this email or personId already exists to avoid unique constraint errors
  const existingOwner = await prisma.user.findFirst({
    where: {
      OR: [
        { email: 'owner@example.local' },
        { personId: ownerPerson.id }
      ]
    }
  })

  const owner = existingOwner || await prisma.user.create({
    data: {
      email: 'owner@example.local',
      password: ownerPassword,
      name: 'Demo Owner',
      role: 'OWNER',
      personId: ownerPerson.id,
    },
  })

  const existingPartner = await prisma.user.findFirst({
    where: {
      OR: [
        { email: 'partner@example.local' },
        { personId: partnerPerson.id }
      ]
    }
  })

  const partner = existingPartner || await prisma.user.create({
    data: {
      email: 'partner@example.local',
      password: partnerPassword,
      name: 'Demo Partner',
      role: 'PARTNER',
      personId: partnerPerson.id,
      canEditAsPartner: true,
    },
  })

  console.log('Ensured users:', { owner: owner.email, partner: partner.email })

  // Create recovery assumptions one by one for SQLite compatibility
  const recoveryData = [
    { status: 'ACTIVE', recoveryRate: 1.0, description: 'Full recovery expected' },
    { status: 'LATE', recoveryRate: 0.9, description: '90% recovery expected' },
    { status: 'DEFAULT_LEGAL', recoveryRate: 0.5, description: '50% recovery via legal' },
    { status: 'WRITTEN_OFF', recoveryRate: 0.0, description: 'No recovery expected' },
  ]
  
  for (const data of recoveryData) {
    await prisma.recoveryAssumption.upsert({
      where: { status: data.status },
      update: {},
      create: data,
    })
  }

  console.log('Created recovery assumptions')

  const getOrCreateAccount = async (data: {
    name: string
    type: string
    description: string
    currency: string
  }) => {
    const existing = await prisma.account.findFirst({
      where: { name: data.name, type: data.type },
    })
    if (existing) return existing
    return prisma.account.create({ data })
  }

  const sukukAccount = await getOrCreateAccount({
    name: 'Sukuk Investments',
    type: 'SUKUK',
    description: 'Crowdfunding and sukuk deals',
    currency: 'SAR',
  })

  const circlyAccount = await getOrCreateAccount({
    name: 'Circlys Savings',
    type: 'CIRCLYS',
    description: 'Circlys savings plans',
    currency: 'SAR',
  })

  const malaaAccount = await getOrCreateAccount({
    name: 'Malaa Portfolio',
    type: 'MALAA',
    description: 'Managed portfolio with NAV tracking',
    currency: 'SAR',
  })

  const cryptoAccount = await getOrCreateAccount({
    name: 'Crypto Trading',
    type: 'CRYPTO',
    description: 'Cryptocurrency trading journal',
    currency: 'USD',
  })

  const businessAccount = await getOrCreateAccount({
    name: 'Business Deals',
    type: 'BUSINESS',
    description: 'Private business investments',
    currency: 'SAR',
  })

  console.log('Created accounts')

  console.log('Seed completed successfully!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
