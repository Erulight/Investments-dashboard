import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'
import { withdrawFromBuckets } from '@/lib/cashBuckets'
import { recomputeCashSetting } from '@/lib/cashBalance'

const getCashAccount = async (tx: any, currency = 'SAR') => {
  const existing = await tx.account.findFirst({ where: { type: 'CASH', isActive: true } })
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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(['OWNER'])
    const { id } = await params
    const body = await req.json().catch(() => ({}))

    const amount = Number(body.amount)
    const paidAt = body.paidAt ? new Date(body.paidAt) : new Date()
    const notes = typeof body.notes === 'string' ? body.notes : ''

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 })
    }
    if (Number.isNaN(paidAt.getTime())) {
      return NextResponse.json({ error: 'Invalid paidAt' }, { status: 400 })
    }
    const today = new Date()
    const paidDay = new Date(paidAt.getFullYear(), paidAt.getMonth(), paidAt.getDate())
    const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    if (paidDay.getTime() > todayDay.getTime()) {
      return NextResponse.json({ error: 'Payment date cannot be in the future' }, { status: 400 })
    }

    const result = await prisma.$transaction(async (tx: any) => {
      const debt = await tx.debt.findUnique({
        where: { id },
        include: {
          payments: true,
          cashBucket: true,
        },
      })

      if (!debt) {
        return NextResponse.json({ error: 'Debt not found' }, { status: 404 })
      }
      if (debt.isArchived) {
        return NextResponse.json({ error: 'Cannot pay an archived debt' }, { status: 400 })
      }

      const borrowedAt = new Date(debt.borrowedAt)
      const borrowedDay = new Date(borrowedAt.getFullYear(), borrowedAt.getMonth(), borrowedAt.getDate())
      if (paidDay.getTime() < borrowedDay.getTime()) {
        return NextResponse.json({ error: 'Payment date cannot be before borrowed date' }, { status: 400 })
      }

      const totalPaidBefore = debt.payments.reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0)
      const outstandingBefore = Math.max(0, Number(debt.amount) - totalPaidBefore)
      if (amount > outstandingBefore + 0.000001) {
        return NextResponse.json({ error: 'Payment exceeds outstanding amount' }, { status: 400 })
      }

      const currency = debt.cashBucket?.currency || 'SAR'

      await withdrawFromBuckets(tx, {
        amount,
        currency,
        date: paidAt,
        type: 'CASH_OUT',
        notes: `Debt payment • ${debt.lenderName}`,
        availableOnOrBefore: paidAt,
      })

      const payment = await tx.debtPayment.create({
        data: {
          debtId: debt.id,
          amount,
          paidAt,
          notes: notes || null,
        },
      })

      const cashAccount = await getCashAccount(tx, currency)
      await tx.transaction.create({
        data: {
          accountId: cashAccount.id,
          investmentId: null,
          personId: null,
          type: 'DEBT_PAYMENT',
          amount: -Math.abs(amount),
          date: paidAt,
          description: notes || `Debt payment to ${debt.lenderName}`,
          metadata: JSON.stringify({ debtId: debt.id, paymentId: payment.id }),
        },
      })

      await recomputeCashSetting(tx, null)

      const updated = await tx.debt.findUnique({
        where: { id: debt.id },
        include: {
          payments: { orderBy: { paidAt: 'desc' } },
          cashBucket: true,
        },
      })

      return { success: true, debt: updated, payment }
    })

    if (result instanceof NextResponse) return result
    return NextResponse.json(result)
  } catch (error) {
    console.error('Debt pay error:', error)

    if (error instanceof Error && error.message === 'INSUFFICIENT_CASH') {
      return NextResponse.json({ error: 'Insufficient cash balance' }, { status: 400 })
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to pay debt' },
      { status: 500 }
    )
  }
}
