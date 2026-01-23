import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('Starting seed...')

  const ownerPassword = await bcrypt.hash('OwnerDemo123!', 10)
  const partnerPassword = await bcrypt.hash('PartnerDemo123!', 10)

  const ownerPerson = await prisma.person.create({
    data: {
      name: 'Demo Owner',
      email: 'owner@example.local',
    },
  })

  const partnerPerson = await prisma.person.create({
    data: {
      name: 'Demo Partner',
      email: 'partner@example.local',
    },
  })

  const owner = await prisma.user.create({
    data: {
      email: 'owner@example.local',
      password: ownerPassword,
      name: 'Demo Owner',
      role: 'OWNER',
      personId: ownerPerson.id,
    },
  })

  const partner = await prisma.user.create({
    data: {
      email: 'partner@example.local',
      password: partnerPassword,
      name: 'Demo Partner',
      role: 'PARTNER',
      personId: partnerPerson.id,
      canEditAsPartner: true,
    },
  })

  console.log('Created users:', { owner: owner.email, partner: partner.email })

  await prisma.recoveryAssumption.createMany({
    data: [
      { status: 'ACTIVE', recoveryRate: 1.0, description: 'Full recovery expected' },
      { status: 'LATE', recoveryRate: 0.9, description: '90% recovery expected' },
      { status: 'DEFAULT_LEGAL', recoveryRate: 0.5, description: '50% recovery via legal' },
      { status: 'WRITTEN_OFF', recoveryRate: 0.0, description: 'No recovery expected' },
    ],
  })

  console.log('Created recovery assumptions')

  const sukukAccount = await prisma.account.create({
    data: {
      name: 'Sukuk Investments',
      type: 'SUKUK',
      description: 'Crowdfunding and sukuk deals',
      currency: 'SAR',
    },
  })

  const circlyAccount = await prisma.account.create({
    data: {
      name: 'Circlys Savings',
      type: 'CIRCLYS',
      description: 'Circlys savings plans',
      currency: 'SAR',
    },
  })

  const malaaAccount = await prisma.account.create({
    data: {
      name: 'Malaa Portfolio',
      type: 'MALAA',
      description: 'Managed portfolio with NAV tracking',
      currency: 'SAR',
    },
  })

  const cryptoAccount = await prisma.account.create({
    data: {
      name: 'Crypto Trading',
      type: 'CRYPTO',
      description: 'Cryptocurrency trading journal',
      currency: 'USD',
    },
  })

  const businessAccount = await prisma.account.create({
    data: {
      name: 'Business Deals',
      type: 'BUSINESS',
      description: 'Private business investments',
      currency: 'SAR',
    },
  })

  console.log('Created accounts')

  const sukukDeal1 = await prisma.investment.create({
    data: {
      accountId: sukukAccount.id,
      name: 'Tech Startup Sukuk A',
      category: 'crowdfunding',
      principalAmount: 100000,
      currentValue: 105000,
      realizedProfit: 0,
      unrealizedProfit: 5000,
      startDate: new Date('2024-01-15'),
      maturityDate: new Date('2025-01-15'),
      interestRate: 8.5,
      notes: 'Series A funding round',
    },
  })

  await prisma.dealParticipant.createMany({
    data: [
      {
        investmentId: sukukDeal1.id,
        personId: ownerPerson.id,
        investedAmount: 60000,
        currentValue: 63000,
        profit: 3000,
        sharePercentage: 60,
      },
      {
        investmentId: sukukDeal1.id,
        personId: partnerPerson.id,
        investedAmount: 40000,
        currentValue: 42000,
        profit: 2000,
        sharePercentage: 40,
      },
    ],
  })

  const sukukDeal2 = await prisma.investment.create({
    data: {
      accountId: sukukAccount.id,
      name: 'Real Estate Sukuk B',
      category: 'crowdfunding',
      principalAmount: 200000,
      currentValue: 215000,
      realizedProfit: 10000,
      unrealizedProfit: 5000,
      startDate: new Date('2023-06-01'),
      maturityDate: new Date('2025-06-01'),
      interestRate: 10.0,
      notes: 'Commercial property development',
    },
  })

  await prisma.dealParticipant.create({
    data: {
      investmentId: sukukDeal2.id,
      personId: ownerPerson.id,
      investedAmount: 200000,
      currentValue: 215000,
      profit: 15000,
      sharePercentage: 100,
    },
  })

  await prisma.investment.create({
    data: {
      accountId: circlyAccount.id,
      name: 'Circlys Plan 2024',
      principalAmount: 50000,
      currentValue: 52500,
      unrealizedProfit: 2500,
      startDate: new Date('2024-01-01'),
      interestRate: 5.0,
      notes: 'Monthly savings plan',
    },
  })

  const malaaInvestment = await prisma.investment.create({
    data: {
      accountId: malaaAccount.id,
      name: 'Malaa Managed Portfolio',
      principalAmount: 150000,
      currentValue: 162000,
      unrealizedProfit: 12000,
      startDate: new Date('2023-03-15'),
      notes: 'Diversified managed portfolio',
    },
  })

  await prisma.valuation.createMany({
    data: [
      {
        accountId: malaaAccount.id,
        date: new Date('2024-01-01'),
        navPerUnit: 1.05,
        totalValue: 157500,
      },
      {
        accountId: malaaAccount.id,
        date: new Date('2024-02-01'),
        navPerUnit: 1.08,
        totalValue: 162000,
      },
    ],
  })

  const cryptoInvestment = await prisma.investment.create({
    data: {
      accountId: cryptoAccount.id,
      name: 'Crypto Trading Portfolio',
      principalAmount: 10000,
      currentValue: 11500,
      realizedProfit: 1200,
      unrealizedProfit: 300,
      startDate: new Date('2024-01-01'),
      notes: 'BTC, ETH, SOL trading',
    },
  })

  await prisma.transaction.createMany({
    data: [
      {
        accountId: cryptoAccount.id,
        investmentId: cryptoInvestment.id,
        type: 'TRADE_BUY',
        amount: 5000,
        date: new Date('2024-01-15'),
        description: 'Bought 0.15 BTC at $33,333',
        metadata: JSON.stringify({ asset: 'BTC', quantity: 0.15, price: 33333 }),
      },
      {
        accountId: cryptoAccount.id,
        investmentId: cryptoInvestment.id,
        type: 'TRADE_SELL',
        amount: 6000,
        date: new Date('2024-02-01'),
        description: 'Sold 0.15 BTC at $40,000',
        metadata: JSON.stringify({ asset: 'BTC', quantity: 0.15, price: 40000 }),
      },
    ],
  })

  const businessDeal = await prisma.investment.create({
    data: {
      accountId: businessAccount.id,
      name: 'Local Restaurant Investment',
      category: 'business',
      principalAmount: 80000,
      currentValue: 88000,
      unrealizedProfit: 8000,
      startDate: new Date('2023-09-01'),
      interestRate: 12.0,
      notes: 'Equity investment in restaurant chain',
    },
  })

  await prisma.dealParticipant.create({
    data: {
      investmentId: businessDeal.id,
      personId: ownerPerson.id,
      investedAmount: 80000,
      currentValue: 88000,
      profit: 8000,
      sharePercentage: 100,
    },
  })

  await prisma.goal.createMany({
    data: [
      {
        name: 'Retirement Fund',
        targetAmount: 1000000,
        currentAmount: 0,
        targetDate: new Date('2040-12-31'),
        category: 'retirement',
      },
      {
        name: 'House Down Payment',
        targetAmount: 200000,
        currentAmount: 0,
        targetDate: new Date('2026-12-31'),
        category: 'property',
      },
    ],
  })

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
