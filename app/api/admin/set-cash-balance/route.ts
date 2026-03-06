import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

export async function POST(req: NextRequest) {
  try {
    await requireAuth(['OWNER'])
    const body = await req.json().catch(() => ({})) as any
    const raw = body?.value
    const value = Number(raw)
    if (!Number.isFinite(value)) {
      return NextResponse.json({ error: 'Invalid value' }, { status: 400 })
    }

    const setting = await prisma.systemSetting.upsert({
      where: { key: 'CASH_BALANCE' },
      update: { value: value.toString() },
      create: {
        key: 'CASH_BALANCE',
        value: value.toString(),
        description: 'Available cash balance for investments',
      },
    })

    return NextResponse.json({ success: true, value: setting.value })
  } catch (error) {
    console.error('ADMIN SET CASH BALANCE ERROR:', error)
    return NextResponse.json({ error: 'Failed to set cash balance' }, { status: 500 })
  }
}
