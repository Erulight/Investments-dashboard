import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

export async function POST() {
  try {
    await requireAuth(['OWNER'])
    
    const today = new Date()
    
    // Find all cash buckets with future haulStartDate
    const futureBuckets = await prisma.cashBucket.findMany({
      where: {
        haulStartDate: { gt: today },
      },
      orderBy: { haulStartDate: 'asc' },
      select: {
        id: true,
        label: true,
        balance: true,
        haulStartDate: true,
        createdAt: true,
        movements: {
          where: { type: 'CASH_IN' },
          select: { date: true },
          orderBy: { date: 'asc' },
          take: 1,
        },
      },
    })

    if (futureBuckets.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No buckets with future haulStartDate found',
        fixed: 0,
      })
    }

    const fixes: any[] = []

    for (const bucket of futureBuckets) {
      const earliestCashIn = bucket.movements[0]?.date
        ? new Date(bucket.movements[0].date)
        : null

      // Determine the correct haul start date
      let newHaulStartDate: Date
      if (earliestCashIn && earliestCashIn <= today) {
        newHaulStartDate = earliestCashIn
      } else {
        const createdDate = new Date(bucket.createdAt)
        newHaulStartDate = createdDate <= today ? createdDate : today
      }

      // Update the bucket
      await prisma.cashBucket.update({
        where: { id: bucket.id },
        data: { haulStartDate: newHaulStartDate },
      })

      fixes.push({
        id: bucket.id,
        label: bucket.label,
        balance: bucket.balance,
        oldHaulStartDate: bucket.haulStartDate.toISOString().split('T')[0],
        newHaulStartDate: newHaulStartDate.toISOString().split('T')[0],
      })
    }

    const totalUnlocked = futureBuckets.reduce((sum: number, b: any) => sum + Number(b.balance || 0), 0)

    return NextResponse.json({
      success: true,
      message: `Successfully fixed ${fixes.length} bucket(s)`,
      fixed: fixes.length,
      totalUnlocked,
      fixes,
    })
  } catch (error) {
    console.error('Fix future buckets error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fix buckets' },
      { status: 500 }
    )
  }
}
