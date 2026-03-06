import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

export async function POST(req: NextRequest) {
  try {
    await requireAuth(['OWNER'])

    console.log('FIXING COMMISSION DATA')

    const result = await prisma.$transaction(async (tx) => {
      // Delete commission bucket
      const deletedBuckets = await tx.cashBucket.deleteMany({
        where: { label: { contains: 'Partner Commission' } }
      })

      // Delete wrong transactions
      const deletedTransactions = await tx.transaction.deleteMany({
        where: { type: { in: ['PARTNER_COMMISSION', 'SOLD_DEAL_SETTLEMENT'] } }
      })

      // Fix cash balance back to 5000
      await tx.systemSetting.update({
        where: { key: 'CASH_BALANCE' },
        data: { value: '5000' }
      })

      return {
        deletedBuckets: deletedBuckets.count,
        deletedTransactions: deletedTransactions.count,
        newBalance: '5000'
      }
    })

    console.log('COMMISSION DATA FIX COMPLETED:', result)

    return NextResponse.json({
      success: true,
      message: 'Commission data fixed successfully',
      details: result
    })

  } catch (error) {
    console.error('Commission data fix error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fix commission data' },
      { status: 500 }
    )
  }
}
