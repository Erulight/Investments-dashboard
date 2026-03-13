import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user || user.role !== 'OWNER') {
      return NextResponse.json({ error: 'Unauthorized - Owner only' }, { status: 403 })
    }

    // Export all data tables
    const [
      accounts,
      investments,
      dealParticipants,
      transactions,
      people,
      debts,
      debtPayments,
      cashBuckets,
      cashBucketAllocations,
      cashBucketMovements,
      systemSettings,
    ] = await Promise.all([
      prisma.account.findMany({ include: { investments: false } }),
      prisma.investment.findMany(),
      prisma.dealParticipant.findMany(),
      prisma.transaction.findMany(),
      prisma.person.findMany(),
      prisma.debt.findMany(),
      prisma.debtPayment.findMany(),
      prisma.cashBucket.findMany(),
      prisma.investmentBucketAllocation.findMany(),
      prisma.cashBucketMovement.findMany(),
      prisma.systemSetting.findMany(),
    ])

    const backup = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      exportedBy: user.email,
      data: {
        accounts,
        investments,
        dealParticipants,
        transactions,
        people,
        debts,
        debtPayments,
        cashBuckets,
        cashBucketAllocations,
        cashBucketMovements,
        systemSettings,
      },
      metadata: {
        accountsCount: accounts.length,
        investmentsCount: investments.length,
        peopleCount: people.length,
        debtsCount: debts.length,
        cashBucketsCount: cashBuckets.length,
        transactionsCount: transactions.length,
      }
    }

    const filename = `backup-${new Date().toISOString().split('T')[0]}.json`
    
    return new NextResponse(JSON.stringify(backup, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    console.error('[BACKUP_ERROR]', error)
    return NextResponse.json(
      { error: 'Failed to create backup', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
