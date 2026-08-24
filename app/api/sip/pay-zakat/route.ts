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
    await requireModuleAccess('savings')
    const user = await getCurrentUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (user.role !== 'OWNER') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const sipId = typeof body.sipId === 'string' ? body.sipId : ''
    const periodKey = typeof body.periodKey === 'string' ? body.periodKey : ''
    const amount = Number(body.amount)
    const date = body.date ? new Date(body.date) : new Date()
    const periodStartAt = body.periodStartAt ? new Date(body.periodStartAt) : null
    const periodEndAt = body.periodEndAt ? new Date(body.periodEndAt) : null

    if (!sipId) {
      return NextResponse.json({ error: 'sipId is required' }, { status: 400 })
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

    const sip = await prisma.investment.findUnique({
      where: { id: sipId },
      include: { account: true },
    })

    if (!sip) {
      return NextResponse.json({ error: 'SIP portfolio not found' }, { status: 404 })
    }

    const metadata = (() => {
      try {
        return JSON.parse(sip.metadata || '{}')
      } catch {
        return {}
      }
    })()

    if (metadata.type !== 'SIP') {
      return NextResponse.json({ error: 'Invalid SIP portfolio' }, { status: 400 })
    }

    const updated = await prisma.$transaction(async (tx: any) => {
      const currency = sip.account?.currency || 'SAR'
      const notes = `SIP Zakat Payment • ${sip.name}`

      await withdrawFromBuckets(tx, {
        amount,
        currency,
        date,
        type: 'ZAKAT_PAID',
        investmentId: sipId,
        notes,
        availableOnOrBefore: date,
        // This route is owner-only (checked above) - never draw from a partner's bucket.
        personId: null,
      })

      await recomputeCashSetting(tx, user.role === 'OWNER' ? null : (user.personId || null))

      const cashAccount = await getCashAccount(tx, currency)
      await tx.transaction.create({
        data: {
          accountId: cashAccount.id,
          investmentId: sipId,
          personId: user.role === 'OWNER' ? null : (user.personId || null),
          type: 'ZAKAT_PAID',
          amount: -amount,
          date,
          description: notes,
          metadata: JSON.stringify({
            type: 'SIP',
            periodKey,
            periodStartAt: periodStartAt ? periodStartAt.toISOString() : null,
            periodEndAt: periodEndAt ? periodEndAt.toISOString() : null,
          }),
        },
      })

      const prevPayments = Array.isArray(metadata.zakatPayments) ? metadata.zakatPayments : []
      const nextPayments = [
        ...prevPayments,
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
        where: { id: sipId },
        data: {
          metadata: JSON.stringify({
            ...metadata,
            zakatPayments: nextPayments,
          }),
        },
        include: { account: true },
      })
    })

    await createAuditLog(user.id, 'UPDATE', 'INVESTMENT', sipId, {
      type: 'SIP',
      field: 'zakatPayments',
      periodKey,
      amount,
      date: date.toISOString(),
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error paying SIP zakat:', error)
    if (error instanceof Error && error.message === 'Module access denied') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }
    if (error instanceof Error && error.message === 'INSUFFICIENT_CASH') {
      return NextResponse.json({ error: 'Insufficient cash balance for selected date' }, { status: 400 })
    }
    return NextResponse.json({ error: 'Failed to pay SIP zakat' }, { status: 500 })
  }
}
