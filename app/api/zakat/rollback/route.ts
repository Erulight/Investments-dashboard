import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'
import { logAudit } from '@/lib/audit'

const CASH_BALANCE_KEY = 'CASH_BALANCE'

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(['OWNER', 'PARTNER'])
    if (user.role === 'PARTNER' && !user.personId) {
      return NextResponse.json({ error: 'Partner is missing a person profile' }, { status: 400 })
    }
    const body = await req.json().catch(() => ({}))
    const bucketId = typeof body.bucketId === 'string' ? body.bucketId : ''
    const movementId = typeof body.movementId === 'string' ? body.movementId : ''

    if (!bucketId) {
      return NextResponse.json({ error: 'Bucket is required' }, { status: 400 })
    }

    const result = await prisma.$transaction(async (tx) => {
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

      const targetMovement = movementId
        ? await tx.cashBucketMovement.findFirst({
            where: { id: movementId, cashBucketId: bucketId, type: 'ZAKAT_PAID' },
          })
        : await tx.cashBucketMovement.findFirst({
            where: { cashBucketId: bucketId, type: 'ZAKAT_PAID' },
            orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
          })

      if (!targetMovement) {
        return NextResponse.json({ error: 'No zakat payment found to rollback' }, { status: 404 })
      }

      const amount = Math.abs(targetMovement.amount)

      await tx.cashBucket.update({
        where: { id: bucketId },
        data: {
          balance: { increment: amount },
        },
      })

      await tx.cashBucketMovement.delete({
        where: { id: targetMovement.id },
      })

      if (user.role === 'PARTNER') {
        const remainingPayment = await tx.cashBucketMovement.findFirst({
          where: { cashBucketId: bucketId, type: 'ZAKAT_PAID' },
          orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        })

        await tx.cashBucket.update({
          where: { id: bucketId },
          data: {
            lastZakatPaidDate: remainingPayment ? remainingPayment.date : null,
          },
        })

        await logAudit(tx, {
          userId: user.id,
          action: 'UPDATE',
          entityType: 'ZAKAT',
          entityId: bucketId,
          changes: JSON.stringify({
            rollback: {
              amount,
              movementId: targetMovement.id,
            },
          }),
        })

        return { success: true }
      }

      const cashSetting = await tx.systemSetting.findUnique({
        where: { key: CASH_BALANCE_KEY },
      })
      const currentCash = cashSetting ? Number(cashSetting.value) : 0
      const nextCash = currentCash + amount

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

      const dayStart = new Date(targetMovement.date.getFullYear(), targetMovement.date.getMonth(), targetMovement.date.getDate())
      const dayEnd = new Date(targetMovement.date.getFullYear(), targetMovement.date.getMonth(), targetMovement.date.getDate() + 1)

      await tx.transaction.deleteMany({
        where: {
          type: 'ZAKAT_PAID',
          amount: -amount,
          OR: [
            { metadata: { contains: targetMovement.id } },
            { date: { gte: dayStart, lt: dayEnd } },
          ],
        },
      })

      const remainingPayment = await tx.cashBucketMovement.findFirst({
        where: { cashBucketId: bucketId, type: 'ZAKAT_PAID' },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      })

      await tx.cashBucket.update({
        where: { id: bucketId },
        data: {
          lastZakatPaidDate: remainingPayment ? remainingPayment.date : null,
        },
      })

      await logAudit(tx, {
        userId: user.id,
        action: 'UPDATE',
        entityType: 'ZAKAT',
        entityId: bucketId,
        changes: JSON.stringify({
          rollback: {
            amount,
            movementId: targetMovement.id,
          },
        }),
      })

      return { success: true }
    })

    if (result instanceof NextResponse) {
      return result
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Zakat rollback error:', error)
    let statusCode = 500
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        statusCode = 401
      } else if (error.message === 'Forbidden') {
        statusCode = 403
      }
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to rollback zakat' },
      { status: statusCode }
    )
  }
}
