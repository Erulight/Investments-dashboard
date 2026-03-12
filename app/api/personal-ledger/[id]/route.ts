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

    const existing = await prisma.personalTransaction.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
    }

    const date = body.date ? new Date(body.date) : null
    const type = typeof body.type === 'string' ? body.type.trim().toUpperCase() : ''
    const category = typeof body.category === 'string' ? body.category.trim() : ''
    const amount = Number(body.amount)
    const currency = typeof body.currency === 'string' && body.currency.trim() ? body.currency.trim().toUpperCase() : 'SAR'
    const description = typeof body.description === 'string' ? body.description.trim() : null
    const notes = typeof body.notes === 'string' ? body.notes.trim() : null

    if (!date || Number.isNaN(date.getTime())) {
      return NextResponse.json({ error: 'Valid date is required' }, { status: 400 })
    }
    if (!['INCOME', 'EXPENSE'].includes(type)) {
      return NextResponse.json({ error: 'Type must be INCOME or EXPENSE' }, { status: 400 })
    }
    if (!category) {
      return NextResponse.json({ error: 'Category is required' }, { status: 400 })
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Amount must be a positive number' }, { status: 400 })
    }

    const updated = await prisma.personalTransaction.update({
      where: { id },
      data: {
        date,
        type,
        category,
        amount,
        currency,
        description: description || null,
        notes: notes || null,
      },
    })

    return NextResponse.json({ transaction: updated })
  } catch (error) {
    console.error('Personal ledger PUT error:', error)
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to update transaction' }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(['OWNER'])
    const { id } = await params

    const existing = await prisma.personalTransaction.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
    }

    await prisma.personalTransaction.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Personal ledger DELETE error:', error)
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to delete transaction' }, { status: 500 })
  }
}
