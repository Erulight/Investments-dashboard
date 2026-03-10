import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { requireModuleAccess } from '@/lib/rbac'
import { createAuditLog } from '@/lib/audit'

export async function POST(request: Request) {
  try {
    await requireModuleAccess('crypto')
    const user = await getCurrentUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (user.role !== 'OWNER') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const cryptoId = typeof body.cryptoId === 'string' ? body.cryptoId : ''
    const currentValue = Number(body.currentValue)
    const date = typeof body.date === 'string' ? body.date : ''

    if (!cryptoId || !Number.isFinite(currentValue) || currentValue < 0) {
      return NextResponse.json({ error: 'Invalid current value' }, { status: 400 })
    }

    const at = date && date.trim().length > 0 ? new Date(date) : new Date()
    if (Number.isNaN(at.getTime())) {
      return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
    }

    const selectedDay = new Date(at.getFullYear(), at.getMonth(), at.getDate())
    const now = new Date()
    const todayDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    if (selectedDay.getTime() > todayDay.getTime()) {
      return NextResponse.json({ error: 'Date cannot be in the future' }, { status: 400 })
    }

    const inv = await prisma.investment.findUnique({
      where: { id: cryptoId },
      include: { account: true },
    })

    if (!inv) {
      return NextResponse.json({ error: 'Crypto portfolio not found' }, { status: 404 })
    }

    const portfolioStartAt = new Date(inv.startDate)
    const portfolioStartDay = new Date(
      portfolioStartAt.getFullYear(),
      portfolioStartAt.getMonth(),
      portfolioStartAt.getDate(),
    )
    if (!Number.isNaN(portfolioStartDay.getTime()) && selectedDay.getTime() < portfolioStartDay.getTime()) {
      return NextResponse.json({ error: 'Date cannot be before portfolio start date' }, { status: 400 })
    }

    const metadata = (() => {
      try {
        return JSON.parse(inv.metadata || '{}')
      } catch {
        return {}
      }
    })()

    if (metadata.type !== 'CRYPTO_PORTFOLIO') {
      return NextResponse.json({ error: 'Invalid crypto portfolio' }, { status: 400 })
    }

    const prevHistory = Array.isArray(metadata.history) ? metadata.history : []

    const latestValueUpdateAt = prevHistory
      .filter((h: any) => typeof h?.action === 'string' && h.action === 'VALUE_UPDATE')
      .map((h: any) => new Date(h.at))
      .filter((d: Date) => !Number.isNaN(d.getTime()))
      .sort((a: Date, b: Date) => a.getTime() - b.getTime())
      .at(-1)

    const existingCurrentValue = Number(metadata.currentValue ?? inv.currentValue ?? 0)
    const shouldUpdateCurrent = !latestValueUpdateAt || at.getTime() >= latestValueUpdateAt.getTime()
    const nextCurrentValue = shouldUpdateCurrent ? currentValue : existingCurrentValue

    const updated = await prisma.investment.update({
      where: { id: cryptoId },
      data: {
        currentValue: nextCurrentValue,
        metadata: JSON.stringify({
          ...metadata,
          currentValue: nextCurrentValue,
          history: [
            ...prevHistory,
            {
              at: at.toISOString(),
              action: 'VALUE_UPDATE',
              currentValue,
            },
          ].slice(-200),
        }),
      },
      include: { account: true },
    })

    await createAuditLog(user.id, 'UPDATE', 'INVESTMENT', cryptoId, {
      type: 'CRYPTO_PORTFOLIO',
      field: 'currentValue',
      currentValue,
      at: at.toISOString(),
      currentValueApplied: nextCurrentValue,
      backdated: !shouldUpdateCurrent,
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error updating Crypto current value:', error)
    if (error instanceof Error && error.message === 'Module access denied') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }
    return NextResponse.json({ error: 'Failed to update current value' }, { status: 500 })
  }
}
