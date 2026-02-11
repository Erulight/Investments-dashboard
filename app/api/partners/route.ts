import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(['OWNER', 'PARTNER'])

    const partners = await prisma.user.findMany({
      where: {
        role: 'PARTNER',
        personId: { not: null },
      },
      select: {
        id: true,
        email: true,
        name: true,
        person: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    })

    return NextResponse.json({
      partners: partners
        .filter((partner) => partner.person?.id)
        .filter((partner) => (user.personId ? partner.person!.id !== user.personId : true))
        .map((partner) => ({
          id: partner.person!.id,
          name: partner.person?.name || partner.name || partner.email,
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
