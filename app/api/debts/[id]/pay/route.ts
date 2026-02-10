import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'
import { withdrawFromBuckets } from '@/lib/cashBuckets'

const CASH_BALANCE_KEY = 'CASH_BALANCE'

const getCashAccount = async (tx: Prisma.TransactionClient, currency = 'SAR') => {
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

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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

      const totalPaidBefore = debt.payments.reduce((s, p) => s + (Number(p.amount) || 0), 0)
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

      const setting = await tx.systemSetting.findUnique({ where: { key: CASH_BALANCE_KEY } })
      const currentCash = setting ? Number(setting.value) : 0
      const nextCash = currentCash - amount
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

      const totalPaidAfter = totalPaidBefore + amount
      const outstandingAfter = Math.max(0, Number(debt.amount) - totalPaidAfter)
      const fullyPaid = outstandingAfter <= 0.000001

      if (fullyPaid && debt.cashBucketId) {
        await tx.cashBucket.update({
          where: { id: debt.cashBucketId },
          data: {
            excludeFromZakat: false,
            haulStartDate: paidAt,
            lastZakatPaidDate: null,
          },
        })
      }

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
