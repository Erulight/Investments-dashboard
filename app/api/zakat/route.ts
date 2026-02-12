import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'
import { logAudit } from '@/lib/audit'

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

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(['OWNER', 'PARTNER'])
    if (user.role === 'PARTNER' && !user.personId) {
      return NextResponse.json({ error: 'Partner is missing a person profile' }, { status: 400 })
    }
    const body = await req.json().catch(() => ({}))
    const bucketId = typeof body.bucketId === 'string' ? body.bucketId : ''
    const amount = Number(body.amount)
    const date = body.date ? new Date(body.date) : new Date()
    const notes = typeof body.notes === 'string' ? body.notes : ''

    if (!bucketId) {
      return NextResponse.json({ error: 'Bucket is required' }, { status: 400 })
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 })
    }

    const result = await prisma.$transaction(async (tx) => {
      const bucket = await tx.cashBucket.findFirst({
        where: {
          id: bucketId,
          ...(user.role === 'OWNER'
            ? { personId: null }
            : { personId: user.personId }),
        },
      })
      if (!bucket) {
        return NextResponse.json({ error: 'Bucket not found' }, { status: 404 })
      }
      if (bucket.balance < amount) {
        return NextResponse.json({ error: 'Bucket balance is too low' }, { status: 400 })
      }

      await tx.cashBucket.update({
        where: { id: bucketId },
        data: {
          balance: { decrement: amount },
          lastZakatPaidDate: date,
        },
      })

      const movement = await tx.cashBucketMovement.create({
        data: {
          cashBucketId: bucketId,
          amount: -amount,
          type: 'ZAKAT_PAID',
          date,
          notes: notes || null,
        },
      })

      if (user.role === 'PARTNER') {
        await logAudit(tx, {
          userId: user.id,
          action: 'UPDATE',
          entityType: 'ZAKAT',
          entityId: bucketId,
          changes: JSON.stringify({
            amount,
            date,
            movementId: movement.id,
          }),
        })

        return { success: true }
      }

      const cashSetting = await tx.systemSetting.findUnique({
        where: { key: CASH_BALANCE_KEY },
      })
      const currentCashRaw = cashSetting ? Number(cashSetting.value) : 0
      let currentCash = Number.isFinite(currentCashRaw) ? currentCashRaw : 0
      let nextCash = currentCash - amount

      if (nextCash < 0) {
        const bucketAgg = await tx.cashBucket.aggregate({
          _sum: { balance: true },
        })
        const bucketSumRaw = bucketAgg?._sum?.balance
        const bucketSum = Number.isFinite(bucketSumRaw as any) ? Number(bucketSumRaw) : 0
        if (bucketSum > currentCash + 0.0001) {
          currentCash = bucketSum
          nextCash = currentCash - amount
        }
      }

      if (nextCash < -0.000001) {
        throw new Error('INSUFFICIENT_CASH')
      }

      if (cashSetting) {
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

      const cashAccount = await getCashAccount(tx, bucket.currency)

      await tx.transaction.create({
        data: {
          accountId: cashAccount.id,
          investmentId: null,
          personId: user.personId || null,
          type: 'ZAKAT_PAID',
          amount: -amount,
          date,
          description: notes || 'Zakat payment',
          metadata: JSON.stringify({
            bucketId,
            movementId: movement.id,
          }),
        },
      })

      await logAudit(tx, {
        userId: user.id,
        action: 'UPDATE',
        entityType: 'ZAKAT',
        entityId: bucketId,
        changes: JSON.stringify({
          amount,
          date,
        }),
      })

      return { success: true }
    })

    if (result instanceof NextResponse) {
      return result
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Zakat payment error:', error)

    let statusCode = 500
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        statusCode = 401
      } else if (error.message === 'Forbidden') {
        statusCode = 403
      } else if (error.message === 'INSUFFICIENT_CASH') {
        statusCode = 400
      }
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error && error.message === 'INSUFFICIENT_CASH'
            ? 'Insufficient cash balance'
            : error instanceof Error
              ? error.message
              : 'Failed to pay zakat',
      },
      { status: statusCode }
    )
  }
}
