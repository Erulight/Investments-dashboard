import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { requireModuleAccess } from '@/lib/rbac'
import { createAuditLog } from '@/lib/audit'

const CASH_BALANCE_KEY = 'CASH_BALANCE'

/**
 * POST  — Receive the ROSCA payout for a Circlys plan.
 *         Credits the amount into an existing cash bucket (no new haul)
 *         and updates the system cash balance.
 *
 * DELETE — Undo a previous receive.
 */

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireModuleAccess('savings')
    const user = await getCurrentUser()
    if (!user || user.role !== 'OWNER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const investment = await prisma.investment.findUnique({
      where: { id },
      include: { account: true },
    })

    if (!investment || investment.account?.type !== 'CIRCLYS') {
      return NextResponse.json({ error: 'Savings plan not found' }, { status: 404 })
    }

    const meta = (() => {
      try { return JSON.parse(investment.metadata || '{}') } catch { return {} }
    })()

    if (!meta.receiptMonth) {
      return NextResponse.json({ error: 'No receipt month configured for this plan' }, { status: 400 })
    }

    if (meta.received?.date) {
      return NextResponse.json({ error: 'Already received for this plan' }, { status: 400 })
    }

    const receiveAmount = Number(meta.monthlyContribution || 0) * Number(meta.totalMonths || 0)
    if (receiveAmount <= 0) {
      return NextResponse.json({ error: 'Invalid receive amount' }, { status: 400 })
    }

    const currency = investment.account?.currency || 'SAR'

    // Find the oldest existing cash bucket from this plan's payments
    // so the received money joins an EXISTING haul (no new haul).
    const payments: Record<string, any> =
      meta.payments && typeof meta.payments === 'object' ? meta.payments : {}
    const bucketIds = Object.values(payments)
      .map((p: any) => p.bucketId)
      .filter(Boolean) as string[]

    let targetBucketId: string | null = null

    if (bucketIds.length > 0) {
      // Credit into the oldest bucket from this plan
      const oldest = await prisma.cashBucket.findFirst({
        where: { id: { in: bucketIds } },
        orderBy: { haulStartDate: 'asc' },
      })
      if (oldest) targetBucketId = oldest.id
    }

    const result = await prisma.$transaction(async (tx) => {
      const receiveDate = new Date()

      if (targetBucketId) {
        // Add receipt as a movement to the existing bucket — NO new haul
        await tx.cashBucket.update({
          where: { id: targetBucketId },
          data: { balance: { increment: receiveAmount } },
        })
        await tx.cashBucketMovement.create({
          data: {
            cashBucketId: targetBucketId,
            investmentId: investment.id,
            amount: receiveAmount,
            type: 'CASH_IN',
            date: receiveDate,
            notes: `Circlys receipt • ${investment.name} • Month ${meta.receiptMonth}`,
          },
        })
      } else {
        // No existing bucket — create one with the plan start date so it
        // doesn't start a brand-new haul from today.
        const bucket = await tx.cashBucket.create({
          data: {
            label: `Circlys Receipt • ${investment.name}`,
            currency,
            haulStartDate: new Date(investment.startDate),
            balance: receiveAmount,
            movements: {
              create: {
                investmentId: investment.id,
                amount: receiveAmount,
                type: 'CASH_IN',
                date: receiveDate,
                notes: `Circlys receipt • ${investment.name} • Month ${meta.receiptMonth}`,
              },
            },
          },
        })
        targetBucketId = bucket.id
      }

      // Update system cash balance
      const setting = await tx.systemSetting.findUnique({
        where: { key: CASH_BALANCE_KEY },
      })
      const currentCash = setting ? Number(setting.value) : 0
      const nextCash = currentCash + receiveAmount

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

      // Record a transaction in the cash ledger
      const cashAccount =
        (await tx.account.findFirst({ where: { type: 'CASH', isActive: true } })) ??
        (await tx.account.create({
          data: { name: 'Cash Balance', type: 'CASH', currency, description: 'Cash ledger account' },
        }))

      await tx.transaction.create({
        data: {
          accountId: cashAccount.id,
          investmentId: investment.id,
          personId: null,
          type: 'CASH_IN',
          amount: receiveAmount,
          date: receiveDate,
          description: `Circlys receipt • ${investment.name} • Month ${meta.receiptMonth}`,
        },
      })

      // Save received flag in metadata
      const updated = await tx.investment.update({
        where: { id: investment.id },
        data: {
          totalReceived: receiveAmount,
          metadata: JSON.stringify({
            ...meta,
            received: {
              date: receiveDate.toISOString(),
              amount: receiveAmount,
              bucketId: targetBucketId,
            },
          }),
        },
        include: { account: true },
      })

      return updated
    })

    await createAuditLog(user.id, 'CREATE', 'CASH_BUCKET', targetBucketId!, {
      type: 'CIRCLYS_RECEIPT',
      investmentId: investment.id,
      amount: receiveAmount,
      receiptMonth: meta.receiptMonth,
    })

    return NextResponse.json({ investment: result, receiveAmount })
  } catch (error) {
    console.error('Error receiving Circlys payout:', error)
    return NextResponse.json({ error: 'Failed to receive payout' }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireModuleAccess('savings')
    const user = await getCurrentUser()
    if (!user || user.role !== 'OWNER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const investment = await prisma.investment.findUnique({
      where: { id },
      include: { account: true },
    })

    if (!investment || investment.account?.type !== 'CIRCLYS') {
      return NextResponse.json({ error: 'Savings plan not found' }, { status: 404 })
    }

    const meta = (() => {
      try { return JSON.parse(investment.metadata || '{}') } catch { return {} }
    })()

    if (!meta.received?.date) {
      return NextResponse.json({ error: 'No receipt to undo' }, { status: 400 })
    }

    const receiveAmount = Number(meta.received.amount || 0)
    const bucketId = meta.received.bucketId

    if (receiveAmount <= 0) {
      return NextResponse.json({ error: 'Invalid receive amount' }, { status: 400 })
    }

    const result = await prisma.$transaction(async (tx) => {
      // Reverse the bucket credit
      if (bucketId) {
        const bucket = await tx.cashBucket.findUnique({ where: { id: bucketId } })
        if (bucket) {
          await tx.cashBucket.update({
            where: { id: bucketId },
            data: { balance: { decrement: receiveAmount } },
          })
          // Delete the receipt movement
          const movement = await tx.cashBucketMovement.findFirst({
            where: {
              cashBucketId: bucketId,
              investmentId: investment.id,
              amount: receiveAmount,
              type: 'CASH_IN',
              notes: { contains: 'Circlys receipt' },
            },
            orderBy: { createdAt: 'desc' },
          })
          if (movement) {
            await tx.cashBucketMovement.delete({ where: { id: movement.id } })
          }
        }
      }

      // Reverse system cash balance
      const setting = await tx.systemSetting.findUnique({ where: { key: CASH_BALANCE_KEY } })
      const currentCash = setting ? Number(setting.value) : 0
      const nextCash = Math.max(0, currentCash - receiveAmount)

      if (setting) {
        await tx.systemSetting.update({
          where: { key: CASH_BALANCE_KEY },
          data: { value: nextCash.toString() },
        })
      }

      // Delete the ledger transaction
      const cashAccount = await tx.account.findFirst({ where: { type: 'CASH', isActive: true } })
      if (cashAccount) {
        const txn = await tx.transaction.findFirst({
          where: {
            accountId: cashAccount.id,
            investmentId: investment.id,
            type: 'CASH_IN',
            description: { contains: 'Circlys receipt' },
          },
          orderBy: { date: 'desc' },
        })
        if (txn) {
          await tx.transaction.delete({ where: { id: txn.id } })
        }
      }

      // Remove received flag from metadata
      const { received, ...restMeta } = meta
      const updated = await tx.investment.update({
        where: { id: investment.id },
        data: {
          totalReceived: 0,
          metadata: JSON.stringify(restMeta),
        },
        include: { account: true },
      })

      return updated
    })

    await createAuditLog(user.id, 'DELETE', 'CASH_BUCKET', bucketId || id, {
      type: 'CIRCLYS_RECEIPT_UNDO',
      investmentId: investment.id,
      amount: receiveAmount,
    })

    return NextResponse.json({ investment: result })
  } catch (error) {
    console.error('Error undoing Circlys receipt:', error)
    return NextResponse.json({ error: 'Failed to undo receipt' }, { status: 500 })
  }
}
