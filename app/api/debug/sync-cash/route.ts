import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

export async function POST() {
  try {
    const user = await requireAuth(['OWNER'])

    const result = await prisma.$transaction(async (tx) => {
      // Get current system cash balance
      const cashSetting = await tx.systemSetting.findUnique({
        where: { key: 'CASH_BALANCE' },
      })
      const oldSystemCash = cashSetting ? Number(cashSetting.value || 0) : 0

      // Get total of all cash buckets
      const bucketAgg = await tx.cashBucket.aggregate({
        _sum: { balance: true },
      })
      const bucketTotal = Number(bucketAgg._sum.balance || 0)

      const difference = oldSystemCash - bucketTotal

      // Update system cash to match bucket total
      if (cashSetting) {
        await tx.systemSetting.update({
          where: { key: 'CASH_BALANCE' },
          data: { value: bucketTotal.toString() },
        })
      } else {
        await tx.systemSetting.create({
          data: {
            key: 'CASH_BALANCE',
            value: bucketTotal.toString(),
            description: 'Available cash balance for investments',
          },
        })
      }

      return {
        oldSystemCash,
        newSystemCash: bucketTotal,
        bucketTotal,
        difference,
        fixed: true,
      }
    })

    return NextResponse.json({
      success: true,
      message: 'System cash balance synced with bucket total',
      ...result,
    })
  } catch (error) {
    console.error('Sync cash error:', error)

    let statusCode = 500
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') statusCode = 401
      if (error.message === 'Forbidden') statusCode = 403
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to sync cash',
      },
      { status: statusCode }
    )
  }
}
