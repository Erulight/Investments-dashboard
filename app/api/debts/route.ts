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

export async function GET() {
  try {
    await requireAuth(['OWNER'])

    const debts = await prisma.debt.findMany({
      where: { isArchived: false },
      orderBy: { borrowedAt: 'desc' },
      include: {
        cashBucket: {
          select: {
            id: true,
            currency: true,
            balance: true,
            haulStartDate: true,
            lastZakatPaidDate: true,
            excludeFromZakat: true,
          },
        },
        payments: {
          orderBy: { paidAt: 'desc' },
        },
      },
    })

    return NextResponse.json({ debts })
  } catch (error) {
    console.error('Debts list error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load debts' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth(['OWNER'])

    const body = await req.json().catch(() => ({}))
    const lenderName = typeof body.lenderName === 'string' ? body.lenderName.trim() : ''
    const amount = Number(body.amount)
    const borrowedAt = body.borrowedAt ? new Date(body.borrowedAt) : new Date()
    const notes = typeof body.notes === 'string' ? body.notes : ''
    const haulStartDate = body.haulStartDate ? new Date(body.haulStartDate) : borrowedAt
    const currency = typeof body.currency === 'string' && body.currency.trim()
      ? body.currency.trim().toUpperCase()
      : 'SAR'

    if (!lenderName) {
      return NextResponse.json({ error: 'Lender name is required' }, { status: 400 })
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 })
    }

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const cashAccount = await getCashAccount(tx, currency)

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

      const bucket = await createCashBucket(tx, {
        amount,
        haulStartDate,
        currency,
        label: `Debt • ${lenderName}`,
        date: borrowedAt,
        notes: notes || null,
        type: 'CASH_IN',
        excludeFromZakat: true,
      })

      const debt = await tx.debt.create({
        data: {
          lenderName,
          amount,
          borrowedAt,
          notes: notes || null,
          cashBucketId: bucket.id,
        },
        include: {
          cashBucket: {
            select: {
              id: true,
              currency: true,
              balance: true,
              haulStartDate: true,
              lastZakatPaidDate: true,
              excludeFromZakat: true,
            },
          },
          payments: true,
        },
      })

      await tx.transaction.create({
        data: {
          accountId: cashAccount.id,
          investmentId: null,
          personId: null,
          type: 'DEBT_BORROW',
          amount,
          date: borrowedAt,
          description: notes || `Debt borrowed from ${lenderName}`,
          metadata: JSON.stringify({ debtId: debt.id, lenderName, cashBucketId: bucket.id }),
        },
      })

      return debt
    })

    return NextResponse.json({ success: true, debt: result }, { status: 201 })
  } catch (error) {
    console.error('Debt create error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create debt' },
      { status: 500 }
    )
  }
}
