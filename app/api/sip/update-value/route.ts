import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { requireModuleAccess } from '@/lib/rbac'
import { createAuditLog } from '@/lib/audit'

export async function POST(request: Request) {
  try {
    await requireModuleAccess('savings')
    const user = await getCurrentUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (user.role !== 'OWNER') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const { sipId, currentValue, date } = await request.json()

    if (!sipId || typeof currentValue !== 'number' || !Number.isFinite(currentValue) || currentValue < 0) {
      return NextResponse.json({ error: 'Invalid current value' }, { status: 400 })
    }

    const at = typeof date === 'string' && date.trim().length > 0
      ? new Date(date)
      : new Date()

    if (Number.isNaN(at.getTime())) {
      return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
    }

    const sip = await prisma.investment.findUnique({
      where: { id: sipId },
      include: { account: true },
    })

    if (!sip) {
      return NextResponse.json({ error: 'SIP portfolio not found' }, { status: 404 })
    }

    const metadata = (() => {
      try {
        return JSON.parse(sip.metadata || '{}')
      } catch {
        return {}
      }
    })()

    if (metadata.type !== 'SIP') {
      return NextResponse.json({ error: 'Invalid SIP portfolio' }, { status: 400 })
    }

    const prevHistory = Array.isArray(metadata.history) ? metadata.history : []
    const investedAmount = metadata.investedAmount || sip.principalAmount || 0

    const latestValueUpdateAt = prevHistory
      .filter((h: any) => typeof h?.action === 'string' && h.action === 'VALUE_UPDATE')
      .map((h: any) => new Date(h.at))
      .filter((d: Date) => !Number.isNaN(d.getTime()))
      .sort((a: Date, b: Date) => a.getTime() - b.getTime())
      .at(-1)

    const existingCurrentValue = Number(metadata.currentValue ?? sip.currentValue ?? 0)
    const shouldUpdateCurrent = !latestValueUpdateAt || at.getTime() >= latestValueUpdateAt.getTime()
    const nextCurrentValue = shouldUpdateCurrent ? currentValue : existingCurrentValue

    const updatedSip = await prisma.investment.update({
      where: { id: sipId },
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
              investedAmount,
              currentValue,
            },
          ].slice(-200),
        }),
      },
      include: { account: true },
    })

    await createAuditLog(user.id, 'UPDATE', 'INVESTMENT', sipId, {
      type: 'SIP',
      field: 'currentValue',
      currentValue,
      at: at.toISOString(),
      currentValueApplied: nextCurrentValue,
      backdated: !shouldUpdateCurrent,
    })

    return NextResponse.json(updatedSip)
  } catch (error) {
    console.error('Error updating SIP current value:', error)
    if (error instanceof Error && error.message === 'Module access denied') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }
    return NextResponse.json({ error: 'Failed to update SIP current value' }, { status: 500 })
  }
}
