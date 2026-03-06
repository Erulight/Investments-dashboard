import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'
import { createSnapshot } from '@/lib/snapshot'

const CASH_BALANCE_KEY = 'CASH_BALANCE'

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(['OWNER'])
    const { id } = await params
    const body = await req.json().catch(() => ({}))

    const lenderName = typeof body.lenderName === 'string' ? body.lenderName.trim() : undefined
    const notes = typeof body.notes === 'string' ? body.notes : undefined
    const borrowedAt = body.borrowedAt ? new Date(body.borrowedAt) : undefined
    const amount = body.amount !== undefined ? Number(body.amount) : undefined
    const isArchived = body.isArchived !== undefined ? Boolean(body.isArchived) : undefined

    if (borrowedAt && Number.isNaN(borrowedAt.getTime())) {
      return NextResponse.json({ error: 'Invalid borrowedAt' }, { status: 400 })
    }
    if (amount !== undefined && (!Number.isFinite(amount) || amount <= 0)) {
      return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 })
    }

    const updated = await prisma.debt.update({
      where: { id },
      data: {
        ...(lenderName !== undefined ? { lenderName } : {}),
        ...(notes !== undefined ? { notes: notes || null } : {}),
        ...(borrowedAt !== undefined ? { borrowedAt } : {}),
        ...(amount !== undefined ? { amount } : {}),
        ...(isArchived !== undefined ? { isArchived } : {}),
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
        payments: { orderBy: { paidAt: 'desc' } },
      },
    })

    return NextResponse.json({ success: true, debt: updated })
  } catch (error) {
    console.error('Debt update error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update debt' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(['OWNER'])
    const { id } = await params

    const debt = await prisma.debt.findUnique({
      where: { id },
      include: {
        payments: true,
        cashBucket: {
          include: {
            allocations: { select: { id: true } },
            movements: { select: { id: true, type: true } },
          },
        },
      },
    })

    if (!debt) {
      return NextResponse.json({ error: 'Debt not found' }, { status: 404 })
    }

    if (debt.payments.length > 0) {
      return NextResponse.json(
        { error: 'Cannot delete a debt with payments. Archive it instead.' },
        { status: 400 }
      )
    }

    const cashBucket = debt.cashBucket
    if (!cashBucket || !debt.cashBucketId) {
      return NextResponse.json(
        { error: 'Debt cannot be deleted because its cash bucket is missing. Archive it instead.' },
        { status: 400 }
      )
    }

    const allocationCount = Array.isArray(cashBucket.allocations) ? cashBucket.allocations.length : 0
    const movementCount = Array.isArray(cashBucket.movements) ? cashBucket.movements.length : 0
    if (allocationCount > 0 || movementCount > 1) {
      return NextResponse.json(
        { error: 'Cannot delete this debt because its cash has been used. Archive it instead.' },
        { status: 400 }
      )
    }

    const amount = Number(debt.amount) || 0
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Invalid debt amount' }, { status: 400 })
    }

    await prisma.$transaction(async (tx) => {
      // Snapshot before destructive delete
      await createSnapshot(tx as any, {
        label: `Before: Delete debt ${debt.lenderName}`,
        trigger: 'DELETE_DEBT',
        userId: (await requireAuth(['OWNER'])).id,
        debtId: id,
      })
      const setting = await tx.systemSetting.findUnique({ where: { key: CASH_BALANCE_KEY } })
      const currentCash = setting ? Number(setting.value) : 0
      const nextCash = currentCash - amount
      if (nextCash < -0.000001) {
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

      const debtBorrowedAt = debt.borrowedAt ? new Date(debt.borrowedAt) : null

      await tx.transaction.deleteMany({
        where: {
          investmentId: null,
          type: { in: ['DEBT_BORROW', 'DEBT_PAYMENT', 'DEBT_PAYMENT_UNDO'] },
          OR: [
            { metadata: { contains: `"debtId":"${id}"` } },
            ...(debt.cashBucketId
              ? ([{ metadata: { contains: `"cashBucketId":"${debt.cashBucketId}"` } }] as any)
              : []),
            // Fallback for older rows with missing/changed metadata
            ...(debtBorrowedAt
              ? ([
                  {
                    type: 'DEBT_BORROW',
                    amount: Number(debt.amount) || 0,
                    date: debtBorrowedAt,
                    description: { contains: debt.lenderName },
                  },
                ] as any)
              : []),
          ],
        },
      })

      await tx.debt.delete({ where: { id } })
      await tx.cashBucket.delete({ where: { id: debt.cashBucketId! } })
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Debt delete error:', error)

    if (error instanceof Error && error.message === 'INSUFFICIENT_CASH') {
      return NextResponse.json(
        { error: 'Cannot delete this debt because it would make cash balance negative. Archive it instead.' },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete debt' },
      { status: 500 }
    )
  }
}
