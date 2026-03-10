import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'
import { recomputeCashSetting } from '@/lib/cashBalance'

const RESET_CONFIRM_TEXT = 'RESET PARTNER'

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(['OWNER'])
    const body = await req.json().catch(() => ({}))

    const partnerPersonId = typeof body.partnerPersonId === 'string' ? body.partnerPersonId.trim() : ''
    const confirmText = typeof body.confirmText === 'string' ? body.confirmText.trim() : ''
    const password = typeof body.password === 'string' ? body.password : ''
    const rebuildZakatBuckets = body.rebuildZakatBuckets === true

    if (!partnerPersonId) {
      return NextResponse.json({ error: 'Partner is required' }, { status: 400 })
    }

    const currentUser = await prisma.user.findUnique({ where: { id: user.id } })
    if (!currentUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const confirmMatch = confirmText.toUpperCase() === RESET_CONFIRM_TEXT
    const passwordMatch = password ? await bcrypt.compare(password, currentUser.password) : false

    if (!confirmMatch && !passwordMatch) {
      return NextResponse.json(
        { error: 'Provide owner password or type RESET PARTNER to confirm' },
        { status: 400 }
      )
    }

    const partner = await prisma.person.findUnique({ where: { id: partnerPersonId } })
    if (!partner) {
      return NextResponse.json({ error: 'Partner not found' }, { status: 404 })
    }

    const result = await prisma.$transaction(async (tx: any) => {
      if (rebuildZakatBuckets) {
        let updated = 0
        const buckets = await tx.cashBucket.findMany({
          where: {
            personId: partnerPersonId,
            OR: [{ excludeFromZakat: false }, { excludeFromZakat: null }],
            NOT: [
              { label: { startsWith: 'Debt •' } },
              { label: 'Partner Commission' },
            ],
          } as any,
          select: {
            id: true,
            haulStartDate: true,
            label: true,
            allocations: {
              select: { investmentId: true },
              take: 1,
            },
            movements: {
              select: { investmentId: true },
              where: { investmentId: { not: null } },
              orderBy: { createdAt: 'desc' },
              take: 5,
            },
          },
        })

        for (const b of buckets) {
          const invFromAlloc = b.allocations?.[0]?.investmentId || null
          const invFromMove = b.movements?.find((m: any) => typeof m.investmentId === 'string')?.investmentId || null
          const investmentId = invFromAlloc || invFromMove
          if (!investmentId) continue

          const participation = await tx.dealParticipant.findFirst({
            where: {
              investmentId,
              personId: partnerPersonId,
            },
            select: {
              acquiredAt: true,
              investment: { select: { startDate: true } },
            },
          })

          const acquiredAt = participation?.acquiredAt || participation?.investment?.startDate || null
          if (!(acquiredAt instanceof Date) || Number.isNaN(acquiredAt.getTime())) continue

          const nextHaulStart = new Date(acquiredAt.getFullYear(), acquiredAt.getMonth(), acquiredAt.getDate())
          await tx.cashBucket.update({
            where: { id: b.id },
            data: { haulStartDate: nextHaulStart },
          })
          updated += 1
        }

        return { mode: 'REBUILD_ZAKAT_BUCKETS', updated }
      }

      const buckets = await tx.cashBucket.findMany({
        where: { personId: partnerPersonId } as any,
        select: { id: true },
      })
      const bucketIds = buckets.map((b: any) => b.id)

      if (bucketIds.length > 0) {
        await tx.cashBucketMovement.deleteMany({
          where: { cashBucketId: { in: bucketIds } },
        })

        await tx.investmentBucketAllocation.deleteMany({
          where: { cashBucketId: { in: bucketIds } },
        })
      }

      await tx.cashBucket.deleteMany({
        where: { personId: partnerPersonId } as any,
      })

      await tx.transaction.deleteMany({
        where: { personId: partnerPersonId } as any,
      })

      await recomputeCashSetting(tx, partnerPersonId)

      return { mode: 'RESET_PARTNER' }
    })

    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    console.error('Reset partner error:', error)

    let statusCode = 500
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        statusCode = 401
      } else if (error.message === 'Forbidden') {
        statusCode = 403
      }
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to reset partner' },
      { status: statusCode }
    )
  }
}
