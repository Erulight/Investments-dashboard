import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'
import { createCashBucket, withdrawFromBuckets } from '@/lib/cashBuckets'
import { CASH_BALANCE_KEY, getBucketCashBalance, recomputeCashSetting } from '@/lib/cashBalance'

const getCashAccount = async (tx: any, currency = 'SAR') => {
  const existing = await tx.account.findFirst({
    where: { type: 'CASH', isActive: true },
  })
  if (existing) return existing
  return tx.account.create({
    data: {
      name: 'Cash Balance',
      type: 'CASH',
      currency,
      description: 'Cash ledger account',
    },
  })
}

export async function GET() {
  try {
    await requireAuth(['OWNER'])
    const bucketCash = await getBucketCashBalance(prisma, null)
    const setting = await prisma.systemSetting.findUnique({ where: { key: CASH_BALANCE_KEY } })
    const settingValue = Number(setting?.value || 0)

    if (!setting || Math.abs(settingValue - bucketCash) > 0.0001) {
      await recomputeCashSetting(prisma, null)
    }

    return NextResponse.json({
      cashBalance: bucketCash,
      settingDelta: Number.isFinite(settingValue) ? settingValue - bucketCash : 0,
    })
  } catch (error) {
    console.error('Cash balance fetch error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load cash balance' },
      { status: 500 }
    )
  }
}

export async function PUT(req: NextRequest) {
  try {
    await requireAuth(['OWNER'])
    const body = await req.json().catch(() => ({}))
    const cashBalance = Number(body.cashBalance)

    if (!Number.isFinite(cashBalance) || cashBalance < 0) {
      return NextResponse.json(
        { error: 'Cash balance must be a positive number' },
        { status: 400 }
      )
    }

    const currentBucketCash = await getBucketCashBalance(prisma, null)
    const delta = cashBalance - currentBucketCash
    if (Math.abs(delta) <= 0.0001) {
      const synced = await prisma.$transaction(async (tx: any) => {
        return recomputeCashSetting(tx, null)
      })
      return NextResponse.json({ cashBalance: synced, appliedDelta: 0 })
    }

    const now = new Date()
    const entryDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    const updatedCash = await prisma.$transaction(async (tx: any) => {
      const cashAccount = await getCashAccount(tx, 'SAR')
      if (delta > 0) {
        await createCashBucket(tx, {
          amount: delta,
          haulStartDate: entryDate,
          currency: cashAccount.currency || 'SAR',
          label: 'Settings Cash Sync',
          date: entryDate,
          notes: 'Manual cash sync from settings',
          type: 'CASH_IN',
          personId: null,
        })

        await tx.transaction.create({
          data: {
            accountId: cashAccount.id,
            investmentId: null,
            personId: null,
            type: 'CASH_IN',
            amount: delta,
            date: entryDate,
            description: 'Settings cash sync increase',
          },
        })
      } else {
        const withdrawalAmount = Math.abs(delta)
        await withdrawFromBuckets(tx, {
          amount: withdrawalAmount,
          currency: cashAccount.currency || 'SAR',
          date: entryDate,
          type: 'CASH_OUT',
          notes: 'Settings cash sync decrease',
          personId: null,
        })

        await tx.transaction.create({
          data: {
            accountId: cashAccount.id,
            investmentId: null,
            personId: null,
            type: 'CASH_OUT',
            amount: -withdrawalAmount,
            date: entryDate,
            description: 'Settings cash sync decrease',
          },
        })
      }

      return recomputeCashSetting(tx, null)
    })

    return NextResponse.json({ cashBalance: updatedCash, appliedDelta: delta })
  } catch (error) {
    console.error('Cash balance update error:', error)

    if (error instanceof Error && error.message === 'INSUFFICIENT_CASH') {
      return NextResponse.json(
        { error: 'Insufficient cash balance' },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update cash balance' },
      { status: 500 }
    )
  }
}
