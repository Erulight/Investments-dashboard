import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'
import { createSnapshot } from '@/lib/snapshot'
import { recomputeCashSetting } from '@/lib/cashBalance'

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
    if (borrowedAt) {
      const borrowedDay = new Date(borrowedAt.getFullYear(), borrowedAt.getMonth(), borrowedAt.getDate())
      const today = new Date()
      const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
      if (borrowedDay.getTime() > todayDay.getTime()) {
        return NextResponse.json({ error: 'Borrowed date cannot be in the future' }, { status: 400 })
      }
    }

    const existing = await prisma.debt.findUnique({
      where: { id },
      include: {
        payments: true,
        cashBucket: {
          include: {
            allocations: { select: { id: true } },
            movements: { select: { id: true, type: true, amount: true } },
          },
        },
      },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Debt not found' }, { status: 404 })
    }

    const totalPaid = existing.payments.reduce((sum: number, payment: any) => sum + (Number(payment.amount) || 0), 0)
    const nextAmount = amount !== undefined ? amount : Number(existing.amount)
    const nextBorrowedAt = borrowedAt ?? new Date(existing.borrowedAt)
    const nextBorrowedDay = new Date(nextBorrowedAt.getFullYear(), nextBorrowedAt.getMonth(), nextBorrowedAt.getDate())

    if (nextAmount + 0.000001 < totalPaid) {
      return NextResponse.json(
        { error: 'Debt amount cannot be less than total paid amount' },
        { status: 400 }
      )
    }

    const hasPayments = existing.payments.length > 0
    const allocationCount = Array.isArray(existing.cashBucket?.allocations)
      ? existing.cashBucket.allocations.length
      : 0
    const movementCount = Array.isArray(existing.cashBucket?.movements)
      ? existing.cashBucket.movements.length
      : 0
    const borrowedDayCurrent = new Date(existing.borrowedAt)
    borrowedDayCurrent.setHours(0, 0, 0, 0)
    const amountChanged = Math.abs(nextAmount - Number(existing.amount)) > 0.000001
    const borrowedDateChanged = nextBorrowedDay.getTime() !== borrowedDayCurrent.getTime()
    const touchesBorrowSnapshot = amountChanged || borrowedDateChanged
    const lenderChanged = lenderName !== undefined && lenderName !== existing.lenderName
    const notesChanged = notes !== undefined && (notes || null) !== (existing.notes || null)

    if (touchesBorrowSnapshot && hasPayments) {
      return NextResponse.json(
        { error: 'Cannot change debt amount or borrowed date after payments are recorded' },
        { status: 400 }
      )
    }

    if (touchesBorrowSnapshot && (allocationCount > 0 || movementCount > 1)) {
      return NextResponse.json(
        { error: 'Cannot change debt amount or borrowed date after debt cash has been used' },
        { status: 400 }
      )
    }

    const nextLenderName = lenderName !== undefined ? lenderName : existing.lenderName
    const nextNotes = notes !== undefined ? notes || null : existing.notes
    const seedMovement = existing.cashBucket?.movements?.find((movement: any) => movement.type === 'CASH_IN')

    if (touchesBorrowSnapshot && existing.cashBucketId && !seedMovement) {
      return NextResponse.json(
        { error: 'Cannot update debt snapshot because original debt bucket movement is missing' },
        { status: 409 }
      )
    }

    const updated = await prisma.$transaction(async (tx: any) => {
      if (touchesBorrowSnapshot && existing.cashBucketId) {
        const amountDelta = nextAmount - Number(existing.amount)
        if (Math.abs(amountDelta) > 0.000001) {
          await tx.cashBucket.update({
            where: { id: existing.cashBucketId },
            data: { balance: { increment: amountDelta } },
          })
        }

        await recomputeCashSetting(tx, null)
      }

      if (existing.cashBucketId && (touchesBorrowSnapshot || lenderChanged)) {
        const bucketData: any = {
          label: `Debt • ${nextLenderName}`,
        }
        if (touchesBorrowSnapshot) {
          bucketData.haulStartDate = nextBorrowedAt
        }

        await tx.cashBucket.update({
          where: { id: existing.cashBucketId },
          data: bucketData,
        })
      }

      if (existing.cashBucketId && (touchesBorrowSnapshot || notesChanged)) {
        if (seedMovement) {
          const movementData: any = {
            notes: nextNotes,
          }
          if (touchesBorrowSnapshot) {
            movementData.amount = nextAmount
            movementData.date = nextBorrowedAt
          }
          await tx.cashBucketMovement.update({
            where: { id: seedMovement.id },
            data: movementData,
          })
        }
      }

      if (touchesBorrowSnapshot || lenderChanged || notesChanged) {
        await tx.transaction.updateMany({
          where: {
            investmentId: null,
            type: 'DEBT_BORROW',
            metadata: { contains: `"debtId":"${id}"` },
          },
          data: {
            amount: nextAmount,
            date: nextBorrowedAt,
            description: nextNotes || `Debt borrowed from ${nextLenderName}`,
            metadata: JSON.stringify({
              debtId: id,
              lenderName: nextLenderName,
              cashBucketId: existing.cashBucketId,
            }),
          },
        })
      }

      const saved = await tx.debt.update({
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

      return saved
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
    const authUser = await requireAuth(['OWNER'])
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

    await prisma.$transaction(async (tx: any) => {
      // Snapshot before destructive delete
      await createSnapshot(tx as any, {
        label: `Before: Delete debt ${debt.lenderName}`,
        trigger: 'DELETE_DEBT',
        userId: authUser.id,
        debtId: id,
      })

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
      await recomputeCashSetting(tx, null)
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Debt delete error:', error)

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete debt' },
      { status: 500 }
    )
  }
}
