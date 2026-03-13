import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser()
    if (!user || user.role !== 'OWNER') {
      return NextResponse.json({ error: 'Unauthorized - Owner only' }, { status: 403 })
    }

    const backup = await req.json()

    if (!backup.version || !backup.data) {
      return NextResponse.json({ error: 'Invalid backup file format' }, { status: 400 })
    }

    // Validate backup structure
    const requiredTables = [
      'accounts', 'investments', 'dealParticipants', 'transactions',
      'people', 'debts', 'debtPayments', 'cashBuckets',
      'cashBucketAllocations', 'cashBucketMovements'
    ]

    for (const table of requiredTables) {
      if (!Array.isArray(backup.data[table])) {
        return NextResponse.json(
          { error: `Invalid backup: missing or invalid '${table}' data` },
          { status: 400 }
        )
      }
    }

    // Perform restore in a transaction
    await prisma.$transaction(async (tx) => {
      // Clear existing data (in reverse dependency order)
      await tx.cashBucketMovement.deleteMany({})
      await tx.investmentBucketAllocation.deleteMany({})
      await tx.cashBucket.deleteMany({})
      await tx.debtPayment.deleteMany({})
      await tx.debt.deleteMany({})
      await tx.transaction.deleteMany({})
      await tx.dealParticipant.deleteMany({})
      await tx.investment.deleteMany({})
      await tx.account.deleteMany({ where: { type: { not: 'CASH' } } })
      await tx.person.deleteMany({})

      // Restore data (in dependency order)
      if (backup.data.people.length > 0) {
        await tx.person.createMany({ data: backup.data.people, skipDuplicates: true })
      }

      if (backup.data.accounts.length > 0) {
        await tx.account.createMany({ data: backup.data.accounts, skipDuplicates: true })
      }

      if (backup.data.investments.length > 0) {
        await tx.investment.createMany({ data: backup.data.investments, skipDuplicates: true })
      }

      if (backup.data.dealParticipants.length > 0) {
        await tx.dealParticipant.createMany({ data: backup.data.dealParticipants, skipDuplicates: true })
      }

      if (backup.data.transactions.length > 0) {
        await tx.transaction.createMany({ data: backup.data.transactions, skipDuplicates: true })
      }

      if (backup.data.debts.length > 0) {
        await tx.debt.createMany({ data: backup.data.debts, skipDuplicates: true })
      }

      if (backup.data.debtPayments.length > 0) {
        await tx.debtPayment.createMany({ data: backup.data.debtPayments, skipDuplicates: true })
      }

      if (backup.data.cashBuckets.length > 0) {
        await tx.cashBucket.createMany({ data: backup.data.cashBuckets, skipDuplicates: true })
      }

      if (backup.data.cashBucketAllocations.length > 0) {
        await tx.investmentBucketAllocation.createMany({ data: backup.data.cashBucketAllocations, skipDuplicates: true })
      }

      if (backup.data.cashBucketMovements.length > 0) {
        await tx.cashBucketMovement.createMany({ data: backup.data.cashBucketMovements, skipDuplicates: true })
      }

      // Restore system settings (only non-auth settings)
      if (backup.data.systemSettings && backup.data.systemSettings.length > 0) {
        const safeSettings = backup.data.systemSettings.filter((s: any) => 
          !s.key.includes('auth') && !s.key.includes('password') && !s.key.includes('token')
        )
        if (safeSettings.length > 0) {
          await tx.systemSetting.createMany({ data: safeSettings, skipDuplicates: true })
        }
      }
    })

    return NextResponse.json({
      success: true,
      message: 'Backup restored successfully',
      restoredCounts: {
        accounts: backup.data.accounts.length,
        investments: backup.data.investments.length,
        people: backup.data.people.length,
        debts: backup.data.debts.length,
        cashBuckets: backup.data.cashBuckets.length,
        transactions: backup.data.transactions.length,
      }
    })
  } catch (error) {
    console.error('[RESTORE_ERROR]', error)
    return NextResponse.json(
      { error: 'Failed to restore backup', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
