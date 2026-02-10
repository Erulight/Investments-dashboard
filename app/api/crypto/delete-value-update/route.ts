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
    const at = typeof body.at === 'string' ? body.at : ''

    if (!cryptoId || !at) {
      return NextResponse.json({ error: 'cryptoId and at are required' }, { status: 400 })
    }

    const inv = await prisma.investment.findUnique({
      where: { id: cryptoId },
      include: { account: true },
    })

    if (!inv) {
      return NextResponse.json({ error: 'Crypto portfolio not found' }, { status: 404 })
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

    const nextHistory = prevHistory.filter(
      (h: any) => !(typeof h?.action === 'string' && h.action === 'VALUE_UPDATE' && String(h.at) === at)
    )

    if (nextHistory.length === prevHistory.length) {
      return NextResponse.json({ error: 'Value update not found' }, { status: 404 })
    }

    const latestValueUpdate = nextHistory
      .filter((h: any) => typeof h?.action === 'string' && h.action === 'VALUE_UPDATE')
      .map((h: any) => ({ at: new Date(h.at), currentValue: Number(h.currentValue) }))
      .filter((x: any) => !Number.isNaN(x.at.getTime()) && Number.isFinite(x.currentValue))
      .sort((a: any, b: any) => a.at.getTime() - b.at.getTime())
      .at(-1)

    const nextCurrentValue = latestValueUpdate ? latestValueUpdate.currentValue : 0

    const updated = await prisma.investment.update({
      where: { id: cryptoId },
      data: {
        currentValue: nextCurrentValue,
        metadata: JSON.stringify({
          ...metadata,
          currentValue: nextCurrentValue,
          history: nextHistory.slice(-200),
        }),
      },
      include: { account: true },
    })

    await createAuditLog(user.id, 'DELETE', 'INVESTMENT', cryptoId, {
      type: 'CRYPTO_PORTFOLIO',
      field: 'VALUE_UPDATE',
      at,
      currentValueApplied: nextCurrentValue,
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error deleting Crypto value update:', error)
    if (error instanceof Error && error.message === 'Module access denied') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }
    return NextResponse.json({ error: 'Failed to delete value update' }, { status: 500 })
  }
}
