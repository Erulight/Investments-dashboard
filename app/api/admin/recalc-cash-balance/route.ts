import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

export const dynamic = 'force-dynamic'

// GET -> show current CASH_BALANCE vs ledger sum
// POST -> recalc and update CASH_BALANCE to precise ledger sum
export async function GET() {
  try {
    await requireAuth(['OWNER'])

    // Sum all transactions on active CASH accounts (owner scope only)
    const txAgg = await prisma.transaction.aggregate({
      where: {
        account: { type: 'CASH', isActive: true },
        personId: null, // owner scope
      },
      _sum: { amount: true },
    })

    const ledgerSum = Number(txAgg._sum.amount || 0)

    const setting = await prisma.systemSetting.findUnique({
      where: { key: 'CASH_BALANCE' },
    })

    const dbValue = setting ? Number(setting.value) : null

    return NextResponse.json({ ledgerSum, dbValue })
  } catch (error) {
    console.error('recalc-cash-balance GET error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function POST() {
  try {
    await requireAuth(['OWNER'])

    const txAgg = await prisma.transaction.aggregate({
      where: {
        account: { type: 'CASH', isActive: true },
        personId: null,
      },
      _sum: { amount: true },
    })

    const ledgerSum = Number(txAgg._sum.amount || 0)

    await prisma.systemSetting.upsert({
      where: { key: 'CASH_BALANCE' },
      update: { value: ledgerSum.toString() },
      create: {
        key: 'CASH_BALANCE',
        value: ledgerSum.toString(),
        description: 'Available cash balance for investments',
      },
    })

    return NextResponse.json({ success: true, newValue: ledgerSum })
  } catch (error) {
    console.error('recalc-cash-balance POST error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
