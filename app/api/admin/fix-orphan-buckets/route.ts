import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

export const dynamic = 'force-dynamic'

// GET: Preview what will be deleted
export async function GET() {
  try {
    await requireAuth(['OWNER'])

    // Find orphan buckets: have balance > 0, no label, no allocations, only CASH_IN movements
    const orphanBuckets = await prisma.cashBucket.findMany({
      where: {
        balance: { gt: 0 },
        label: null,
        allocations: { none: {} },
      },
      include: {
        movements: true,
      },
    })

    // Filter to only those with just a single CASH_IN movement (true orphans)
    const trueOrphans = orphanBuckets.filter((b: any) => {
      const movements = b.movements || []
      return (
        movements.length === 1 &&
        movements[0].type === 'CASH_IN' &&
        movements[0].investmentId === null
      )
    })

    return NextResponse.json({
      message: 'Preview of orphan buckets to delete',
      orphanCount: trueOrphans.length,
      totalOrphanBalance: trueOrphans.reduce((sum: number, b: any) => sum + b.balance, 0),
      orphans: trueOrphans.map((b: any) => ({
        id: b.id,
        balance: b.balance,
        haulStartDate: b.haulStartDate,
        createdAt: b.createdAt,
        movements: b.movements,
      })),
      action: 'Call POST /api/admin/fix-orphan-buckets to delete these buckets',
    })
  } catch (error) {
    console.error('Fix orphan buckets preview error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

// POST: Actually delete the orphan buckets
export async function POST() {
  try {
    await requireAuth(['OWNER'])

    // Find orphan buckets
    const orphanBuckets = await prisma.cashBucket.findMany({
      where: {
        balance: { gt: 0 },
        label: null,
        allocations: { none: {} },
      },
      include: {
        movements: true,
      },
    })

    // Filter to only those with just a single CASH_IN movement
    const trueOrphans = orphanBuckets.filter((b: any) => {
      const movements = b.movements || []
      return (
        movements.length === 1 &&
        movements[0].type === 'CASH_IN' &&
        movements[0].investmentId === null
      )
    })

    if (trueOrphans.length === 0) {
      return NextResponse.json({
        message: 'No orphan buckets found to delete',
        deleted: 0,
      })
    }

    const orphanIds = trueOrphans.map((b: any) => b.id)
    const totalBalance = trueOrphans.reduce((sum: number, b: any) => sum + b.balance, 0)

    // Delete movements first (foreign key constraint)
    await prisma.cashBucketMovement.deleteMany({
      where: { cashBucketId: { in: orphanIds } },
    })

    // Delete the orphan buckets
    await prisma.cashBucket.deleteMany({
      where: { id: { in: orphanIds } },
    })

    return NextResponse.json({
      message: 'Successfully deleted orphan buckets',
      deleted: trueOrphans.length,
      totalBalanceRemoved: totalBalance,
      deletedBucketIds: orphanIds,
    })
  } catch (error) {
    console.error('Fix orphan buckets error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
