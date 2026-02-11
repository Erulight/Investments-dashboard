import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(['OWNER', 'PARTNER'])

    const partners = await prisma.$transaction(async (tx) => {
      const eligible = await tx.user.findMany({
        where: {
          OR: [{ role: 'PARTNER' }, { canEditAsPartner: true }],
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          canEditAsPartner: true,
          personId: true,
          person: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: 'asc' },
      })

      const ensured = [] as Array<{ id: string; name: string }>
      for (const u of eligible) {
        const personId = u.personId || u.person?.id

        if (!personId) {
          const created = await tx.person.create({
            data: { name: u.name || 'Partner', email: u.email },
            select: { id: true, name: true, email: true },
          })

          await tx.user.update({
            where: { id: u.id },
            data: { personId: created.id },
            select: { id: true },
          })

          if (!user.personId || created.id !== user.personId) {
            ensured.push({ id: created.id, name: created.name || u.name || u.email })
          }
          continue
        }

        if (user.personId && personId === user.personId) continue
        ensured.push({ id: personId, name: u.person?.name || u.name || u.email })
      }

      return ensured
    })

    return NextResponse.json({ partners })
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
