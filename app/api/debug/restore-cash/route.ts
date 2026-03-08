import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function POST() {
  try {
    // Calculate actual cash from buckets
    const buckets = await prisma.cashBucket.findMany({
      where: { personId: null },
      select: { id: true, label: true, balance: true },
    })

    const totalBucketBalance = buckets.reduce((sum, b) => sum + Number(b.balance || 0), 0)

    // Get system cash setting
    const cashSetting = await prisma.systemSetting.findUnique({
      where: { key: 'CASH_BALANCE' },
    })

    const systemCash = cashSetting ? Number(cashSetting.value) : 0

    // Update system cash to match bucket total
    if (cashSetting) {
      await prisma.systemSetting.update({
        where: { key: 'CASH_BALANCE' },
        data: { value: totalBucketBalance.toString() },
      })
    } else {
      await prisma.systemSetting.create({
        data: {
          key: 'CASH_BALANCE',
          value: totalBucketBalance.toString(),
          description: 'Available cash balance for investments',
        },
      })
    }

    return NextResponse.json({
      success: true,
      message: 'Cash balance restored',
      details: {
        bucketCount: buckets.length,
        totalBucketBalance,
        previousSystemCash: systemCash,
        newSystemCash: totalBucketBalance,
        difference: totalBucketBalance - systemCash,
        buckets: buckets.map(b => ({
          id: b.id,
          label: b.label,
          balance: b.balance,
        })),
      },
    })
  } catch (error) {
    console.error('Restore cash error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to restore cash' },
      { status: 500 }
    )
  }
}
