import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  try {
    // Get all cash buckets with positive balance
    const buckets = await prisma.cashBucket.findMany({
      where: {
        balance: { gt: 0 }
      },
      orderBy: { haulStartDate: 'asc' },
      include: {
        movements: {
          orderBy: { date: 'asc' }
        }
      }
    })

    let totalBalance = 0
    let totalZakat = 0

    const bucketDetails = buckets.map((bucket, index) => {
      const zakatDue = bucket.excludeFromZakat ? 0 : bucket.balance * 0.025
      
      if (!bucket.excludeFromZakat) {
        totalBalance += bucket.balance
        totalZakat += zakatDue
      }

      return {
        index: index + 1,
        id: bucket.id,
        label: bucket.label || 'No label',
        balance: bucket.balance,
        currency: bucket.currency,
        haulStartDate: bucket.haulStartDate.toISOString().split('T')[0],
        excludeFromZakat: bucket.excludeFromZakat,
        personId: bucket.personId || 'Owner',
        zakatDue: zakatDue.toFixed(2),
        movements: bucket.movements.map(movement => ({
          date: movement.date.toISOString().split('T')[0],
          type: movement.type,
          amount: movement.amount,
          notes: movement.notes || 'No notes'
        }))
      }
    })

    // Get system cash balance for comparison
    const cashSetting = await prisma.systemSetting.findUnique({
      where: { key: 'CASH_BALANCE' }
    })

    // Get cash account transactions sum
    const cashAccount = await prisma.account.findFirst({
      where: { type: 'CASH' }
    })

    let cashTxSum = 0
    if (cashAccount) {
      const txSum = await prisma.transaction.aggregate({
        where: { accountId: cashAccount.id },
        _sum: { amount: true }
      })
      cashTxSum = txSum._sum.amount || 0
    }

    return NextResponse.json({
      bucketsCount: buckets.length,
      buckets: bucketDetails,
      summary: {
        totalBalance,
        totalZakat: parseFloat(totalZakat.toFixed(2)),
        systemCashBalance: parseFloat(cashSetting?.value || '0'),
        cashAccountTxSum: cashTxSum
      }
    })

  } catch (error) {
    console.error('Bucket diagnostic error:', error)
    return NextResponse.json(
      { error: 'Failed to diagnose buckets' },
      { status: 500 }
    )
  }
}
