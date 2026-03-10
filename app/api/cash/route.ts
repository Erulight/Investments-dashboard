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

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(['OWNER', 'PARTNER'])
    if (user.role === 'PARTNER' && !user.personId) {
      return NextResponse.json({ error: 'Partner is missing a person profile' }, { status: 400 })
    }
    const { searchParams } = new URL(req.url)
    const yearParam = searchParams.get('year')
    const parsedYear = yearParam ? Number(yearParam) : NaN
    const selectedYear = Number.isFinite(parsedYear) ? parsedYear : new Date().getFullYear()
    const yearStart = new Date(selectedYear, 0, 1)
    const yearEnd = new Date(selectedYear + 1, 0, 1)

    const cashAccount = await prisma.account.findFirst({
      where: { type: 'CASH', isActive: true },
    })

    // For partners, cash buckets are the source of truth.
    // Transaction history can be incomplete in older flows, so settings are treated as derived values.
    if (user.role === 'PARTNER') {
      const bucketSum = await getBucketCashBalance(prisma, user.personId)

      const buckets = await prisma.cashBucket.findMany({
        where: {
          balance: { gt: 0 },
          personId: user.personId,
          NOT: [
            { label: { startsWith: 'Debt •' } },
            { label: 'Partner Commission' },
          ],
        } as any,
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

      const cashAccount = await prisma.account.findFirst({
        where: { type: 'CASH', isActive: true },
      })

      const transactions = cashAccount
        ? await prisma.transaction.findMany({
            where: {
              accountId: cashAccount.id,
              personId: user.personId,
              date: { gte: yearStart, lt: yearEnd },
            },
            orderBy: { date: 'desc' },
            take: 10,
          })
        : []

      return NextResponse.json({
        cashBalance: bucketSum,
        cashAtStart: bucketSum,
        cashAtEnd: bucketSum,
        transactions,
        buckets,
        selectedYear,
      })
    }

    const ownerSetting = await prisma.systemSetting.findUnique({ where: { key: CASH_BALANCE_KEY } })
    const ownerSettingValue = Number(ownerSetting?.value || 0)
    const ownerBucketBalance = await getBucketCashBalance(prisma, null)

    const ownerTxScope = user.personId
      ? ({ OR: [{ personId: null }, { personId: user.personId }] } as any)
      : ({ personId: null } as any)

    const allCashTxSum = cashAccount
      ? (
          await prisma.transaction.aggregate({
            where: { accountId: cashAccount.id, ...ownerTxScope },
            _sum: { amount: true },
          })
        )._sum.amount || 0
      : 0

    const offset = ownerBucketBalance - (Number.isFinite(allCashTxSum) ? allCashTxSum : 0)

    const cashAtStart = cashAccount
      ? (
          await prisma.transaction.aggregate({
            where: { accountId: cashAccount.id, date: { lt: yearStart }, ...ownerTxScope },
            _sum: { amount: true },
          })
        )._sum.amount || 0
      : 0

    const cashAtEnd = cashAccount
      ? (
          await prisma.transaction.aggregate({
            where: { accountId: cashAccount.id, date: { lt: yearEnd }, ...ownerTxScope },
            _sum: { amount: true },
          })
        )._sum.amount || 0
      : 0

    const cashBalance = ownerBucketBalance

    const buckets = await prisma.cashBucket.findMany({
      where: {
        balance: { gt: 0 },
        personId: null,
      },
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
            ...ownerTxScope,
            date: { gte: yearStart, lt: yearEnd },
          },
          orderBy: { date: 'desc' },
          take: 10,
        })
      : []

    return NextResponse.json({
      cashBalance: Number.isFinite(cashBalance) ? cashBalance : 0,
      cashAtStart: offset + (Number.isFinite(cashAtStart) ? cashAtStart : 0),
      cashAtEnd: Number.isFinite(cashBalance) ? cashBalance : 0,
      settingDelta: Number.isFinite(ownerSettingValue)
        ? ownerSettingValue - ownerBucketBalance
        : 0,
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
    const user = await requireAuth(['OWNER', 'PARTNER'])
    if (user.role === 'PARTNER' && !user.personId) {
      return NextResponse.json({ error: 'Partner is missing a person profile' }, { status: 400 })
    }
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

    if (Number.isNaN(date.getTime())) {
      return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
    }

    if (Number.isNaN(haulStartDate.getTime())) {
      return NextResponse.json({ error: 'Invalid haul start date' }, { status: 400 })
    }

    const today = new Date()
    if (date.getTime() > today.getTime()) {
      return NextResponse.json({ error: 'Date cannot be in the future' }, { status: 400 })
    }

    if (direction === 'IN' && haulStartDate.getTime() > date.getTime()) {
      return NextResponse.json({ error: 'Haul start date cannot be after entry date' }, { status: 400 })
    }

    const scopePersonId = user.role === 'OWNER' ? null : user.personId!

    const result = await prisma.$transaction(async (tx: any) => {
      const cashAccount = await getCashAccount(tx, currency)
      const delta = direction === 'IN' ? amount : -amount

      if (direction === 'IN') {
        await createCashBucket(tx, {
          amount,
          haulStartDate,
          currency,
          label,
          date,
          notes,
          type: 'CASH_IN',
          personId: scopePersonId,
        })
      } else {
        await withdrawFromBuckets(tx, {
          amount,
          currency,
          date,
          type: 'CASH_OUT',
          notes,
          availableOnOrBefore: date,
          personId: scopePersonId,
        })
      }

      await tx.transaction.create({
        data: {
          accountId: cashAccount.id,
          investmentId: null,
          personId: scopePersonId,
          type: direction === 'IN' ? 'CASH_IN' : 'CASH_OUT',
          amount: delta,
          date,
          description: notes || null,
        },
      })

      return recomputeCashSetting(tx, scopePersonId)
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
