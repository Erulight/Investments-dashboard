import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { requireModuleAccess } from '@/lib/rbac'
import { createAuditLog } from '@/lib/audit'
import { updateSipSchema, UpdateSipInput } from '@/lib/validation'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireModuleAccess('savings')
    const user = await getCurrentUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (user.role !== 'OWNER') {
      return NextResponse.json({ error: 'Only owners can edit SIP plans' }, { status: 403 })
    }

    const { id } = await params
    const body = await req.json()
    const validated = updateSipSchema.parse(body) as UpdateSipInput

    const existing = await prisma.investment.findUnique({
      where: { id },
      include: { account: true },
    })

    if (!existing) {
      return NextResponse.json({ error: 'SIP plan not found' }, { status: 404 })
    }

    const meta = (() => {
      try {
        return JSON.parse(existing.metadata || '{}')
      } catch {
        return {}
      }
    })()

    if (meta.type !== 'SIP' && existing.category !== 'SIP') {
      return NextResponse.json({ error: 'SIP plan not found' }, { status: 404 })
    }

    if (validated.accountId) {
      const account = await prisma.account.findUnique({ where: { id: validated.accountId } })
      if (!account) {
        return NextResponse.json({ error: 'Invalid account selected' }, { status: 400 })
      }
    }

    const prevHistory = Array.isArray(meta.history) ? meta.history : []
    const nextTotalAmount = validated.totalAmount ?? meta.totalAmount ?? 0
    const investedAmount = meta.investedAmount ?? existing.principalAmount ?? 0
    const currentValue = meta.currentValue ?? existing.currentValue ?? 0

    const updated = await prisma.investment.update({
      where: { id },
      data: {
        ...(validated.accountId ? { accountId: validated.accountId } : {}),
        ...(validated.name ? { name: validated.name } : {}),
        ...(validated.startDate ? { startDate: new Date(validated.startDate) } : {}),
        ...(validated.notes !== undefined ? { notes: validated.notes } : {}),
        metadata: JSON.stringify({
          ...meta,
          ...(validated.totalAmount !== undefined ? { totalAmount: validated.totalAmount } : {}),
          history: [
            ...prevHistory,
            {
              at: new Date().toISOString(),
              action: 'EDIT',
              investedAmount,
              totalAmount: nextTotalAmount,
              currentValue,
            },
          ].slice(-50),
        }),
      },
      include: { account: true },
    })

    await createAuditLog(user.id, 'UPDATE', 'INVESTMENT', id, {
      type: 'SIP',
      name: updated.name,
      accountId: updated.accountId,
      ...(validated.totalAmount !== undefined ? { totalAmount: validated.totalAmount } : {}),
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error updating SIP plan:', error)
    if (error instanceof Error && 'issues' in error) {
      return NextResponse.json(
        { error: 'Validation failed', issues: (error as any).issues },
        { status: 400 }
      )
    }
    return NextResponse.json({ error: 'Failed to update SIP plan' }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireModuleAccess('savings')
    const user = await getCurrentUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (user.role !== 'OWNER') {
      return NextResponse.json({ error: 'Only owners can delete SIP plans' }, { status: 403 })
    }

    const { id } = await params

    const existing = await prisma.investment.findUnique({
      where: { id },
      include: { account: true },
    })

    if (!existing) {
      return NextResponse.json({ error: 'SIP plan not found' }, { status: 404 })
    }

    const meta = (() => {
      try {
        return JSON.parse(existing.metadata || '{}')
      } catch {
        return {}
      }
    })()

    if (meta.type !== 'SIP' && existing.category !== 'SIP') {
      return NextResponse.json({ error: 'SIP plan not found' }, { status: 404 })
    }

    await prisma.investment.delete({ where: { id } })

    await createAuditLog(user.id, 'DELETE', 'INVESTMENT', id, {
      type: 'SIP',
      name: existing.name,
      accountId: existing.accountId,
    })

    return NextResponse.json({ message: 'SIP plan deleted successfully' })
  } catch (error) {
    console.error('Error deleting SIP plan:', error)
    return NextResponse.json({ error: 'Failed to delete SIP plan' }, { status: 500 })
  }
}
