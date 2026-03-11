import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'
import { DISPLAY_CURRENCY_KEY, normalizeDisplayCurrency } from '@/lib/currency'

export async function GET() {
  try {
    await requireAuth(['OWNER'])

    const setting = await prisma.systemSetting.findUnique({
      where: { key: DISPLAY_CURRENCY_KEY },
    })

    const currency = normalizeDisplayCurrency(setting?.value)
    return NextResponse.json({ currency })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load display currency' },
      { status: 500 },
    )
  }
}

export async function PUT(req: NextRequest) {
  try {
    await requireAuth(['OWNER'])

    const body = await req.json().catch(() => ({}))
    const currency = normalizeDisplayCurrency(body.currency)

    await prisma.systemSetting.upsert({
      where: { key: DISPLAY_CURRENCY_KEY },
      update: { value: currency },
      create: {
        key: DISPLAY_CURRENCY_KEY,
        value: currency,
        description: 'Global UI display currency (SAR or USD)',
      },
    })

    return NextResponse.json({ currency })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update display currency' },
      { status: 500 },
    )
  }
}
