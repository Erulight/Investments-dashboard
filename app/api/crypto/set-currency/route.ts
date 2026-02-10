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
    const accountId = typeof body.accountId === 'string' ? body.accountId : ''
    const currency = typeof body.currency === 'string' ? body.currency.trim().toUpperCase() : ''

    if (!accountId) {
      return NextResponse.json({ error: 'accountId is required' }, { status: 400 })
    }

    if (!currency || currency.length > 6) {
      return NextResponse.json({ error: 'Invalid currency' }, { status: 400 })
    }

    const account = await prisma.account.findUnique({ where: { id: accountId } })
    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }

    const updated = await prisma.account.update({
      where: { id: accountId },
      data: { currency },
    })

    await createAuditLog(user.id, 'UPDATE', 'ACCOUNT', accountId, {
      field: 'currency',
      currency,
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error setting crypto currency:', error)
    if (error instanceof Error && error.message === 'Module access denied') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }
    return NextResponse.json({ error: 'Failed to set currency' }, { status: 500 })
  }
}
