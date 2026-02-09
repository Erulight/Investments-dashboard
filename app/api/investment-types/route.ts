import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

export async function GET() {
  try {
    await requireAuth(['OWNER'])

    // Get all distinct account types with counts of investments
    const accounts = await prisma.account.findMany({
      where: { isActive: true },
      select: {
        type: true,
        _count: {
          select: { investments: true },
        },
      },
    })

    // Aggregate by type
    const typeMap = new Map<string, number>()
    for (const acc of accounts) {
      typeMap.set(acc.type, (typeMap.get(acc.type) ?? 0) + acc._count.investments)
    }

    const types = Array.from(typeMap.entries())
      .map(([type, investmentCount]) => ({ type, investmentCount }))
      .sort((a, b) => a.type.localeCompare(b.type))

    return NextResponse.json({ types })
  } catch (error) {
    console.error('Investment types fetch error:', error)
    const statusCode =
      error instanceof Error && error.message === 'Unauthorized' ? 401 :
      error instanceof Error && error.message === 'Forbidden' ? 403 : 500
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load types' },
      { status: statusCode }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth(['OWNER'])

    const body = await req.json()
    const type = typeof body.type === 'string' ? body.type.trim().toUpperCase() : ''

    if (!type) {
      return NextResponse.json({ error: 'Type name is required' }, { status: 400 })
    }

    if (type.length < 2 || type.length > 30) {
      return NextResponse.json({ error: 'Type name must be 2-30 characters' }, { status: 400 })
    }

    // Check if any active account with this type already exists
    const existing = await prisma.account.findFirst({
      where: { type, isActive: true },
    })

    if (existing) {
      return NextResponse.json({ error: `Investment type "${type}" already exists` }, { status: 409 })
    }

    // Create a default account for this type
    await prisma.account.create({
      data: {
        name: `${type} Default`,
        type,
        currency: 'SAR',
        isActive: true,
      },
    })

    return NextResponse.json({ success: true, type }, { status: 201 })
  } catch (error) {
    console.error('Investment type create error:', error)
    const statusCode =
      error instanceof Error && error.message === 'Unauthorized' ? 401 :
      error instanceof Error && error.message === 'Forbidden' ? 403 : 500
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create type' },
      { status: statusCode }
    )
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireAuth(['OWNER'])

    const body = await req.json()
    const type = typeof body.type === 'string' ? body.type.trim().toUpperCase() : ''
    const confirmText = typeof body.confirmText === 'string' ? body.confirmText.trim() : ''
    const password = typeof body.password === 'string' ? body.password : ''

    if (!type) {
      return NextResponse.json({ error: 'Type is required' }, { status: 400 })
    }

    // Count investments of this type
    const investmentCount = await prisma.investment.count({
      where: {
        account: { type, isActive: true },
      },
    })

    if (investmentCount > 0) {
      // Require both DELETE confirmation and password for types with investments
      if (confirmText !== 'DELETE') {
        return NextResponse.json(
          { error: 'You must type DELETE to confirm deletion of a type with existing investments' },
          { status: 400 }
        )
      }

      if (!password) {
        return NextResponse.json(
          { error: 'Owner password is required to delete a type with existing investments' },
          { status: 400 }
        )
      }

      // Verify owner password
      const { getCurrentUser } = await import('@/lib/auth')
      const user = await getCurrentUser()
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      const bcrypt = await import('bcryptjs')
      const dbUser = await prisma.user.findUnique({ where: { id: user.id } })
      if (!dbUser) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 })
      }

      const valid = await bcrypt.compare(password, dbUser.password)
      if (!valid) {
        return NextResponse.json({ error: 'Invalid password' }, { status: 403 })
      }
    }

    // Soft-delete: mark all accounts of this type as inactive
    await prisma.account.updateMany({
      where: { type, isActive: true },
      data: { isActive: false },
    })

    return NextResponse.json({ success: true, deletedType: type, investmentsAffected: investmentCount })
  } catch (error) {
    console.error('Investment type delete error:', error)
    const statusCode =
      error instanceof Error && error.message === 'Unauthorized' ? 401 :
      error instanceof Error && error.message === 'Forbidden' ? 403 : 500
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete type' },
      { status: statusCode }
    )
  }
}
