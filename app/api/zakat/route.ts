import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'
import { logAudit } from '@/lib/audit'
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

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(['OWNER', 'PARTNER'])
    if (user.role === 'PARTNER' && !user.personId) {
      return NextResponse.json({ error: 'Partner is missing a person profile' }, { status: 400 })
    }
    const body = await req.json().catch(() => ({}))
    const bucketId = typeof body.bucketId === 'string' ? body.bucketId : ''
    const rowId = typeof body.rowId === 'string' ? body.rowId : ''
    const amount = Number(body.amount)
    const date = body.date ? new Date(body.date) : new Date()
    const periodEndRaw = body.periodEnd
    const periodEnd = periodEndRaw ? new Date(periodEndRaw) : null
    const notes = typeof body.notes === 'string' ? body.notes : ''

    if (!bucketId) {
      return NextResponse.json({ error: 'Bucket is required' }, { status: 400 })
    }
    if (!rowId) {
      return NextResponse.json({ error: 'Row id is required' }, { status: 400 })
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 })
    }
    if (Number.isNaN(date.getTime())) {
      return NextResponse.json({ error: 'Invalid payment date' }, { status: 400 })
    }
    if (periodEndRaw && (!periodEnd || Number.isNaN(periodEnd.getTime()))) {
      return NextResponse.json({ error: 'Invalid period end date' }, { status: 400 })
    }

    const today = new Date()
    const paymentDay = new Date(date.getFullYear(), date.getMonth(), date.getDate())
    const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    if (paymentDay.getTime() > todayDay.getTime()) {
      return NextResponse.json({ error: 'Payment date cannot be in the future' }, { status: 400 })
    }
    const periodEndDay = periodEnd
      ? new Date(periodEnd.getFullYear(), periodEnd.getMonth(), periodEnd.getDate())
      : null
    if (periodEndDay && paymentDay.getTime() < periodEndDay.getTime()) {
      return NextResponse.json({ error: 'Payment date cannot be before period end date' }, { status: 400 })
    }

    const result = await prisma.$transaction(async (tx: any) => {
      const bucket = await tx.cashBucket.findFirst({
        where: {
          id: bucketId,
          ...(user.role === 'OWNER'
            ? { OR: [{ personId: null }, { personId: user.personId || null }] }
            : { personId: user.personId }),
        },
      })
      if (!bucket) {
        return NextResponse.json({ error: 'Bucket not found' }, { status: 404 })
      }
      if (bucket.balance < amount) {
        return NextResponse.json({ error: 'Bucket balance is too low' }, { status: 400 })
      }

      const rowMarker = `ZAKAT_ROW=${rowId}`
      const existingRowPayment = await tx.cashBucketMovement.findFirst({
        where: {
          cashBucketId: bucketId,
          type: 'ZAKAT_PAID',
          notes: { contains: rowMarker },
        },
      })
      if (existingRowPayment) {
        return NextResponse.json({ error: 'Zakat is already paid for this row' }, { status: 400 })
      }

      await tx.cashBucket.update({
        where: { id: bucketId },
        data: {
          balance: { decrement: amount },
        },
      })

      const combinedNotes = notes ? `${notes} | ${rowMarker}` : rowMarker

      const movement = await tx.cashBucketMovement.create({
        data: {
          cashBucketId: bucketId,
          amount: -amount,
          type: 'ZAKAT_PAID',
          date,
          notes: combinedNotes,
        },
      })

      if (user.role === 'PARTNER') {
        await recomputeCashSetting(tx, user.personId || null)

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

      await recomputeCashSetting(tx, null)

      const cashAccount = await getCashAccount(tx, bucket.currency)

      await tx.transaction.create({
        data: {
          accountId: cashAccount.id,
          investmentId: null,
          personId: user.role === 'OWNER' ? null : (user.personId || null),
          type: 'ZAKAT_PAID',
          amount: -amount,
          date,
          description: notes || 'Zakat payment',
          metadata: JSON.stringify({
            bucketId,
            rowId,
            movementId: movement.id,
            periodEnd: periodEnd && !Number.isNaN(periodEnd.getTime()) ? periodEnd.toISOString() : null,
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
