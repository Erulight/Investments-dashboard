import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

const DELETE_CONFIRM_TEXT = 'DELETE'

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(['OWNER'])
    const { id } = await params
    const body = await req.json()

    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const currency = typeof body.currency === 'string' ? body.currency.trim() : ''
    const description = typeof body.description === 'string' ? body.description.trim() : null

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    if (!currency) {
      return NextResponse.json({ error: 'Currency is required' }, { status: 400 })
    }

    const account = await prisma.account.findUnique({ where: { id } })
    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }

    if (account.type !== 'SUKUK') {
      return NextResponse.json({ error: 'Only Sukuk accounts can be edited here' }, { status: 400 })
    }

    const updated = await prisma.account.update({
      where: { id },
      data: {
        name,
        currency,
        description: description || null,
      },
      select: {
        id: true,
        name: true,
        type: true,
        currency: true,
        description: true,
      },
    })

    return NextResponse.json({ account: updated })
  } catch (error) {
    console.error('Account update error:', error)

    let statusCode = 500
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        statusCode = 401
      } else if (error.message === 'Forbidden') {
        statusCode = 403
      }
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update account' },
      { status: statusCode }
    )
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(['OWNER'])
    const { id } = await params
    const body = await req.json().catch(() => ({}))

    const confirmText = typeof body.confirmText === 'string' ? body.confirmText.trim() : ''
    const password = typeof body.password === 'string' ? body.password : ''

    const account = await prisma.account.findUnique({ where: { id } })
    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }

    if (account.type !== 'SUKUK') {
      return NextResponse.json({ error: 'Only Sukuk accounts can be deleted here' }, { status: 400 })
    }

    const currentUser = await prisma.user.findUnique({ where: { id: user.id } })
    if (!currentUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const confirmMatch = confirmText.toUpperCase() === DELETE_CONFIRM_TEXT
    const passwordMatch = password ? await bcrypt.compare(password, currentUser.password) : false

    if (!confirmMatch && !passwordMatch) {
      return NextResponse.json(
        { error: 'Provide owner password or type DELETE to confirm' },
        { status: 400 }
      )
    }

    const updated = await prisma.account.update({
      where: { id },
      data: { isActive: false },
      select: {
        id: true,
        name: true,
        type: true,
        currency: true,
        description: true,
      },
    })

    return NextResponse.json({ account: updated })
  } catch (error) {
    console.error('Account delete error:', error)

    let statusCode = 500
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        statusCode = 401
      } else if (error.message === 'Forbidden') {
        statusCode = 403
      }
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete account' },
      { status: statusCode }
    )
  }
}
