import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

export async function POST(_req: NextRequest) {
  try {
    await requireAuth(['OWNER'])

    const deleted = await prisma.transaction.deleteMany({
      where: {
        type: 'SELL_PROFIT_ACCRUED',
        description: 'Return to owner',
        amount: 2722.046109510086,
      },
    })

    // Set CASH_BALANCE to the requested corrected amount (12500)
    const setting = await prisma.systemSetting.upsert({
      where: { key: 'CASH_BALANCE' },
      update: { value: '12500' },
      create: {
        key: 'CASH_BALANCE',
        value: '12500',
        description: 'Available cash balance for investments',
      },
    })

    return NextResponse.json({
      success: true,
      deletedCount: deleted.count,
      cashBalance: setting.value,
    })
  } catch (error) {
    console.error('ADMIN FIX RETURN CASH ERROR:', error)
    return NextResponse.json({ error: 'Failed to apply admin fix' }, { status: 500 })
  }
}
