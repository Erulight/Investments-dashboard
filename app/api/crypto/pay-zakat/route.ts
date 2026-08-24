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
    const periodKey = typeof body.periodKey === 'string' ? body.periodKey : ''
    const amount = Number(body.amount)
    const date = body.date ? new Date(body.date) : new Date()
    const periodStartAt = body.periodStartAt ? new Date(body.periodStartAt) : null
    const periodEndAt = body.periodEndAt ? new Date(body.periodEndAt) : null

    if (!cryptoId) {
      return NextResponse.json({ error: 'cryptoId is required' }, { status: 400 })
    }

    if (!periodKey) {
      return NextResponse.json({ error: 'periodKey is required' }, { status: 400 })
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })
    }

    if (Number.isNaN(date.getTime())) {
      return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
    }

    if (periodStartAt && Number.isNaN(periodStartAt.getTime())) {
      return NextResponse.json({ error: 'Invalid periodStartAt' }, { status: 400 })
    }

    if (periodEndAt && Number.isNaN(periodEndAt.getTime())) {
      return NextResponse.json({ error: 'Invalid periodEndAt' }, { status: 400 })
    }

    const paymentDay = new Date(date.getFullYear(), date.getMonth(), date.getDate())
    const today = new Date()
    const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    if (paymentDay.getTime() > todayDay.getTime()) {
      return NextResponse.json({ error: 'Payment date cannot be in the future' }, { status: 400 })
    }

    if (periodStartAt && periodEndAt && periodStartAt.getTime() > periodEndAt.getTime()) {
      return NextResponse.json({ error: 'periodStartAt cannot be after periodEndAt' }, { status: 400 })
    }

    if (periodEndAt) {
      const periodEndDay = new Date(periodEndAt.getFullYear(), periodEndAt.getMonth(), periodEndAt.getDate())
      if (paymentDay.getTime() < periodEndDay.getTime()) {
        return NextResponse.json({ error: 'Payment date cannot be before period end date' }, { status: 400 })
      }
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

    const previousPayments = Array.isArray(metadata.zakatPayments) ? metadata.zakatPayments : []
    if (previousPayments.some((payment: any) => payment?.periodKey === periodKey)) {
      return NextResponse.json({ error: 'Zakat is already paid for this period' }, { status: 400 })
    }

    const updated = await prisma.$transaction(async (tx: any) => {
      const currency = inv.account?.currency || 'SAR'
      const notes = `Crypto Zakat Payment • ${inv.name}`

      await withdrawFromBuckets(tx, {
        amount,
        currency,
        date,
        type: 'ZAKAT_PAID',
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
          type: 'ZAKAT_PAID',
          amount: -amount,
          date,
          description: notes,
          metadata: JSON.stringify({
            type: 'CRYPTO_PORTFOLIO',
            periodKey,
            periodStartAt: periodStartAt ? periodStartAt.toISOString() : null,
            periodEndAt: periodEndAt ? periodEndAt.toISOString() : null,
          }),
        },
      })

      const nextPayments = [
        ...previousPayments,
        {
          id: crypto.randomUUID(),
          periodKey,
          amount,
          date: date.toISOString(),
          periodStartAt: periodStartAt ? periodStartAt.toISOString() : null,
          periodEndAt: periodEndAt ? periodEndAt.toISOString() : null,
        },
      ].slice(-200)

      return tx.investment.update({
        where: { id: cryptoId },
        data: {
          metadata: JSON.stringify({
            ...metadata,
            zakatPayments: nextPayments,
          }),
        },
        include: { account: true },
      })
    })

    await createAuditLog(user.id, 'UPDATE', 'INVESTMENT', cryptoId, {
      type: 'CRYPTO_PORTFOLIO',
      field: 'zakatPayments',
      periodKey,
      amount,
      date: date.toISOString(),
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error paying crypto zakat:', error)
    if (error instanceof Error && error.message === 'Module access denied') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }
    if (error instanceof Error && error.message === 'INSUFFICIENT_CASH') {
      return NextResponse.json({ error: 'Insufficient cash balance for selected date' }, { status: 400 })
    }
    return NextResponse.json({ error: 'Failed to pay zakat' }, { status: 500 })
  }
}
