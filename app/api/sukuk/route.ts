import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth()
    
    const { searchParams } = new URL(req.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '10')
    const category = searchParams.get('category')
    const skip = (page - 1) * limit

    let whereClause: any = {
      account: {
        type: 'SUKUK',
      },
    }
    
    // Apply category filter if provided
    if (category) {
      whereClause.category = category
    }

    // Apply RBAC filters
    if (user.role === 'PARTNER' && user.personId) {
      // Partners can only see Sukuk they participate in
      whereClause.dealParticipants = {
        some: {
          personId: user.personId,
        },
      }
    }

    const [sukuk, total] = await Promise.all([
      prisma.investment.findMany({
        where: whereClause,
        include: {
          account: true,
          dealParticipants: {
            include: {
              person: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.investment.count({ where: whereClause }),
    ])

    // For partners, filter participant data to show only their own
    const filteredSukuk = sukuk.map((s) => {
      if (user.role === 'PARTNER' && user.personId) {
        const myParticipation = s.dealParticipants.find(
          (p) => p.personId === user.personId
        )
        return {
          ...s,
          dealParticipants: myParticipation ? [myParticipation] : [],
        }
      }
      return s
    })

    return NextResponse.json({
      sukuk: filteredSukuk,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('Sukuk list error:', error)
    
    let statusCode = 500
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        statusCode = 401
      } else if (error.message === 'Forbidden') {
        statusCode = 403
      }
    }
    
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch Sukuk' },
      { status: statusCode }
    )
  }
}
