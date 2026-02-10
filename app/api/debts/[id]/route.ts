import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(['OWNER'])
    const { id } = await params
    const body = await req.json().catch(() => ({}))

    const lenderName = typeof body.lenderName === 'string' ? body.lenderName.trim() : undefined
    const notes = typeof body.notes === 'string' ? body.notes : undefined
    const borrowedAt = body.borrowedAt ? new Date(body.borrowedAt) : undefined
    const amount = body.amount !== undefined ? Number(body.amount) : undefined
    const isArchived = body.isArchived !== undefined ? Boolean(body.isArchived) : undefined

    if (borrowedAt && Number.isNaN(borrowedAt.getTime())) {
      return NextResponse.json({ error: 'Invalid borrowedAt' }, { status: 400 })
    }
    if (amount !== undefined && (!Number.isFinite(amount) || amount <= 0)) {
      return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 })
    }

    const updated = await prisma.debt.update({
      where: { id },
      data: {
        ...(lenderName !== undefined ? { lenderName } : {}),
        ...(notes !== undefined ? { notes: notes || null } : {}),
        ...(borrowedAt !== undefined ? { borrowedAt } : {}),
        ...(amount !== undefined ? { amount } : {}),
        ...(isArchived !== undefined ? { isArchived } : {}),
      },
      include: {
        cashBucket: {
          select: {
            id: true,
            currency: true,
            balance: true,
            haulStartDate: true,
            lastZakatPaidDate: true,
            excludeFromZakat: true,
          },
        },
        payments: { orderBy: { paidAt: 'desc' } },
      },
    })

    return NextResponse.json({ success: true, debt: updated })
  } catch (error) {
    console.error('Debt update error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update debt' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(['OWNER'])
    const { id } = await params

    const debt = await prisma.debt.findUnique({
      where: { id },
      include: { payments: true },
    })

    if (!debt) {
      return NextResponse.json({ error: 'Debt not found' }, { status: 404 })
    }

    if (debt.payments.length > 0) {
      return NextResponse.json(
        { error: 'Cannot delete a debt with payments. Archive it instead.' },
        { status: 400 }
      )
    }

    await prisma.debt.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Debt delete error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete debt' },
      { status: 500 }
    )
  }
}
