import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { requireModuleAccess } from '@/lib/rbac'
import { updateSavingsSchema, UpdateSavingsInput } from '@/lib/validation'
import { createAuditLog } from '@/lib/audit'

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
      return NextResponse.json({ error: 'Only owners can edit savings plans' }, { status: 403 })
    }

    const { id } = await params

    const existing = await prisma.investment.findUnique({
      where: { id },
      include: { account: true },
    })

    if (!existing || existing.account?.type !== 'CIRCLYS') {
      return NextResponse.json({ error: 'Savings plan not found' }, { status: 404 })
    }

    const body = await req.json()
    const validated = updateSavingsSchema.parse(body) as UpdateSavingsInput

    const currentMeta = (() => {
      try {
        return JSON.parse(existing.metadata || '{}')
      } catch {
        return {}
      }
    })()

    const nextMeta = {
      ...currentMeta,
      ...(validated.monthlyContribution !== undefined
        ? { monthlyContribution: validated.monthlyContribution }
        : {}),
      ...(validated.totalMonths !== undefined ? { totalMonths: validated.totalMonths } : {}),
      ...(validated.bookingFee !== undefined ? { bookingFee: validated.bookingFee } : {}),
      ...(validated.rewardProgram !== undefined ? { rewardProgram: validated.rewardProgram } : {}),
      ...(validated.rewardAmount !== undefined ? { rewardAmount: validated.rewardAmount } : {}),
      ...(validated.receiptMonth !== undefined ? { receiptMonth: validated.receiptMonth } : {}),
    }

    const monthly = nextMeta.monthlyContribution ?? currentMeta.monthlyContribution ?? 0
    const totalMonths = nextMeta.totalMonths ?? currentMeta.totalMonths ?? 0

    const updated = await prisma.investment.update({
      where: { id },
      data: {
        ...(validated.accountId ? { accountId: validated.accountId } : {}),
        ...(validated.name ? { name: validated.name } : {}),
        ...(validated.startDate ? { startDate: new Date(validated.startDate) } : {}),
        ...(validated.notes !== undefined ? { notes: validated.notes } : {}),
        principalAmount: monthly * totalMonths,
        metadata: JSON.stringify(nextMeta),
      },
      include: {
        account: true,
        dealParticipants: {
          include: { person: true },
        },
      },
    })

    await createAuditLog(user.id, 'UPDATE', 'INVESTMENT', updated.id, {
      type: 'ROSCA',
      name: updated.name,
      accountId: updated.accountId,
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error updating savings plan:', error)
    if (error instanceof Error && 'issues' in error) {
      return NextResponse.json(
        { error: 'Validation failed', issues: (error as any).issues },
        { status: 400 }
      )
    }
    return NextResponse.json({ error: 'Failed to update savings plan' }, { status: 500 })
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
      return NextResponse.json({ error: 'Only owners can delete savings plans' }, { status: 403 })
    }

    const { id } = await params

    const existing = await prisma.investment.findUnique({
      where: { id },
      include: { account: true },
    })

    if (!existing || existing.account?.type !== 'CIRCLYS') {
      return NextResponse.json({ error: 'Savings plan not found' }, { status: 404 })
    }

    const meta = (() => {
      try {
        return JSON.parse(existing.metadata || '{}')
      } catch {
        return {}
      }
    })()

    const payments = meta.payments && typeof meta.payments === 'object' ? meta.payments : {}
    const bucketIds: string[] = Object.values(payments)
      .map((p: any) => p?.bucketId)
      .filter((x: any): x is string => typeof x === 'string' && x.length > 0)

    if (bucketIds.length) {
      await prisma.cashBucket.deleteMany({ where: { id: { in: bucketIds } } })
    }

    await prisma.investment.delete({ where: { id } })

    await createAuditLog(user.id, 'DELETE', 'INVESTMENT', id, {
      type: 'ROSCA',
      name: existing.name,
      accountId: existing.accountId,
    })

    return NextResponse.json({ message: 'Savings plan deleted successfully' })
  } catch (error) {
    console.error('Error deleting savings plan:', error)
    return NextResponse.json({ error: 'Failed to delete savings plan' }, { status: 500 })
  }
}
