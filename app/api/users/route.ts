import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'
import { hashPassword } from '@/lib/auth'
import { z } from 'zod'

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  role: z.enum(['OWNER', 'PARTNER', 'VIEWER']).default('PARTNER'),
  permissions: z.object({
    sukuk: z.boolean().optional(),
    crypto: z.boolean().optional(),
    sip: z.boolean().optional(),
    savings: z.boolean().optional(),
    'business-deals': z.boolean().optional(),
    zakat: z.boolean().optional(),
    import: z.boolean().optional(),
    settings: z.boolean().optional(),
  }).optional(),
})

// GET /api/users - List all users (OWNER only)
export async function GET(req: NextRequest) {
  try {
    await requireAuth(['OWNER'])
    
    const users = await prisma.user.findMany({
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
      orderBy: { createdAt: 'desc' },
    })
    
    // Parse permissions JSON for each user
    const usersWithParsedPermissions = users.map(user => ({
      ...user,
      permissions: user.permissions ? JSON.parse(user.permissions) : null,
    }))
    
    return NextResponse.json({ users: usersWithParsedPermissions })
  } catch (error) {
    console.error('List users error:', error)
    
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    
    return NextResponse.json(
      { error: 'Failed to fetch users' },
      { status: 500 }
    )
  }
}

// POST /api/users - Create a new user (OWNER only)
export async function POST(req: NextRequest) {
  try {
    await requireAuth(['OWNER'])
    
    const body = await req.json()
    const validatedData = createUserSchema.parse(body)
    
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: validatedData.email },
    })
    
    if (existingUser) {
      return NextResponse.json(
        { error: 'User with this email already exists' },
        { status: 400 }
      )
    }
    
    // Hash password
    const hashedPassword = await hashPassword(validatedData.password)
    
    // Create user
    const user = await prisma.user.create({
      data: {
        email: validatedData.email,
        password: hashedPassword,
        name: validatedData.name,
        role: validatedData.role,
        permissions: validatedData.permissions 
          ? JSON.stringify(validatedData.permissions) 
          : null,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        permissions: true,
        createdAt: true,
      },
    })
    
    return NextResponse.json({ 
      user: {
        ...user,
        permissions: user.permissions ? JSON.parse(user.permissions) : null,
      },
      message: 'User created successfully' 
    }, { status: 201 })
  } catch (error) {
    console.error('Create user error:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      )
    }
    
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    
    return NextResponse.json(
      { error: 'Failed to create user' },
      { status: 500 }
    )
  }
}
