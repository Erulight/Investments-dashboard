import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'
import { hashPassword } from '@/lib/auth'
import { z } from 'zod'

const updateUserSchema = z.object({
  email: z.string().email().optional(),
  password: z.string().min(8).optional(),
  name: z.string().min(1).optional(),
  role: z.enum(['OWNER', 'PARTNER', 'VIEWER']).optional(),
  permissions: z
    .object({
      sukuk: z.boolean().optional(),
      crypto: z.boolean().optional(),
      sip: z.boolean().optional(),
      savings: z.boolean().optional(),
      'business-deals': z.boolean().optional(),
      zakat: z.boolean().optional(),
      import: z.boolean().optional(),
      settings: z.boolean().optional(),
    })
    .optional()
    .nullable(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(['OWNER'])

    const { id } = await params

    const body = await req.json()
    const validatedData = updateUserSchema.parse(body)

    const existingUser = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, name: true, personId: true },
    })

    if (!existingUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (validatedData.email && validatedData.email !== existingUser.email) {
      const userWithEmail = await prisma.user.findUnique({
        where: { email: validatedData.email },
        select: { id: true },
      })

      if (userWithEmail) {
        return NextResponse.json(
          { error: 'User with this email already exists' },
          { status: 400 }
        )
      }
    }

    const updateData: {
      email?: string
      password?: string
      name?: string
      role?: string
      permissions?: string | null
    } = {}

    if (typeof validatedData.email !== 'undefined') updateData.email = validatedData.email
    if (typeof validatedData.name !== 'undefined') updateData.name = validatedData.name
    if (typeof validatedData.role !== 'undefined') updateData.role = validatedData.role

    if (typeof validatedData.permissions !== 'undefined') {
      updateData.permissions = validatedData.permissions
        ? JSON.stringify(validatedData.permissions)
        : null
    }

    if (typeof validatedData.password !== 'undefined') {
      updateData.password = await hashPassword(validatedData.password)
    }

    const user = await prisma.$transaction(async (tx) => {
      const nextRole = typeof validatedData.role !== 'undefined' ? validatedData.role : undefined

      if (nextRole === 'PARTNER' && !existingUser.personId) {
        const created = await tx.person.create({
          data: {
            name: updateData.name || existingUser.name || 'Partner',
            email: updateData.email || existingUser.email,
          },
          select: { id: true },
        })

        ;(updateData as any).personId = created.id
      }

      return tx.user.update({
        where: { id },
        data: updateData as any,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          permissions: true,
          canEditAsPartner: true,
          createdAt: true,
          updatedAt: true,
        },
      })
    })

    return NextResponse.json({
      user: {
        ...user,
        permissions: user.permissions ? JSON.parse(user.permissions) : null,
      },
      message: 'User updated successfully',
    })
  } catch (error) {
    console.error('Update user error:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.issues },
        { status: 400 }
      )
    }

    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await requireAuth(['OWNER'])

    const { id } = await params

    if (currentUser.id === id) {
      return NextResponse.json(
        { error: 'You cannot delete your own account' },
        { status: 400 }
      )
    }

    const existingUser = await prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true },
    })

    if (!existingUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (existingUser.role === 'OWNER') {
      return NextResponse.json(
        { error: 'Owner users cannot be deleted' },
        { status: 400 }
      )
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id },
        data: { personId: null },
        select: { id: true },
      }),
      prisma.user.delete({ where: { id } }),
    ])

    return NextResponse.json({ message: 'User deleted successfully' })
  } catch (error) {
    console.error('Delete user error:', error)

    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 })
  }
}
