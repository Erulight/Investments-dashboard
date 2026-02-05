import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

export async function GET(req: NextRequest) {
  try {
    await requireAuth(['OWNER'])

    const { searchParams } = new URL(req.url)
    const typeParam = searchParams.get('type')
    const type = typeParam ? typeParam.toUpperCase() : undefined

    const accounts = await prisma.account.findMany({
      where: {
        isActive: true,
        ...(type ? { type } : {}),
      },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        type: true,
        currency: true,
        description: true,
      },
    })

    return NextResponse.json({ accounts })
  } catch (error) {
    console.error('Accounts fetch error:', error)

    let statusCode = 500
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        statusCode = 401
      } else if (error.message === 'Forbidden') {
        statusCode = 403
      }
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load accounts' },
      { status: statusCode }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth(['OWNER'])

    const body = await req.json()
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const currency = typeof body.currency === 'string' ? body.currency.trim() : 'SAR'
    const description = typeof body.description === 'string' ? body.description.trim() : null
    const type = typeof body.type === 'string' ? body.type.toUpperCase() : 'SUKUK'

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    if (!currency) {
      return NextResponse.json({ error: 'Currency is required' }, { status: 400 })
    }

    if (type !== 'SUKUK') {
      return NextResponse.json({ error: 'Only Sukuk accounts are supported here' }, { status: 400 })
    }

    const existing = await prisma.account.findFirst({
      where: { name, type },
    })

    if (existing) {
      return NextResponse.json({ error: 'Account already exists' }, { status: 409 })
    }

    const account = await prisma.account.create({
      data: {
        name,
        type,
        description: description || null,
        currency,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        type: true,
        currency: true,
        description: true,
      },
    })

    return NextResponse.json({ account }, { status: 201 })
  } catch (error) {
    console.error('Accounts create error:', error)

    let statusCode = 500
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        statusCode = 401
      } else if (error.message === 'Forbidden') {
        statusCode = 403
      }
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create account' },
      { status: statusCode }
    )
  }
}
