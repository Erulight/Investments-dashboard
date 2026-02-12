import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

const NISAB_KEY = 'NISAB_VALUE'
const DEFAULT_NISAB = 55000

export async function GET() {
  try {
    await requireAuth(['OWNER'])
    const setting = await prisma.systemSetting.findUnique({
      where: { key: NISAB_KEY },
    })
    const valueRaw = setting ? Number(setting.value) : DEFAULT_NISAB
    const value = Number.isFinite(valueRaw) ? valueRaw : DEFAULT_NISAB
    return NextResponse.json({ nisabValue: value })
  } catch (error) {
    console.error('Nisab fetch error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load nisab value' },
      { status: 500 }
    )
  }
}

export async function PUT(req: NextRequest) {
  try {
    await requireAuth(['OWNER'])
    const body = await req.json().catch(() => ({}))
    const nisabValue = Number(body.nisabValue)

    if (!Number.isFinite(nisabValue) || nisabValue <= 0) {
      return NextResponse.json(
        { error: 'Nisab value must be greater than 0' },
        { status: 400 }
      )
    }

    const updated = await prisma.systemSetting.upsert({
      where: { key: NISAB_KEY },
      update: { value: nisabValue.toString() },
      create: {
        key: NISAB_KEY,
        value: nisabValue.toString(),
        description: 'Nisab threshold for enabling Zakat calculations',
      },
    })

    return NextResponse.json({ nisabValue: Number(updated.value) })
  } catch (error) {
    console.error('Nisab update error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update nisab value' },
      { status: 500 }
    )
  }
}
