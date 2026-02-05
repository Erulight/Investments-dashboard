import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

const CASH_BALANCE_KEY = 'CASH_BALANCE'

export async function GET() {
  try {
    await requireAuth(['OWNER'])
    const setting = await prisma.systemSetting.findUnique({
      where: { key: CASH_BALANCE_KEY },
    })
    const value = setting ? Number(setting.value) : 0
    return NextResponse.json({ cashBalance: Number.isFinite(value) ? value : 0 })
  } catch (error) {
    console.error('Cash balance fetch error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load cash balance' },
      { status: 500 }
    )
  }
}

export async function PUT(req: NextRequest) {
  try {
    await requireAuth(['OWNER'])
    const body = await req.json()
    const cashBalance = Number(body.cashBalance)

    if (!Number.isFinite(cashBalance) || cashBalance < 0) {
      return NextResponse.json(
        { error: 'Cash balance must be a positive number' },
        { status: 400 }
      )
    }

    const updated = await prisma.systemSetting.upsert({
      where: { key: CASH_BALANCE_KEY },
      update: { value: cashBalance.toString() },
      create: {
        key: CASH_BALANCE_KEY,
        value: cashBalance.toString(),
        description: 'Available cash balance for investments',
      },
    })

    return NextResponse.json({ cashBalance: Number(updated.value) })
  } catch (error) {
    console.error('Cash balance update error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update cash balance' },
      { status: 500 }
    )
  }
}
