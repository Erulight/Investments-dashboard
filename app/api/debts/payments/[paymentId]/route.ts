import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'
import { createCashBucket } from '@/lib/cashBuckets'

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

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ paymentId: string }> }
) {
  try {
    await requireAuth(['OWNER'])
    const { paymentId } = await params

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const payment = await tx.debtPayment.findUnique({
        where: { id: paymentId },
        include: { debt: { include: { payments: true, cashBucket: true } } },
      })

      if (!payment) {
        return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
      }

      const debt = payment.debt
      const amount = Math.abs(Number(payment.amount) || 0)
      if (!Number.isFinite(amount) || amount <= 0) {
        return NextResponse.json({ error: 'Invalid payment amount' }, { status: 400 })
      }

      const currency = debt.cashBucket?.currency || 'SAR'

      // Reverse system cash balance
      const setting = await tx.systemSetting.findUnique({ where: { key: CASH_BALANCE_KEY } })
      const currentCash = setting ? Number(setting.value) : 0
      const nextCash = currentCash + amount

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

      // Add cash back as a new bucket; keep it excluded from zakat if debt isn't fully paid after undo
      const totalPaidExcludingThis = debt.payments
        .filter((p) => p.id !== payment.id)
        .reduce((s, p) => s + (Number(p.amount) || 0), 0)
      const outstandingAfterUndo = Math.max(0, Number(debt.amount) - totalPaidExcludingThis)
      const excludeFromZakat = outstandingAfterUndo > 0.000001

      await createCashBucket(tx, {
        amount,
        haulStartDate: payment.paidAt,
        currency,
        label: `Debt undo • ${debt.lenderName}`,
        date: payment.paidAt,
        notes: payment.notes || null,
        type: 'CASH_IN',
        excludeFromZakat,
      })

      const cashAccount = await getCashAccount(tx, currency)
      await tx.transaction.create({
        data: {
          accountId: cashAccount.id,
          investmentId: null,
          personId: null,
          type: 'DEBT_PAYMENT_UNDO',
          amount: Math.abs(amount),
          date: payment.paidAt,
          description: payment.notes || `Undo debt payment • ${debt.lenderName}`,
          metadata: JSON.stringify({ debtId: debt.id, paymentId: payment.id }),
        },
      })

      await tx.debtPayment.delete({ where: { id: payment.id } })

      // If debt becomes unpaid again, ensure the original debt bucket is excluded from zakat
      if (debt.cashBucketId) {
        await tx.cashBucket.update({
          where: { id: debt.cashBucketId },
          data: {
            excludeFromZakat,
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

      return { success: true, debt: updated }
    })

    if (result instanceof NextResponse) return result
    return NextResponse.json(result)
  } catch (error) {
    console.error('Debt undo payment error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to undo payment' },
      { status: 500 }
    )
  }
}
