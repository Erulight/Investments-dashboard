import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    await requireAuth(['OWNER'])

    // Find the active deal (assuming it's the "Malaa" one we saw)
    const activeDeal = await prisma.investment.findFirst({
      where: { name: { contains: 'Malaa' } },
      select: { id: true, name: true, principalAmount: true }
    })

    if (!activeDeal) {
      return NextResponse.json({ error: 'No active deal found' }, { status: 404 })
    }

    // Get or create cash account
    const cashAccount = await prisma.account.findFirst({
      where: { type: 'CASH', isActive: true }
    }) ?? await prisma.account.create({
      data: {
        name: 'Cash Balance',
        type: 'CASH',
        currency: 'SAR',
        description: 'Cash ledger account'
      }
    })

    // Check if CASH_INVEST already exists for this deal
    const existingInvest = await prisma.transaction.findFirst({
      where: {
        investmentId: activeDeal.id,
        type: 'CASH_INVEST'
      }
    })

    let investTxCreated = false
    if (!existingInvest && activeDeal.principalAmount > 0) {
      // Add missing CASH_INVEST for the active deal
      await prisma.transaction.create({
        data: {
          accountId: cashAccount.id,
          investmentId: activeDeal.id,
          personId: null,
          type: 'CASH_INVEST',
          amount: -Math.abs(activeDeal.principalAmount),
          date: new Date('2024-01-01'), // deal start date
          description: `Cash used to create ${activeDeal.name}`,
        }
      })
      investTxCreated = true
    }

    // Recalculate CASH_BALANCE from transaction sum
    const txSum = await prisma.transaction.aggregate({
      where: { 
        account: { type: 'CASH', isActive: true },
        personId: null // owner scope only
      },
      _sum: { amount: true }
    })

    const correctBalance = Number(txSum._sum.amount || 0)

    await prisma.systemSetting.upsert({
      where: { key: 'CASH_BALANCE' },
      update: { value: correctBalance.toString() },
      create: {
        key: 'CASH_BALANCE',
        value: correctBalance.toString(),
        description: 'Available cash balance for investments'
      }
    })

    return NextResponse.json({
      success: true,
      dealFound: activeDeal.name,
      investTxCreated,
      newCashBalance: correctBalance
    })

  } catch (error) {
    console.error('fix-existing-cash-data error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
