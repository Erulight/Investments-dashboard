import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { requireModuleAccess } from '@/lib/rbac'
import { createAuditLog } from '@/lib/audit'
import { withdrawFromBuckets } from '@/lib/cashBuckets'
import { recomputeCashSetting } from '@/lib/cashBalance'

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

export async function POST(request: Request) {
  try {
    await requireModuleAccess('crypto')
    const user = await getCurrentUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (user.role !== 'OWNER') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const cryptoId = typeof body.cryptoId === 'string' ? body.cryptoId : ''
    const amount = Number(body.amount)
    const date = body.date ? new Date(body.date) : new Date()

    if (!cryptoId) {
      return NextResponse.json({ error: 'cryptoId is required' }, { status: 400 })
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })
    }

    if (Number.isNaN(date.getTime())) {
      return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
    }

    const selectedDay = new Date(date.getFullYear(), date.getMonth(), date.getDate())
    const today = new Date()
    const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    if (selectedDay.getTime() > todayDay.getTime()) {
      return NextResponse.json({ error: 'Deposit date cannot be in the future' }, { status: 400 })
    }

    const inv = await prisma.investment.findUnique({
      where: { id: cryptoId },
      include: { account: true },
    })

    if (!inv) {
      return NextResponse.json({ error: 'Crypto portfolio not found' }, { status: 404 })
    }

    const metadata = (() => {
      try {
        return JSON.parse(inv.metadata || '{}')
      } catch {
        return {}
      }
    })()

    if (metadata.type !== 'CRYPTO_PORTFOLIO') {
      return NextResponse.json({ error: 'Invalid crypto portfolio' }, { status: 400 })
    }

    const portfolioStartAt = new Date(inv.startDate)
    const portfolioStartDay = new Date(
      portfolioStartAt.getFullYear(),
      portfolioStartAt.getMonth(),
      portfolioStartAt.getDate(),
    )
    if (!Number.isNaN(portfolioStartDay.getTime()) && selectedDay.getTime() < portfolioStartDay.getTime()) {
      return NextResponse.json({ error: 'Deposit date cannot be before portfolio start date' }, { status: 400 })
    }

    // Strict validation: ensure cash was actually available on or before the selected date.
    const currency = inv.account?.currency || 'SAR'
    const eligibleBuckets = await prisma.cashBucket.findMany({
      where: {
        currency,
        haulStartDate: { lte: date },
      },
      select: { id: true },
    })

    const eligibleBucketIds = eligibleBuckets.map((b: { id: string }) => b.id)
    const cashAtDateGroups = eligibleBucketIds.length
      ? await prisma.cashBucketMovement.groupBy({
          by: ['cashBucketId'],
          where: {
            cashBucketId: { in: eligibleBucketIds },
            date: { lte: date },
          },
          _sum: { amount: true },
        })
      : []

    const cashAvailableAtDate = cashAtDateGroups.reduce(
      (sum: number, row: { _sum: { amount: number | null } }) => sum + (row._sum.amount || 0),
      0
    )
    if (cashAvailableAtDate + 0.0001 < amount) {
      return NextResponse.json({ error: 'Insufficient cash available for selected date' }, { status: 400 })
    }

    const updated = await prisma.$transaction(async (tx: any) => {
      const notes = `Crypto Deposit • ${inv.name}`

      await withdrawFromBuckets(tx, {
        amount,
        currency,
        date,
        type: 'INVEST_OUT',
        investmentId: cryptoId,
        notes,
        availableOnOrBefore: date,
        // This route is owner-only (checked above) - never draw from a partner's bucket.
        personId: null,
      })

      await recomputeCashSetting(tx, null)

      const cashAccount = await getCashAccount(tx, currency)
      await tx.transaction.create({
        data: {
          accountId: cashAccount.id,
          investmentId: cryptoId,
          personId: user.role === 'OWNER' ? null : (user.personId || null),
          type: 'INVEST_OUT',
          amount: -amount,
          date,
          description: notes,
          metadata: JSON.stringify({
            type: 'CRYPTO_PORTFOLIO',
            action: 'DEPOSIT',
          }),
        },
      })

      const prevHistory = Array.isArray(metadata.history) ? metadata.history : []
      const prevInvested = Number(metadata.investedAmount ?? inv.principalAmount ?? 0)
      const nextInvested = prevInvested + amount

      return tx.investment.update({
        where: { id: cryptoId },
        data: {
          principalAmount: inv.principalAmount + amount,
          metadata: JSON.stringify({
            ...metadata,
            investedAmount: nextInvested,
            history: [
              ...prevHistory,
              {
                at: date.toISOString(),
                action: 'DEPOSIT',
                amount,
                investedAmount: nextInvested,
                currentValue: metadata.currentValue ?? inv.currentValue ?? 0,
              },
            ].slice(-200),
          }),
        },
        include: { account: true },
      })
    })

    await createAuditLog(user.id, 'UPDATE', 'INVESTMENT', cryptoId, {
      type: 'CRYPTO_PORTFOLIO',
      field: 'deposit',
      amount,
      date: date.toISOString(),
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error depositing into crypto:', error)
    if (error instanceof Error && error.message === 'Module access denied') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }
    if (error instanceof Error && error.message === 'INSUFFICIENT_CASH') {
      return NextResponse.json({ error: 'Insufficient cash balance for selected date' }, { status: 400 })
    }
    return NextResponse.json({ error: 'Failed to deposit' }, { status: 500 })
  }
}
