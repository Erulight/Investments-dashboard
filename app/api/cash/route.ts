import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import type { Prisma } from '@prisma/client'
import { requireAuth } from '@/lib/rbac'
import { createCashBucket, withdrawFromBuckets } from '@/lib/cashBuckets'

const CASH_BALANCE_KEY = 'CASH_BALANCE'

const getCashAccount = async (tx: Prisma.TransactionClient, currency = 'SAR') => {
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

export async function GET(req: NextRequest) {
  try {
    await requireAuth(['OWNER'])
    const { searchParams } = new URL(req.url)
    const yearParam = searchParams.get('year')
    const parsedYear = yearParam ? Number(yearParam) : NaN
    const selectedYear = Number.isFinite(parsedYear) ? parsedYear : new Date().getFullYear()
    const yearStart = new Date(selectedYear, 0, 1)
    const yearEnd = new Date(selectedYear + 1, 0, 1)

    const setting = await prisma.systemSetting.findUnique({
      where: { key: CASH_BALANCE_KEY },
    })
    const cashBalance = setting ? Number(setting.value) : 0

    const cashAccount = await prisma.account.findFirst({
      where: { type: 'CASH', isActive: true },
    })

    const buckets = await prisma.cashBucket.findMany({
      where: { balance: { gt: 0 } },
      orderBy: { haulStartDate: 'asc' },
      select: {
        id: true,
        label: true,
        balance: true,
        currency: true,
        haulStartDate: true,
        lastZakatPaidDate: true,
      },
    })

    const transactions = cashAccount
      ? await prisma.transaction.findMany({
          where: {
            accountId: cashAccount.id,
            date: { gte: yearStart, lt: yearEnd },
          },
          orderBy: { date: 'desc' },
          take: 10,
        })
      : []

    return NextResponse.json({
      cashBalance: Number.isFinite(cashBalance) ? cashBalance : 0,
      transactions,
      buckets,
      selectedYear,
    })
  } catch (error) {
    console.error('Cash balance fetch error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load cash balance' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth(['OWNER'])
    const body = await req.json()
    const direction = body.direction === 'OUT' ? 'OUT' : 'IN'
    const amount = Number(body.amount)
    const notes = typeof body.notes === 'string' ? body.notes : ''
    const date = body.date ? new Date(body.date) : new Date()
    const haulStartDate = body.haulStartDate ? new Date(body.haulStartDate) : date
    const label = typeof body.label === 'string' ? body.label : null
    const currency = typeof body.currency === 'string' && body.currency.trim()
      ? body.currency.trim().toUpperCase()
      : 'SAR'

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 })
    }

    const result = await prisma.$transaction(async (tx) => {
      const cashAccount = await getCashAccount(tx, currency)
      const setting = await tx.systemSetting.findUnique({
        where: { key: CASH_BALANCE_KEY },
      })
      const currentCash = setting ? Number(setting.value) : 0
      const delta = direction === 'IN' ? amount : -amount
      const nextCash = currentCash + delta

      if (nextCash < 0) {
        throw new Error('INSUFFICIENT_CASH')
      }

      if (setting) {
        await tx.systemSetting.update({
          where: { key: CASH_BALANCE_KEY },
          data: { value: nextCash.toString() },
        })
      } else {
        await tx.systemSetting.create({
          data: {
            key: CASH_BALANCE_KEY,
            value: nextCash.toString(),
            description: 'Available cash balance for investments',
          },
        })
      }

      if (direction === 'IN') {
        await createCashBucket(tx, {
          amount,
          haulStartDate,
          currency,
          label,
          date,
          notes,
          type: 'CASH_IN',
        })
      } else {
        await withdrawFromBuckets(tx, {
          amount,
          currency,
          date,
          type: 'CASH_OUT',
          notes,
        })
      }

      await tx.transaction.create({
        data: {
          accountId: cashAccount.id,
          investmentId: null,
          personId: null,
          type: direction === 'IN' ? 'CASH_IN' : 'CASH_OUT',
          amount: delta,
          date,
          description: notes || null,
        },
      })

      return nextCash
    })

    return NextResponse.json({ cashBalance: result })
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
