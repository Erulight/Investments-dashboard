import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'
import { createAuditLog } from '@/lib/audit'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(['OWNER', 'PARTNER'])
    const { id } = await params
    const body = await req.json()

    const participant = await prisma.dealParticipant.findUnique({
      where: { id },
      include: {
        investment: true,
        person: true,
      },
    })

    if (!participant) {
      return NextResponse.json({ error: 'Deal participant not found' }, { status: 404 })
    }

    // Authorization check
    if (user.role === 'PARTNER') {
      if (!user.personId || participant.personId !== user.personId) {
        return NextResponse.json({ error: 'You can only edit your own participation' }, { status: 403 })
      }
    }

    const updateData: Record<string, unknown> = {}

    // Allow updating commission fees
    if (body.commissionFees !== undefined) {
      const commissionValue = Number(body.commissionFees)
      if (!Number.isFinite(commissionValue) || commissionValue < 0) {
        return NextResponse.json({ error: 'Invalid commission value' }, { status: 400 })
      }
      updateData.commissionFees = commissionValue
    }

    // Allow updating profit cap (for partners to adjust their profit expectations)
    if (body.profit !== undefined && user.role === 'PARTNER') {
      const profitValue = Number(body.profit)
      if (!Number.isFinite(profitValue) || profitValue < 0) {
        return NextResponse.json({ error: 'Invalid profit value' }, { status: 400 })
      }
      updateData.profit = profitValue
      updateData.receivable = profitValue
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const updated = await prisma.dealParticipant.update({
      where: { id },
      data: updateData,
      include: {
        investment: true,
        person: true,
      },
    })

    await createAuditLog(user.id, 'UPDATE', 'DEAL_PARTICIPANT', id, {
      changes: updateData,
      investmentId: participant.investment.id,
      investmentName: participant.investment.name,
    })

    return NextResponse.json({ success: true, participant: updated })
  } catch (error) {
    console.error('Deal participant update error:', error)

    if (error instanceof Error) {
      if (error.message === 'Unauthorized' || error.message === 'Forbidden') {
        return NextResponse.json({ error: error.message }, { status: 401 })
      }
    }

    return NextResponse.json({ error: 'Failed to update deal participant' }, { status: 500 })
  }
}
