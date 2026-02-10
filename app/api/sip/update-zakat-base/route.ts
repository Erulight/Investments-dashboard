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

    const { sipId, zakatBaseByAssetType } = await request.json()

    if (!sipId || typeof zakatBaseByAssetType !== 'object' || zakatBaseByAssetType === null) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
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

    const normalized: Record<string, number> = {}
    for (const [key, value] of Object.entries(zakatBaseByAssetType as Record<string, unknown>)) {
      const n = typeof value === 'number' ? value : Number(value)
      normalized[key] = Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0
    }

    const prevHistory = Array.isArray(metadata.history) ? metadata.history : []
    const investedAmount = metadata.investedAmount || sip.principalAmount || 0
    const totalAmount = metadata.totalAmount || 0
    const currentValue = metadata.currentValue ?? sip.currentValue ?? 0

    const updatedSip = await prisma.investment.update({
      where: { id: sipId },
      data: {
        metadata: JSON.stringify({
          ...metadata,
          zakatBaseByAssetType: {
            ...(metadata.zakatBaseByAssetType || {}),
            ...normalized,
          },
          history: [
            ...prevHistory,
            {
              at: new Date().toISOString(),
              action: 'UPDATE_ZAKAT_BASE',
              investedAmount,
              totalAmount,
              currentValue,
            },
          ].slice(-200),
        }),
      },
      include: { account: true },
    })

    await createAuditLog(user.id, 'UPDATE', 'INVESTMENT', sipId, {
      type: 'SIP',
      field: 'zakatBaseByAssetType',
      zakatBaseByAssetType: normalized,
    })

    return NextResponse.json(updatedSip)
  } catch (error) {
    console.error('Error updating SIP zakat base:', error)
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }
    return NextResponse.json({ error: 'Failed to update zakat base' }, { status: 500 })
  }
}
