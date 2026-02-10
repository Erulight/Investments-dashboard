import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { requireModuleAccess } from '@/lib/rbac'
import { createAuditLog } from '@/lib/audit'

export async function POST(request: Request) {
  try {
    await requireModuleAccess('savings') // We'll reuse savings permissions for SIP
    const user = await getCurrentUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only OWNER can update total amount
    if (user.role !== 'OWNER') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const { sipId, totalAmount } = await request.json()

    if (!sipId || !totalAmount || totalAmount <= 0) {
      return NextResponse.json({ error: 'Invalid total amount' }, { status: 400 })
    }

    // Get the SIP investment
    const sip = await prisma.investment.findUnique({
      where: { id: sipId },
      include: { account: true },
    })

    if (!sip) {
      return NextResponse.json({ error: 'SIP plan not found' }, { status: 404 })
    }

    const metadata = JSON.parse(sip.metadata || '{}')
    if (metadata.type !== 'SIP') {
      return NextResponse.json({ error: 'Invalid SIP plan' }, { status: 400 })
    }

    const oldTotalAmount = metadata.totalAmount || 0

    // Update the SIP investment metadata
    const updatedSip = await prisma.investment.update({
      where: { id: sipId },
      data: {
        metadata: JSON.stringify({
          ...metadata,
          totalAmount,
        }),
      },
      include: { account: true },
    })

    // Log the update action
    await createAuditLog(
      user.id,
      'UPDATE',
      'INVESTMENT',
      sipId,
      {
        field: 'totalAmount',
        oldValue: oldTotalAmount,
        newValue: totalAmount,
      }
    )

    return NextResponse.json(updatedSip)
  } catch (error) {
    console.error('Error updating SIP total:', error)
    if (error instanceof Error && error.message === 'Module access denied') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }
    return NextResponse.json({ error: 'Failed to update SIP total' }, { status: 500 })
  }
}
