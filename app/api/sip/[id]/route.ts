import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { requireModuleAccess } from '@/lib/rbac'
import { createAuditLog } from '@/lib/audit'

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
