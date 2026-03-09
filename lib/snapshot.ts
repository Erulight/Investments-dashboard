import { PrismaClient } from '@prisma/client'

export interface SnapshotData {
  version?: number
  mode?: 'FULL' | 'SCOPED'
  accounts?: any[]
  persons?: any[]
  investments?: any[]
  dealParticipants?: any[]
  cashBuckets?: any[]
  cashBucketMovements?: any[]
  investmentBucketAllocations?: any[]
  systemSettings?: any[]
  transactions?: any[]
  valuations?: any[]
  recoveryAssumptions?: any[]
  goals?: any[]
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
  const { label, trigger, userId } = options

  // Capture full financial state so any restore point can fully roll back the app state.
  const snapshotData: SnapshotData = {
    version: 2,
    mode: 'FULL',
    accounts: await tx.account.findMany(),
    persons: await tx.person.findMany(),
    investments: await tx.investment.findMany(),
    dealParticipants: await tx.dealParticipant.findMany(),
    cashBuckets: await tx.cashBucket.findMany(),
    cashBucketMovements: await tx.cashBucketMovement.findMany(),
    investmentBucketAllocations: await tx.investmentBucketAllocation.findMany(),
    systemSettings: await tx.systemSetting.findMany(),
    transactions: await tx.transaction.findMany(),
    valuations: await tx.valuation.findMany(),
    recoveryAssumptions: await tx.recoveryAssumption.findMany(),
    goals: await tx.goal.findMany(),
    debts: await tx.debt.findMany(),
    debtPayments: await tx.debtPayment.findMany(),
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
    const mode = data.mode === 'FULL' ? 'FULL' : 'SCOPED'

    const list = (rows: any): any[] => (Array.isArray(rows) ? rows : [])
    const toDate = (v: any): Date | null => {
      if (!v) return null
      const d = v instanceof Date ? v : new Date(v)
      return Number.isNaN(d.getTime()) ? null : d
    }
    const num = (v: any, fallback = 0): number => {
      const n = Number(v)
      return Number.isFinite(n) ? n : fallback
    }

    const accounts = list(data.accounts)
    const persons = list(data.persons)
    const investments = list(data.investments)
    const dealParticipants = list(data.dealParticipants)
    const cashBuckets = list(data.cashBuckets)
    const cashBucketMovements = list(data.cashBucketMovements)
    const investmentBucketAllocations = list(data.investmentBucketAllocations)
    const systemSettings = list(data.systemSettings)
    const transactions = list(data.transactions)
    const valuations = list(data.valuations)
    const recoveryAssumptions = list(data.recoveryAssumptions)
    const goals = list(data.goals)
    const debts = list(data.debts)
    const debtPayments = list(data.debtPayments)

    for (const account of accounts) {
      const createData = {
        id: account.id,
        name: account.name,
        type: account.type,
        description: account.description ?? null,
        currency: account.currency ?? 'SAR',
        isActive: !!account.isActive,
        metadata: account.metadata ?? null,
        createdAt: toDate(account.createdAt) ?? new Date(),
      }
      await tx.account.upsert({
        where: { id: account.id },
        update: {
          name: createData.name,
          type: createData.type,
          description: createData.description,
          currency: createData.currency,
          isActive: createData.isActive,
          metadata: createData.metadata,
        },
        create: createData,
      })
    }

    for (const person of persons) {
      const createData = {
        id: person.id,
        name: person.name,
        email: person.email ?? null,
        phone: person.phone ?? null,
        createdAt: toDate(person.createdAt) ?? new Date(),
      }
      await tx.person.upsert({
        where: { id: person.id },
        update: {
          name: createData.name,
          email: createData.email,
          phone: createData.phone,
        },
        create: createData,
      })
    }

    for (const inv of investments) {
      const createData = {
        id: inv.id,
        accountId: inv.accountId,
        name: inv.name,
        category: inv.category ?? null,
        principalAmount: num(inv.principalAmount),
        currentValue: num(inv.currentValue),
        realizedProfit: num(inv.realizedProfit),
        unrealizedProfit: num(inv.unrealizedProfit),
        startDate: toDate(inv.startDate) ?? new Date(),
        maturityDate: toDate(inv.maturityDate),
        interestRate: inv.interestRate != null ? num(inv.interestRate) : null,
        notes: inv.notes ?? null,
        metadata: inv.metadata ?? null,
        fees: num(inv.fees),
        totalReceived: num(inv.totalReceived),
        receivableAmount: num(inv.receivableAmount),
        isIjarah: !!inv.isIjarah,
        reopenedAt: toDate(inv.reopenedAt),
        createdAt: toDate(inv.createdAt) ?? new Date(),
      }
      await tx.investment.upsert({
        where: { id: inv.id },
        update: {
          accountId: createData.accountId,
          name: createData.name,
          category: createData.category,
          principalAmount: createData.principalAmount,
          currentValue: createData.currentValue,
          realizedProfit: createData.realizedProfit,
          unrealizedProfit: createData.unrealizedProfit,
          startDate: createData.startDate,
          maturityDate: createData.maturityDate,
          interestRate: createData.interestRate,
          notes: createData.notes,
          metadata: createData.metadata,
          fees: createData.fees,
          totalReceived: createData.totalReceived,
          receivableAmount: createData.receivableAmount,
          isIjarah: createData.isIjarah,
          reopenedAt: createData.reopenedAt,
        },
        create: createData,
      })
      changes.push(`Investment ${createData.name}: restored`)
    }

    for (const bucket of cashBuckets) {
      const createData = {
        id: bucket.id,
        label: bucket.label ?? null,
        currency: bucket.currency ?? 'SAR',
        haulStartDate: toDate(bucket.haulStartDate) ?? new Date(),
        lastZakatPaidDate: toDate(bucket.lastZakatPaidDate),
        balance: num(bucket.balance ?? bucket.amount),
        excludeFromZakat: !!bucket.excludeFromZakat,
        personId: bucket.personId ?? null,
        createdAt: toDate(bucket.createdAt) ?? new Date(),
      }
      await tx.cashBucket.upsert({
        where: { id: bucket.id },
        update: {
          label: createData.label,
          currency: createData.currency,
          haulStartDate: createData.haulStartDate,
          lastZakatPaidDate: createData.lastZakatPaidDate,
          balance: createData.balance,
          excludeFromZakat: createData.excludeFromZakat,
          personId: createData.personId,
        },
        create: createData,
      })
      changes.push(`CashBucket ${createData.label || createData.id}: restored`)
    }

    for (const dp of dealParticipants) {
      const createData = {
        id: dp.id,
        investmentId: dp.investmentId,
        personId: dp.personId,
        investedAmount: num(dp.investedAmount),
        currentValue: num(dp.currentValue),
        receivable: num(dp.receivable),
        profit: num(dp.profit),
        sharePercentage: dp.sharePercentage != null ? num(dp.sharePercentage) : null,
        notes: dp.notes ?? null,
        acquiredAt: toDate(dp.acquiredAt),
        commissionFees: num(dp.commissionFees),
        createdAt: toDate(dp.createdAt) ?? new Date(),
      }
      await tx.dealParticipant.upsert({
        where: { id: dp.id },
        update: {
          investmentId: createData.investmentId,
          personId: createData.personId,
          investedAmount: createData.investedAmount,
          currentValue: createData.currentValue,
          receivable: createData.receivable,
          profit: createData.profit,
          sharePercentage: createData.sharePercentage,
          notes: createData.notes,
          acquiredAt: createData.acquiredAt,
          commissionFees: createData.commissionFees,
        },
        create: createData,
      })
      changes.push(`DealParticipant ${createData.id}: restored`)
    }

    for (const setting of systemSettings) {
      const createData = {
        id: setting.id,
        key: setting.key,
        value: String(setting.value ?? ''),
        description: setting.description ?? null,
        createdAt: toDate(setting.createdAt) ?? new Date(),
      }
      await tx.systemSetting.upsert({
        where: { key: createData.key },
        update: {
          value: createData.value,
          description: createData.description,
        },
        create: createData,
      })
      changes.push(`SystemSetting ${createData.key}: restored`)
    }

    for (const debt of debts) {
      const createData = {
        id: debt.id,
        lenderName: debt.lenderName ?? debt.description ?? 'Unknown',
        amount: num(debt.amount),
        borrowedAt: toDate(debt.borrowedAt ?? debt.dueDate) ?? new Date(),
        notes: debt.notes ?? null,
        isArchived: !!debt.isArchived,
        cashBucketId: debt.cashBucketId ?? null,
        createdAt: toDate(debt.createdAt) ?? new Date(),
      }
      await tx.debt.upsert({
        where: { id: debt.id },
        update: {
          lenderName: createData.lenderName,
          amount: createData.amount,
          borrowedAt: createData.borrowedAt,
          notes: createData.notes,
          isArchived: createData.isArchived,
          cashBucketId: createData.cashBucketId,
        },
        create: createData,
      })
      changes.push(`Debt ${createData.lenderName}: restored`)
    }

    for (const payment of debtPayments) {
      const createData = {
        id: payment.id,
        debtId: payment.debtId,
        amount: num(payment.amount),
        paidAt: toDate(payment.paidAt) ?? new Date(),
        notes: payment.notes ?? null,
        createdAt: toDate(payment.createdAt) ?? new Date(),
      }
      await tx.debtPayment.upsert({
        where: { id: payment.id },
        update: {
          debtId: createData.debtId,
          amount: createData.amount,
          paidAt: createData.paidAt,
          notes: createData.notes,
        },
        create: createData,
      })
    }

    for (const movement of cashBucketMovements) {
      const createData = {
        id: movement.id,
        cashBucketId: movement.cashBucketId,
        investmentId: movement.investmentId ?? null,
        amount: num(movement.amount),
        type: movement.type,
        date: toDate(movement.date) ?? new Date(),
        notes: movement.notes ?? null,
        createdAt: toDate(movement.createdAt) ?? new Date(),
      }
      await tx.cashBucketMovement.upsert({
        where: { id: movement.id },
        update: {
          cashBucketId: createData.cashBucketId,
          investmentId: createData.investmentId,
          amount: createData.amount,
          type: createData.type,
          date: createData.date,
          notes: createData.notes,
        },
        create: createData,
      })
    }

    for (const allocation of investmentBucketAllocations) {
      const createData = {
        id: allocation.id,
        investmentId: allocation.investmentId,
        cashBucketId: allocation.cashBucketId,
        principalAllocated: num(allocation.principalAllocated),
        principalRemaining: num(allocation.principalRemaining),
        createdAt: toDate(allocation.createdAt) ?? new Date(),
      }
      await tx.investmentBucketAllocation.upsert({
        where: { id: allocation.id },
        update: {
          investmentId: createData.investmentId,
          cashBucketId: createData.cashBucketId,
          principalAllocated: createData.principalAllocated,
          principalRemaining: createData.principalRemaining,
        },
        create: createData,
      })
    }

    for (const txRow of transactions) {
      const createData = {
        id: txRow.id,
        accountId: txRow.accountId,
        investmentId: txRow.investmentId ?? null,
        personId: txRow.personId ?? null,
        type: txRow.type,
        amount: num(txRow.amount),
        date: toDate(txRow.date) ?? new Date(),
        description: txRow.description ?? null,
        metadata: txRow.metadata ?? null,
        createdAt: toDate(txRow.createdAt) ?? new Date(),
      }
      await tx.transaction.upsert({
        where: { id: txRow.id },
        update: {
          accountId: createData.accountId,
          investmentId: createData.investmentId,
          personId: createData.personId,
          type: createData.type,
          amount: createData.amount,
          date: createData.date,
          description: createData.description,
          metadata: createData.metadata,
        },
        create: createData,
      })
    }

    for (const valuation of valuations) {
      const createData = {
        id: valuation.id,
        accountId: valuation.accountId,
        date: toDate(valuation.date) ?? new Date(),
        navPerUnit: num(valuation.navPerUnit),
        totalValue: num(valuation.totalValue),
        notes: valuation.notes ?? null,
        createdAt: toDate(valuation.createdAt) ?? new Date(),
      }
      await tx.valuation.upsert({
        where: { id: valuation.id },
        update: {
          accountId: createData.accountId,
          date: createData.date,
          navPerUnit: createData.navPerUnit,
          totalValue: createData.totalValue,
          notes: createData.notes,
        },
        create: createData,
      })
    }

    for (const assumption of recoveryAssumptions) {
      const createData = {
        id: assumption.id,
        status: assumption.status,
        recoveryRate: num(assumption.recoveryRate),
        description: assumption.description ?? null,
        createdAt: toDate(assumption.createdAt) ?? new Date(),
      }
      await tx.recoveryAssumption.upsert({
        where: { status: createData.status },
        update: {
          recoveryRate: createData.recoveryRate,
          description: createData.description,
        },
        create: createData,
      })
    }

    for (const goal of goals) {
      const createData = {
        id: goal.id,
        name: goal.name,
        targetAmount: num(goal.targetAmount),
        currentAmount: num(goal.currentAmount),
        targetDate: toDate(goal.targetDate),
        category: goal.category ?? null,
        notes: goal.notes ?? null,
        createdAt: toDate(goal.createdAt) ?? new Date(),
      }
      await tx.goal.upsert({
        where: { id: goal.id },
        update: {
          name: createData.name,
          targetAmount: createData.targetAmount,
          currentAmount: createData.currentAmount,
          targetDate: createData.targetDate,
          category: createData.category,
          notes: createData.notes,
        },
        create: createData,
      })
    }

    if (mode === 'FULL') {
      const idList = (rows: any[]) => rows.map((row) => row.id).filter(Boolean)
      const keyList = (rows: any[]) => rows.map((row) => row.key).filter(Boolean)
      const statusList = (rows: any[]) => rows.map((row) => row.status).filter(Boolean)

      await tx.debtPayment.deleteMany({ where: { id: { notIn: idList(debtPayments) } } })
      await tx.dealParticipant.deleteMany({ where: { id: { notIn: idList(dealParticipants) } } })
      await tx.cashBucketMovement.deleteMany({ where: { id: { notIn: idList(cashBucketMovements) } } })
      await tx.investmentBucketAllocation.deleteMany({ where: { id: { notIn: idList(investmentBucketAllocations) } } })
      await tx.transaction.deleteMany({ where: { id: { notIn: idList(transactions) } } })
      await tx.valuation.deleteMany({ where: { id: { notIn: idList(valuations) } } })
      await tx.debt.deleteMany({ where: { id: { notIn: idList(debts) } } })
      await tx.investment.deleteMany({ where: { id: { notIn: idList(investments) } } })
      await tx.cashBucket.deleteMany({ where: { id: { notIn: idList(cashBuckets) } } })
      await tx.goal.deleteMany({ where: { id: { notIn: idList(goals) } } })
      await tx.recoveryAssumption.deleteMany({ where: { status: { notIn: statusList(recoveryAssumptions) } } })
      await tx.systemSetting.deleteMany({ where: { key: { notIn: keyList(systemSettings) } } })
      changes.push('Full state sync completed (extra rows removed)')
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
