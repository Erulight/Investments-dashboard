import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(['OWNER', 'PARTNER'])

    const people = await prisma.person.findMany({
      where: {
        user: {
          OR: [{ role: 'PARTNER' }, { canEditAsPartner: true }],
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
        user: {
          select: {
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    })

    return NextResponse.json({
      partners: people
        .filter((p) => (user.personId ? p.id !== user.personId : true))
        .map((p) => ({
          id: p.id,
          name: p.name || p.user?.name || p.user?.email || p.email || p.id,
        })),
    })
  } catch (error) {
    console.error('Partners fetch error:', error)

    let statusCode = 500
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        statusCode = 401
      } else if (error.message === 'Forbidden') {
        statusCode = 403
      }
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load partners' },
      { status: statusCode }
    )
  }
}
