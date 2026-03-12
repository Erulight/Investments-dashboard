import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

export async function GET() {
  try {
    await requireAuth(['OWNER'])
    const txs = await prisma.personalTransaction.findMany({
      orderBy: { date: 'desc' },
    })
    return NextResponse.json({ transactions: txs })
  } catch (error) {
    console.error('Personal ledger GET error:', error)
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth(['OWNER'])
    const body = await req.json().catch(() => ({}))

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

    const tx = await prisma.personalTransaction.create({
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

    return NextResponse.json({ transaction: tx }, { status: 201 })
  } catch (error) {
    console.error('Personal ledger POST error:', error)
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to create transaction' }, { status: 500 })
  }
}
