import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { requireModuleAccess } from '@/lib/rbac'
import { createAuditLog } from '@/lib/audit'

type HoldingInput = {
  id?: string
  name?: string
  assetType: string
  currentValue: number
}

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

    const { sipId, holdings } = await request.json()

    if (!sipId || !Array.isArray(holdings)) {
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

    const normalized = (holdings as HoldingInput[]).map((h) => {
      const currentValue = typeof h.currentValue === 'number' ? h.currentValue : Number(h.currentValue)
      return {
        id: typeof h.id === 'string' && h.id.trim() ? h.id.trim() : crypto.randomUUID(),
        name: typeof h.name === 'string' ? h.name.trim() : '',
        assetType: typeof h.assetType === 'string' ? h.assetType.trim() : '',
        currentValue: Number.isFinite(currentValue) ? Math.max(0, currentValue) : 0,
      }
    })

    if (normalized.some((h) => !h.assetType)) {
      return NextResponse.json({ error: 'Each holding must have an assetType' }, { status: 400 })
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
          holdings: normalized,
          history: [
            ...prevHistory,
            {
              at: new Date().toISOString(),
              action: 'UPDATE_HOLDINGS',
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
      field: 'holdings',
      holdingsCount: normalized.length,
    })

    return NextResponse.json(updatedSip)
  } catch (error) {
    console.error('Error updating SIP holdings:', error)
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }
    return NextResponse.json({ error: 'Failed to update holdings' }, { status: 500 })
  }
}
