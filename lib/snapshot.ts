import { PrismaClient } from '@prisma/client'

export interface SnapshotData {
  investments?: any[]
  dealParticipants?: any[]
  cashBuckets?: any[]
  systemSettings?: any[]
  transactions?: any[]
  debts?: any[]
  debtPayments?: any[]
}

export interface CreateSnapshotOptions {
  label: string
  trigger: string
  userId?: string
  investmentId?: string
  debtId?: string
  personId?: string
}

export async function createSnapshot(
  tx: PrismaClient | any,
  options: CreateSnapshotOptions
): Promise<string> {
  const { label, trigger, userId, investmentId, debtId, personId } = options

  // Capture current state before any changes
  const snapshotData: SnapshotData = {}

  // Investment-related data
  if (investmentId) {
    snapshotData.investments = await tx.investment.findMany({
      where: { id: investmentId },
      include: {
        account: true,
        dealParticipants: { include: { person: true } },
        transactions: true,
        bucketAllocations: { include: { cashBucket: true } },
      },
    })

    snapshotData.dealParticipants = await tx.dealParticipant.findMany({
      where: { investmentId },
      include: { person: true },
    })

    snapshotData.transactions = await tx.transaction.findMany({
      where: { investmentId },
    })
  }

  // Debt-related data
  if (debtId) {
    snapshotData.debts = await tx.debt.findMany({
      where: { id: debtId },
      include: { payments: true, cashBucket: true },
    })

    snapshotData.debtPayments = await tx.debtPayment.findMany({
      where: { debtId },
    })
  }

  // Cash buckets (person-specific or all)
  const cashBucketWhere = personId ? { personId } : {}
  snapshotData.cashBuckets = await tx.cashBucket.findMany({
    where: cashBucketWhere,
    include: { movements: true, allocations: true },
  })

  // System settings (cash balances)
  const settingKeys = ['CASH_BALANCE']
  if (personId) {
    settingKeys.push(`CASH_BALANCE:${personId}`)
  }
  snapshotData.systemSettings = await tx.systemSetting.findMany({
    where: { key: { in: settingKeys } },
  })

  // Cash account transactions (recent ones that might be affected)
  const cashAccount = await tx.account.findFirst({
    where: { type: 'CASH' },
  })
  if (cashAccount) {
    const recentTransactions = await tx.transaction.findMany({
      where: {
        accountId: cashAccount.id,
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // Last 24 hours
      },
    })
    snapshotData.transactions = [
      ...(snapshotData.transactions || []),
      ...recentTransactions,
    ]
  }

  // Create snapshot record
  const snapshot = await tx.snapshot.create({
    data: {
      label,
      trigger,
      userId,
      data: JSON.stringify(snapshotData),
    },
  })

  return snapshot.id
}

export async function restoreSnapshot(
  tx: PrismaClient | any,
  snapshotId: string
): Promise<{ restored: boolean; changes: string[] }> {
  try {
    const snapshot = await tx.snapshot.findUnique({
      where: { id: snapshotId },
    })

    if (!snapshot) {
      throw new Error('Snapshot not found')
    }

    if (snapshot.restoredAt) {
      throw new Error('Snapshot already restored')
    }

    // Parse snapshot data safely
    let data: SnapshotData
    try {
      data = typeof snapshot.data === 'string'
        ? JSON.parse(snapshot.data)
        : snapshot.data
    } catch (parseErr) {
      console.error('SNAPSHOT PARSE ERROR:', parseErr)
      throw new Error(`Failed to parse snapshot data: ${String(parseErr)}`)
    }

    const changes: string[] = []

    // Restore investments
    if (data.investments && Array.isArray(data.investments)) {
      for (const inv of data.investments) {
        try {
          await tx.investment.upsert({
            where: { id: inv.id },
            update: {
              name: inv.name,
              category: inv.category,
              principalAmount: inv.principalAmount,
              realizedProfit: inv.realizedProfit,
              unrealizedProfit: inv.unrealizedProfit,
              startDate: inv.startDate,
              maturityDate: inv.maturityDate,
              interestRate: inv.interestRate,
              notes: inv.notes,
              metadata: inv.metadata,
              fees: inv.fees,
              totalReceived: inv.totalReceived,
              receivableAmount: inv.receivableAmount,
              isIjarah: inv.isIjarah,
            },
            create: inv,
          })
          changes.push(`Investment ${inv.name}: restored`)
        } catch (invErr) {
          console.error(`INVESTMENT RESTORE ERROR for ${inv.id}:`, invErr)
          changes.push(`Investment ${inv.name}: FAILED - ${String(invErr)}`)
        }
      }
    }

    // Restore deal participants (only if investment exists)
    if (data.dealParticipants && Array.isArray(data.dealParticipants)) {
      for (const dp of data.dealParticipants) {
        try {
          const investmentExists = await tx.investment.findUnique({
            where: { id: dp.investmentId },
          })
          if (!investmentExists) {
            console.warn(`SKIP DealParticipant ${dp.id}: Investment ${dp.investmentId} not found`)
            continue
          }

          await tx.dealParticipant.upsert({
            where: { id: dp.id },
            update: {
              investedAmount: dp.investedAmount,
              profit: dp.profit,
              receivable: dp.receivable,
              sharePercentage: dp.sharePercentage,
              acquiredAt: dp.acquiredAt,
              commissionFees: dp.commissionFees,
            },
            create: dp,
          })
          changes.push(`DealParticipant ${dp.id}: restored`)
        } catch (dpErr) {
          console.error(`DEAL PARTICIPANT RESTORE ERROR for ${dp.id}:`, dpErr)
          changes.push(`DealParticipant ${dp.id}: FAILED - ${String(dpErr)}`)
        }
      }
    }

    // Restore system settings
    if (data.systemSettings && Array.isArray(data.systemSettings)) {
      for (const setting of data.systemSettings) {
        try {
          await tx.systemSetting.upsert({
            where: { key: setting.key },
            update: { value: setting.value },
            create: setting,
          })
          changes.push(`SystemSetting ${setting.key}: ${setting.value}`)
        } catch (settingErr) {
          console.error(`SYSTEM SETTING RESTORE ERROR for ${setting.key}:`, settingErr)
          changes.push(`SystemSetting ${setting.key}: FAILED - ${String(settingErr)}`)
        }
      }
    }

    // Restore cash buckets
    if (data.cashBuckets && Array.isArray(data.cashBuckets)) {
      for (const bucket of data.cashBuckets) {
        try {
          await tx.cashBucket.upsert({
            where: { id: bucket.id },
            update: {
              amount: bucket.amount,
              currency: bucket.currency,
              label: bucket.label,
              haulStartDate: bucket.haulStartDate,
              lastZakatPaidDate: bucket.lastZakatPaidDate,
              excludeFromZakat: bucket.excludeFromZakat,
              notes: bucket.notes,
            },
            create: bucket,
          })
          changes.push(`CashBucket ${bucket.label}: restored`)
        } catch (bucketErr) {
          console.error(`CASH BUCKET RESTORE ERROR for ${bucket.id}:`, bucketErr)
          changes.push(`CashBucket ${bucket.label}: FAILED - ${String(bucketErr)}`)
        }
      }
    }

    // Restore debts (only if cash bucket exists if referenced)
    if (data.debts && Array.isArray(data.debts)) {
      for (const debt of data.debts) {
        try {
          if (debt.cashBucketId) {
            const bucketExists = await tx.cashBucket.findUnique({
              where: { id: debt.cashBucketId },
            })
            if (!bucketExists) {
              console.warn(`SKIP Debt ${debt.id}: CashBucket ${debt.cashBucketId} not found`)
              continue
            }
          }

          await tx.debt.upsert({
            where: { id: debt.id },
            update: {
              amount: debt.amount,
              description: debt.description,
              dueDate: debt.dueDate,
              notes: debt.notes,
              cashBucketId: debt.cashBucketId,
            },
            create: debt,
          })
          changes.push(`Debt ${debt.description}: restored`)
        } catch (debtErr) {
          console.error(`DEBT RESTORE ERROR for ${debt.id}:`, debtErr)
          changes.push(`Debt ${debt.description}: FAILED - ${String(debtErr)}`)
        }
      }
    }

    // Mark snapshot as restored
    await tx.snapshot.update({
      where: { id: snapshotId },
      data: { restoredAt: new Date() },
    })

    return { restored: true, changes }
  } catch (err) {
    console.error('RESTORE SNAPSHOT ERROR:', err)
    throw err
  }
}

export async function cleanupOldSnapshots(tx: PrismaClient | any): Promise<number> {
  // Delete snapshots older than 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  
  const deleted = await tx.snapshot.deleteMany({
    where: {
      createdAt: { lt: thirtyDaysAgo },
    },
  })

  // Keep only the most recent 100 snapshots
  const allSnapshots = await tx.snapshot.findMany({
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  })

  if (allSnapshots.length > 100) {
    const toDelete = allSnapshots.slice(100)
    await tx.snapshot.deleteMany({
      where: {
        id: { in: toDelete.map((s: any) => s.id) },
      },
    })
  }

  return deleted.count
}
