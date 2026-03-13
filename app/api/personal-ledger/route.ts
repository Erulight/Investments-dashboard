import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

export async function GET() {
  try {
    await requireAuth(['OWNER'])
    const persons = await prisma.person.findMany({
      include: {
        personLedgerTransactions: {
          orderBy: { date: 'desc' },
        },
      },
      orderBy: { name: 'asc' },
    })
    return NextResponse.json({ persons })
  } catch (error) {
    console.error('Personal ledger GET error:', error)
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to fetch persons' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth(['OWNER'])
    const body = await req.json().catch(() => ({}))

    const personName = typeof body.personName === 'string' ? body.personName.trim() : ''
    const date = body.date ? new Date(body.date) : null
    const type = typeof body.type === 'string' ? body.type.trim().toUpperCase() : ''
    const amount = Number(body.amount)
    const currency = typeof body.currency === 'string' && body.currency.trim() ? body.currency.trim().toUpperCase() : 'SAR'
    const notes = typeof body.notes === 'string' ? body.notes.trim() : null

    if (!personName) {
      return NextResponse.json({ error: 'Person name is required' }, { status: 400 })
    }
    if (!date || Number.isNaN(date.getTime())) {
      return NextResponse.json({ error: 'Valid date is required' }, { status: 400 })
    }
    if (!['GIVEN', 'RECEIVED'].includes(type)) {
      return NextResponse.json({ error: 'Type must be GIVEN or RECEIVED' }, { status: 400 })
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Amount must be a positive number' }, { status: 400 })
    }

    // Find or create person
    let person = await prisma.person.findFirst({ where: { name: personName } })
    if (!person) {
      person = await prisma.person.create({ data: { name: personName } })
    }

    const tx = await prisma.personLedgerTransaction.create({
      data: {
        personId: person.id,
        date,
        type,
        amount,
        currency,
        notes: notes || null,
      },
      include: { person: true },
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
