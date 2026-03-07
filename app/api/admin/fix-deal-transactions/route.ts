import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

export const dynamic = 'force-dynamic'

// POST to fix the corrupted deal by adding missing transactions
export async function POST() {
  try {
    await requireAuth(['OWNER'])

    const result = await prisma.$transaction(async (tx) => {
      // Find the deal
      const deal = await tx.investment.findFirst({
        where: { name: 'مشروع البندرية ٣' },
        select: {
          id: true,
          name: true,
          principalAmount: true,
          receivableAmount: true,
          totalReceived: true,
          startDate: true,
        },
      })

      if (!deal) {
        throw new Error('Deal not found')
      }

      // Find cash account
      const cashAccount = await tx.account.findFirst({
        where: { type: 'CASH', isActive: true },
      })

      if (!cashAccount) {
        throw new Error('Cash account not found')
      }

      // Check if CASH_INVEST already exists
      const existingInvest = await tx.transaction.findFirst({
        where: {
          investmentId: deal.id,
          type: 'CASH_INVEST',
        },
      })

      let investCreated = false
      if (!existingInvest) {
        // Add missing CASH_INVEST transaction (when deal was created)
        await tx.transaction.create({
          data: {
            accountId: cashAccount.id,
            investmentId: deal.id,
            personId: null,
            type: 'CASH_INVEST',
            amount: -5000,
            date: deal.startDate || new Date('2025-01-01'),
            description: `Cash used to create ${deal.name}`,
          },
        })
        investCreated = true
      }

      // Check if WITHDRAW transactions exist
      const existingWithdraws = await tx.transaction.findMany({
        where: {
          investmentId: deal.id,
          type: { in: ['WITHDRAW_PRINCIPAL', 'WITHDRAW_PROFIT'] },
        },
      })

      let withdrawsCreated = false
      if (existingWithdraws.length === 0) {
        // Add missing WITHDRAW_PRINCIPAL transaction
        await tx.transaction.create({
          data: {
            accountId: cashAccount.id,
            investmentId: deal.id,
            personId: null,
            type: 'WITHDRAW_PRINCIPAL',
            amount: 5000,
            date: new Date(),
            description: 'Principal withdrawal',
          },
        })

        // Add missing WITHDRAW_PROFIT transaction
        await tx.transaction.create({
          data: {
            accountId: cashAccount.id,
            investmentId: deal.id,
            personId: null,
            type: 'WITHDRAW_PROFIT',
            amount: 600,
            date: new Date(),
            description: 'Profit withdrawal',
          },
        })

        withdrawsCreated = true
      }

      // Fix investment state
      await tx.investment.update({
        where: { id: deal.id },
        data: {
          principalAmount: 5000, // Restore original principal
          receivableAmount: 600,
          totalReceived: 600,
        },
      })

      // Update CASH_BALANCE system setting
      const currentBalance = await tx.transaction.aggregate({
        where: {
          accountId: cashAccount.id,
          personId: null,
        },
        _sum: { amount: true },
      })

      const correctBalance = currentBalance._sum.amount || 0

      await tx.systemSetting.upsert({
        where: { key: 'CASH_BALANCE' },
        update: { value: correctBalance.toString() },
        create: {
          key: 'CASH_BALANCE',
          value: correctBalance.toString(),
          description: 'Available cash balance for investments',
        },
      })

      return {
        dealId: deal.id,
        dealName: deal.name,
        investCreated,
        withdrawsCreated,
        newBalance: correctBalance,
      }
    })

    return NextResponse.json({
      success: true,
      message: 'Deal transactions fixed successfully',
      details: result,
    })
  } catch (error) {
    console.error('Fix deal transactions error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fix transactions' },
      { status: 500 }
    )
  }
}

// GET to inspect current state
export async function GET() {
  try {
    await requireAuth(['OWNER'])

    const deal = await prisma.investment.findFirst({
      where: { name: 'مشروع البندرية ٣' },
      select: {
        id: true,
        name: true,
        principalAmount: true,
        receivableAmount: true,
        totalReceived: true,
        startDate: true,
      },
    })

    if (!deal) {
      return NextResponse.json({ error: 'Deal not found' }, { status: 404 })
    }

    const cashAccount = await prisma.account.findFirst({
      where: { type: 'CASH', isActive: true },
    })

    const transactions = cashAccount
      ? await prisma.transaction.findMany({
          where: {
            accountId: cashAccount.id,
            OR: [
              { investmentId: deal.id },
              { investmentId: null, personId: null },
            ],
          },
          orderBy: { date: 'asc' },
          select: {
            id: true,
            type: true,
            amount: true,
            date: true,
            description: true,
            investmentId: true,
          },
        })
      : []

    const currentBalance = await prisma.systemSetting.findUnique({
      where: { key: 'CASH_BALANCE' },
    })

    return NextResponse.json({
      deal,
      transactions,
      currentBalance: currentBalance ? Number(currentBalance.value) : 0,
    })
  } catch (error) {
    console.error('Inspect deal error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
