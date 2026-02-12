import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

export async function POST(req: NextRequest) {
  try {
    await requireAuth(['OWNER'])

    const buckets = await prisma.cashBucket.findMany({
      where: {
        personId: null,
      } as any,
      select: {
        id: true,
        label: true,
        currency: true,
        balance: true,
        haulStartDate: true,
        createdAt: true,
        movements: {
          select: {
            investmentId: true,
          },
        },
      } as any,
      orderBy: { createdAt: 'asc' },
    })

    let inspected = 0
    let updated = 0
    const skipped: Array<{ bucketId: string; reason: string }> = []
    const updatedBuckets: Array<{ bucketId: string; personId: string }> = []

    for (const bucket of buckets as any[]) {
      inspected += 1

      const label = typeof bucket?.label === 'string' ? bucket.label : ''
      if (label === 'Partner Commission' || label.startsWith('Debt •')) {
        skipped.push({ bucketId: bucket.id, reason: 'Skipped non-owner cash bucket type' })
        continue
      }

      const investmentIds: string[] = Array.from(
        new Set(
          (Array.isArray(bucket?.movements) ? bucket.movements : [])
            .map((m: any) => m?.investmentId)
            .filter((id: any): id is string => typeof id === 'string' && id.length > 0)
        )
      )

      if (investmentIds.length === 0) {
        skipped.push({ bucketId: bucket.id, reason: 'No investment-linked movements' })
        continue
      }

      const personIds: string[] = []
      let ambiguous = false

      for (const invId of investmentIds) {
        const participants = await prisma.dealParticipant.findMany({
          where: { investmentId: invId },
          select: { personId: true },
        })

        const unique = Array.from(
          new Set(
            participants
              .map((p: any) => p?.personId)
              .filter((id: any): id is string => typeof id === 'string' && id.length > 0)
          )
        )

        if (unique.length !== 1) {
          ambiguous = true
          break
        }

        personIds.push(unique[0])
      }

      if (ambiguous) {
        skipped.push({ bucketId: bucket.id, reason: 'Ambiguous investment participants' })
        continue
      }

      const uniqueOwners = Array.from(new Set(personIds))
      if (uniqueOwners.length !== 1) {
        skipped.push({ bucketId: bucket.id, reason: 'Multiple inferred owners' })
        continue
      }

      const inferredPersonId = uniqueOwners[0]

      await prisma.cashBucket.update({
        where: { id: bucket.id },
        data: { personId: inferredPersonId } as any,
      })

      updated += 1
      updatedBuckets.push({ bucketId: bucket.id, personId: inferredPersonId })
    }

    return NextResponse.json({
      success: true,
      inspected,
      updated,
      skippedCount: skipped.length,
      updatedBuckets,
      skipped,
    })
  } catch (error) {
    console.error('Backfill cash bucket personId error:', error)

    let statusCode = 500
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        statusCode = 401
      } else if (error.message === 'Forbidden') {
        statusCode = 403
      }
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to backfill cash buckets' },
      { status: statusCode }
    )
  }
}
