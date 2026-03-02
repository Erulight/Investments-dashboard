import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'
import { logAudit } from '@/lib/audit'
import { creditBucketsForReceipt } from '@/lib/cashBuckets'
import { createCashBucket } from '@/lib/cashBuckets'

const CASH_BALANCE_KEY = 'CASH_BALANCE'

const parseMetadata = (value: unknown) => {
  if (!value) return null
  if (typeof value === 'object') return value as any
  if (typeof value !== 'string') return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(['OWNER', 'PARTNER'])
    const { id } = await params
    const body = await req.json()

    const source = body.source === 'PRINCIPAL' ? 'PRINCIPAL' : 'PROFIT'
    const amount = Number(body.amount)
    const notes = typeof body.notes === 'string' ? body.notes : ''
    const date = body.date ? new Date(body.date) : new Date()

    if (body.date && Number.isNaN(date.getTime())) {
      return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 })
    }

    const investment = await prisma.investment.findUnique({
      where: { id },
      include: {
        account: true,
        dealParticipants: true,
        transactions: true,
      },
    })

    if (!investment) {
      return NextResponse.json({ error: 'Sukuk not found' }, { status: 404 })
    }

    if (user.role === 'PARTNER') {
      if (!user.personId) {
        return NextResponse.json({ error: 'Partner is missing a person profile' }, { status: 400 })
      }

      const participants = Array.isArray(investment.dealParticipants)
        ? investment.dealParticipants
        : []

      const isSoleOwner = participants.length === 1 && participants[0]?.personId === user.personId
      if (!isSoleOwner) {
        return NextResponse.json({ error: 'This Sukuk is not fully owned by you' }, { status: 403 })
      }
    }

    if (source === 'PRINCIPAL' && amount > investment.principalAmount) {
      return NextResponse.json(
        { error: 'Amount exceeds principal amount' },
        { status: 400 }
      )
    }

    const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate())
    const dayEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1)
    const existingTransaction = await prisma.transaction.findFirst({
      where: {
        investmentId: investment.id,
        type: source === 'PROFIT' ? 'WITHDRAW_PROFIT' : 'WITHDRAW_PRINCIPAL',
        amount: Math.abs(amount),
        date: {
          gte: dayStart,
          lt: dayEnd,
        },
      },
    })

    if (existingTransaction) {
      return NextResponse.json(
        { error: 'A matching withdrawal already exists for this date' },
        { status: 409 }
      )
    }

    const updated = await prisma.$transaction(async (tx: any) => {
      const settleOwnerOnPartnerWithdraw = async () => {
        if (user.role !== 'PARTNER' || !user.personId) return

        const transactions = Array.isArray(investment.transactions) ? investment.transactions : []
        const saleTx = transactions
          .filter((t: any) => t.type === 'SELL_TO_PARTNER')
          .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]

        if (!saleTx) return
        const meta = parseMetadata(saleTx.metadata)
        if (meta?.paymentMode !== 'SETTLE_DEBT') return

        const buyerPersonId = typeof meta?.buyerPersonId === 'string' ? meta.buyerPersonId : null
        if (!buyerPersonId || buyerPersonId !== user.personId) return

        const profit = Number(meta?.accruedProfitAtSale ?? 0)
        const commission = Number(meta?.commissionAmount ?? 0)
        const pending = (Number.isFinite(profit) ? Math.max(0, profit) : 0)
          + (Number.isFinite(commission) ? Math.max(0, commission) : 0)

        if (pending <= 0.000001) return

        const alreadySettled = transactions.some((t: any) => {
          if (t.type !== 'SOLD_DEAL_SETTLEMENT') return false
          const m = parseMetadata(t.metadata)
          return m?.sourceTxId === saleTx.id
        })
        if (alreadySettled) return

        const cashAccount = await tx.account.findFirst({
          where: { type: 'CASH', isActive: true },
        }) ?? await tx.account.create({
          data: {
            name: 'Cash Balance',
            type: 'CASH',
            currency: investment.account?.currency || 'SAR',
            description: 'Cash ledger account',
          },
        })

        const saleDate = saleTx.date ? new Date(saleTx.date) : date
        const haulStartDate = Number.isNaN(saleDate.getTime())
          ? date
          : new Date(saleDate.getFullYear(), saleDate.getMonth(), saleDate.getDate())

        await createCashBucket(tx, {
          amount: pending,
          haulStartDate,
          currency: investment.account?.currency || 'SAR',
          label: `Sold Deal Settlement · ${investment.name}`,
          date,
          notes: null,
          investmentId: investment.id,
          personId: saleTx.personId || null,
          type: 'CASH_IN',
        })

        await tx.transaction.create({
          data: {
            accountId: cashAccount.id,
            investmentId: investment.id,
            personId: saleTx.personId || null,
            type: 'SOLD_DEAL_SETTLEMENT',
            amount: Math.abs(pending),
            date,
            description: 'Settlement of sold deal profit/commission on partner withdrawal',
            metadata: JSON.stringify({
              sourceTxId: saleTx.id,
              buyerPersonId,
              paymentMode: 'SETTLE_DEBT',
              accruedProfitAtSale: pending,
            }),
          },
        })
      }

      const updatedInvestment = await tx.investment.update({
        where: { id },
        data: {
          totalReceived: source === 'PROFIT'
            ? investment.totalReceived + amount
            : investment.totalReceived,
          principalAmount: source === 'PRINCIPAL'
            ? investment.principalAmount - amount
            : investment.principalAmount,
          currentValue: Math.max(0, investment.currentValue - amount),
        },
      })

      const scopeKey = user.role === 'OWNER' ? 'OWNER' : user.personId!
      const cashBalanceKey = user.role === 'OWNER' ? CASH_BALANCE_KEY : `${CASH_BALANCE_KEY}:${scopeKey}`

      const cashSetting = await tx.systemSetting.findUnique({
        where: { key: cashBalanceKey },
      })
      const currentCash = cashSetting ? Number(cashSetting.value) : 0
      const nextCash = currentCash + amount

      if (cashSetting) {
        await tx.systemSetting.update({
          where: { key: cashBalanceKey },
          data: { value: nextCash.toString() },
        })
      } else {
        await tx.systemSetting.create({
          data: {
            key: cashBalanceKey,
            value: nextCash.toString(),
            description: 'Available cash balance for investments',
          },
        })
      }

      if (user.role === 'PARTNER') {
        await creditBucketsForReceipt(tx, {
          investmentId: investment.id,
          amount,
          principalReduction: source === 'PRINCIPAL' ? amount : 0,
          date,
          type: source === 'PROFIT' ? 'WITHDRAW_PROFIT' : 'WITHDRAW_PRINCIPAL',
          notes: notes || null,
          personId: user.personId || null,
        })

        // Partner withdrawal acts as the "close" event for settle-debt sales:
        // settle the owner's pending profit/commission into cash.
        await settleOwnerOnPartnerWithdraw()
      } else {
        await creditBucketsForReceipt(tx, {
          investmentId: investment.id,
          amount,
          principalReduction: source === 'PRINCIPAL' ? amount : 0,
          date,
          type: source === 'PROFIT' ? 'WITHDRAW_PROFIT' : 'WITHDRAW_PRINCIPAL',
          notes: notes || null,
        })
      }

      const cashAccount = await tx.account.findFirst({
        where: { type: 'CASH', isActive: true },
      }) ?? await tx.account.create({
        data: {
          name: 'Cash Balance',
          type: 'CASH',
          currency: investment.account?.currency || 'SAR',
          description: 'Cash ledger account',
        },
      })

      await tx.transaction.create({
        data: {
          accountId: cashAccount.id,
          investmentId: investment.id,
          personId: user.personId || null,
          type: source === 'PROFIT' ? 'WITHDRAW_PROFIT' : 'WITHDRAW_PRINCIPAL',
          amount: Math.abs(amount),
          date,
          description: notes || null,
          metadata: JSON.stringify({ source }),
        },
      })

      await logAudit(tx, {
        userId: user.id,
        action: 'UPDATE',
        entityType: 'SUKUK',
        entityId: investment.id,
        changes: JSON.stringify({
          withdraw: {
            source,
            amount,
            date,
          },
        }),
      })

      return updatedInvestment
    })

    return NextResponse.json({ success: true, investment: updated })
  } catch (error) {
    console.error('Withdraw error:', error)

    let statusCode = 500
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        statusCode = 401
      } else if (error.message === 'Forbidden') {
        statusCode = 403
      }
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to withdraw' },
      { status: statusCode }
    )
  }
}
