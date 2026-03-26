import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth(['OWNER'])
    const { id } = params

    if (!id) {
      return NextResponse.json({ error: 'Person ID is required' }, { status: 400 })
    }

    // Delete all transactions for this person first
    await prisma.personLedgerTransaction.deleteMany({
      where: { personId: id },
    })

    // Delete the person
    await prisma.person.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Person DELETE error:', error)
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to delete person' }, { status: 500 })
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth(['OWNER'])
    const { id } = params
    const body = await req.json().catch(() => ({}))

    const name = typeof body.name === 'string' ? body.name.trim() : ''

    if (!id) {
      return NextResponse.json({ error: 'Person ID is required' }, { status: 400 })
    }

    if (!name) {
      return NextResponse.json({ error: 'Person name is required' }, { status: 400 })
    }

    // Check if another person with this name already exists
    const existing = await prisma.person.findFirst({
      where: {
        name,
        id: { not: id },
      },
    })

    if (existing) {
      return NextResponse.json({ error: 'A person with this name already exists' }, { status: 400 })
    }

    const updated = await prisma.person.update({
      where: { id },
      data: { name },
      include: {
        personLedgerTransactions: {
          orderBy: { date: 'desc' },
        },
      },
    })

    return NextResponse.json({ person: updated })
  } catch (error) {
    console.error('Person PUT error:', error)
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to update person' }, { status: 500 })
  }
}
