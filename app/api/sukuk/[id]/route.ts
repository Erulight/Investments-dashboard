import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'
import { updateSukukSchema } from '@/lib/validation'
import { logAudit } from '@/lib/audit'
import type { Prisma } from '@prisma/client'
import { creditBucketsForReceipt, withdrawFromBuckets } from '@/lib/cashBuckets'
import { parseDateInput } from '@/lib/date'
import { createSnapshot } from '@/lib/snapshot'

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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth()
    const { id } = await params
    
    const sukuk = await prisma.investment.findUnique({
      where: { id },
      include: {
        account: true,
        dealParticipants: {
          include: {
            person: true,
          },
        },
        transactions: {
          where: {
            type: { in: ['WITHDRAW_PROFIT', 'WITHDRAW_PRINCIPAL'] },
          },
          orderBy: { date: 'asc' },
        },
      },
    })
    
    if (!sukuk) {
      return NextResponse.json(
        { error: 'Sukuk not found' },
        { status: 404 }
      )
    }
    
    // Apply RBAC: Partners can only view their own participations
    if (user.role === 'PARTNER' && user.personId) {
      const hasParticipation = sukuk.dealParticipants.some(
        (p) => p.personId === user.personId
      )
      
      if (!hasParticipation) {
        return NextResponse.json(
          { error: 'Forbidden' },
          { status: 403 }
        )
      }
      
      // Filter to show only their participation
      const myParticipation = sukuk.dealParticipants.find(
        (p) => p.personId === user.personId
      )
      
      return NextResponse.json({
        ...sukuk,
        dealParticipants: myParticipation ? [myParticipation] : [],
      })
    }
    
    return NextResponse.json(sukuk)
  } catch (error) {
    console.error('Sukuk get error:', error)
    
    let statusCode = 500
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        statusCode = 401
      } else if (error.message === 'Forbidden') {
        statusCode = 403
      }
    }
    
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch Sukuk' },
      { status: statusCode }
    )
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(['OWNER'])
    const { id } = await params
    
    const body = await req.json()
    
    // Validate input
    const validationResult = updateSukukSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        { 
          error: 'Validation failed', 
          details: validationResult.error.format() 
        },
        { status: 400 }
      )
    }
    
    const data = validationResult.data
    
    // Check if sukuk exists
    const existingSukuk = await prisma.investment.findUnique({
      where: { id },
    })
    
    if (!existingSukuk) {
      return NextResponse.json(
        { error: 'Sukuk not found' },
        { status: 404 }
      )
    }

    const principalDelta = data.principalAmount !== undefined
      ? data.principalAmount - existingSukuk.principalAmount
      : 0
    const totalReceivedDelta = data.totalReceived !== undefined
      ? data.totalReceived - existingSukuk.totalReceived
      : 0
    
    // Update the Sukuk in a transaction
    const updatedSukuk = await prisma.$transaction(async (tx) => {
      // Prepare update data
      const updateData: any = {}
      
      if (data.accountId !== undefined) updateData.accountId = data.accountId
      if (data.name !== undefined) updateData.name = data.name
      if (data.category !== undefined) updateData.category = data.category
      if (data.principalAmount !== undefined) updateData.principalAmount = data.principalAmount
      if (data.currentValue !== undefined) updateData.currentValue = data.currentValue
      const startDate = data.startDate !== undefined
        ? (typeof data.startDate === 'string'
            ? (parseDateInput(data.startDate) ?? new Date(data.startDate))
            : new Date(data.startDate))
        : existingSukuk.startDate
      const adjustmentDate = data.adjustmentDate !== undefined
        ? (typeof data.adjustmentDate === 'string'
            ? (parseDateInput(data.adjustmentDate) ?? new Date(data.adjustmentDate))
            : new Date(data.adjustmentDate as any))
        : new Date()
      const maturityDate = data.maturityDate !== undefined
        ? (data.maturityDate
            ? (typeof data.maturityDate === 'string'
                ? (parseDateInput(data.maturityDate) ?? new Date(data.maturityDate))
                : new Date(data.maturityDate))
            : null)
        : existingSukuk.maturityDate

      if (data.startDate !== undefined && Number.isNaN(startDate.getTime())) {
        return NextResponse.json({ error: 'Invalid startDate' }, { status: 400 })
      }
      if (data.adjustmentDate !== undefined && Number.isNaN(adjustmentDate.getTime())) {
        return NextResponse.json({ error: 'Invalid adjustmentDate' }, { status: 400 })
      }
      if (data.maturityDate !== undefined && maturityDate && Number.isNaN(maturityDate.getTime())) {
        return NextResponse.json({ error: 'Invalid maturityDate' }, { status: 400 })
      }
      if (data.startDate !== undefined) updateData.startDate = startDate
      if (data.maturityDate !== undefined) updateData.maturityDate = maturityDate

      if (data.fees !== undefined) updateData.fees = data.fees
      if (data.totalReceived !== undefined) updateData.totalReceived = data.totalReceived
      if (data.receivableAmount !== undefined) updateData.receivableAmount = data.receivableAmount
      if (data.isIjarah !== undefined) updateData.isIjarah = data.isIjarah
      if (principalDelta > 0 || totalReceivedDelta < 0) {
        updateData.reopenedAt = new Date()
      }

      const principalAmount = data.principalAmount ?? existingSukuk.principalAmount
      const fees = data.fees ?? existingSukuk.fees
      const receivableAmount = data.receivableAmount ?? existingSukuk.receivableAmount
      const periodMonths = maturityDate
        ? (maturityDate.getFullYear() - startDate.getFullYear()) * 12
          + (maturityDate.getMonth() - startDate.getMonth())
          + (maturityDate.getDate() - startDate.getDate()) / 30
        : null
      const periodYears = periodMonths ? periodMonths / 12 : null
      const computedApr = periodYears && principalAmount > 0
        ? ((receivableAmount + fees) / principalAmount / periodYears) * 100
        : data.interestRate ?? existingSukuk.interestRate
      updateData.interestRate = computedApr
      if (data.notes !== undefined) updateData.notes = data.notes
      if (data.metadata !== undefined) updateData.metadata = data.metadata

      if (principalDelta !== 0) {
        const cashSetting = await tx.systemSetting.findUnique({
          where: { key: 'CASH_BALANCE' },
        })
        const currentCashRaw = cashSetting ? Number(cashSetting.value) : 0
        let currentCash = Number.isFinite(currentCashRaw) ? currentCashRaw : 0
        let nextCash = currentCash - principalDelta

        if (principalDelta > 0 && nextCash < 0) {
          const bucketAgg = await tx.cashBucket.aggregate({
            _sum: { balance: true },
          })
          const bucketSumRaw = bucketAgg?._sum?.balance
          const bucketSum = Number.isFinite(bucketSumRaw as any) ? Number(bucketSumRaw) : 0
          if (bucketSum > currentCash + 0.0001) {
            currentCash = bucketSum
            nextCash = currentCash - principalDelta
          }
        }

        if (principalDelta > 0 && nextCash < 0) {
          throw new Error('INSUFFICIENT_CASH')
        }

        if (cashSetting) {
          await tx.systemSetting.update({
            where: { key: 'CASH_BALANCE' },
            data: { value: nextCash.toString() },
          })
        } else {
          await tx.systemSetting.create({
            data: {
              key: 'CASH_BALANCE',
              value: nextCash.toString(),
              description: 'Available cash balance for investments',
            },
          })
        }

        const accountId = updateData.accountId ?? existingSukuk.accountId
        const account = await tx.account.findUnique({
          where: { id: accountId },
        })
        const cashAccount = await getCashAccount(tx, account?.currency || 'SAR')

        if (principalDelta > 0) {
          await withdrawFromBuckets(tx, {
            amount: principalDelta,
            currency: account?.currency || 'SAR',
            date: startDate,
            type: 'INVEST_OUT',
            investmentId: id,
            notes: 'Principal increase',
            allocateToInvestment: true,
            availableOnOrBefore: startDate,
          })
        } else {
          await creditBucketsForReceipt(tx, {
            investmentId: id,
            amount: Math.abs(principalDelta),
            principalReduction: Math.abs(principalDelta),
            date: adjustmentDate,
            type: 'WITHDRAW_PRINCIPAL',
            notes: 'Principal decrease',
          })
        }

        await tx.transaction.create({
          data: {
            accountId: cashAccount.id,
            investmentId: id,
            personId: user.personId || null,
            type: principalDelta > 0 ? 'CASH_OUT' : 'CASH_IN',
            amount: -principalDelta,
            date: adjustmentDate,
            description: 'Principal adjustment',
            metadata: JSON.stringify({
              previousPrincipal: existingSukuk.principalAmount,
              newPrincipal: data.principalAmount,
            }),
          },
        })
      }

      const updated = await tx.investment.update({
        where: { id },
        data: updateData,
      })
      
      // Update participants if provided
      if (data.participants !== undefined) {
        // Delete existing participants
        await tx.dealParticipant.deleteMany({
          where: { investmentId: id },
        })
        
        // Create new participants
        if (data.participants.length > 0) {
          await tx.dealParticipant.createMany({
            data: data.participants.map((p) => ({
              investmentId: id,
              personId: p.personId,
              investedAmount: p.investedAmount,
              currentValue: p.investedAmount,
              acquiredAt: existingSukuk.startDate,
              commissionFees: 0,
              sharePercentage: p.sharePercentage,
              notes: p.notes,
            })),
          })
        }
      }
      
      // Log audit
      await logAudit(tx, {
        userId: user.id,
        action: 'UPDATE',
        entityType: 'SUKUK',
        entityId: id,
        changes: JSON.stringify({ before: existingSukuk, after: updateData }),
      })
      
      return updated
    })
    
    // Fetch the complete updated sukuk
    const completeSukuk = await prisma.investment.findUnique({
      where: { id },
      include: {
        account: true,
        dealParticipants: {
          include: {
            person: true,
          },
        },
      },
    })
    
    return NextResponse.json({
      success: true,
      sukuk: completeSukuk,
    })
  } catch (error) {
    console.error('Sukuk update error:', error)
    
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
              : 'Failed to update Sukuk',
      },
      { status: statusCode }
    )
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(['OWNER'])
    const { id } = await params
    
    // Check if sukuk exists
    const existingSukuk = await prisma.investment.findUnique({
      where: { id },
    })
    
    if (!existingSukuk) {
      return NextResponse.json(
        { error: 'Sukuk not found' },
        { status: 404 }
      )
    }
    
    // Delete the sukuk and reverse cash/bucket effects
    await prisma.$transaction(async (tx) => {
      // Create snapshot before delete
      await createSnapshot(tx, {
        label: `Before: Delete ${existingSukuk.name}`,
        trigger: 'DELETE_SUKUK',
        userId: user.id,
        investmentId: existingSukuk.id,
        personId: user.personId || undefined,
      })
      // Capture any profit buckets that were created for this Sukuk so we can
      // remove them after reversing movements.
      const profitBuckets = await tx.cashBucket.findMany({
        where: {
          label: { startsWith: 'Profit \u2022' },
          movements: {
            some: {
              investmentId: id,
              type: 'CASH_IN',
            },
          },
        },
        select: { id: true },
      })
      const profitBucketIds = profitBuckets.map((b: any) => b.id)
      const settleDebtSales = await tx.transaction.findMany({
        where: {
          investmentId: id,
          type: 'SELL_TO_PARTNER',
        },
        select: { id: true, date: true, metadata: true },
      })

      for (const saleTx of settleDebtSales) {
        const meta = parseMetadata(saleTx.metadata)
        if (meta?.paymentMode !== 'SETTLE_DEBT') continue
        const debtId = typeof meta?.debtId === 'string' ? meta.debtId : ''
        const salePrice = Number(meta?.salePrice ?? 0)
        if (!debtId || !Number.isFinite(salePrice) || salePrice <= 0) continue

        const day = saleTx.date ? new Date(saleTx.date) : null
        const dayStart = day ? new Date(day.getFullYear(), day.getMonth(), day.getDate()) : null
        const dayEnd = day ? new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1) : null

        await tx.debtPayment.deleteMany({
          where: {
            debtId,
            amount: salePrice,
            ...(dayStart && dayEnd
              ? ({ paidAt: { gte: dayStart, lt: dayEnd } } as any)
              : {}),
            OR: [
              { notes: { contains: `[INVESTMENT:${id}]` } },
              { notes: { contains: 'Debt settlement via Sukuk transfer' } },
            ],
          } as any,
        })

        const debt = await tx.debt.findUnique({
          where: { id: debtId },
          include: { payments: true },
        })

        if (debt?.cashBucketId) {
          const totalPaid = debt.payments.reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0)
          const outstanding = Math.max(0, Number(debt.amount) - totalPaid)
          if (outstanding > 0.000001) {
            await tx.cashBucket.update({
              where: { id: debt.cashBucketId },
              data: {
                excludeFromZakat: true,
                haulStartDate: debt.borrowedAt,
                lastZakatPaidDate: null,
              },
            })
          }
        }
      }

      const commissionTxs = await tx.transaction.findMany({
        where: {
          type: 'PARTNER_COMMISSION',
          OR: [
            { investmentId: id },
            { metadata: { contains: `"investmentId":"${id}"` } },
          ],
        },
      })

      const commissionMovements = commissionTxs.length
        ? await tx.cashBucketMovement.findMany({
            where: {
              investmentId: null,
              type: 'CASH_IN',
              OR: commissionTxs.map((t) => ({
                amount: t.amount,
                date: t.date,
              })),
              cashBucket: {
                label: 'Partner Commission',
              },
            },
            include: {
              cashBucket: true,
            },
          })
        : []

      const investmentMovements = await tx.cashBucketMovement.findMany({
        where: { investmentId: id },
      })

      const movements = [...investmentMovements, ...commissionMovements]

      const netMovement = movements.reduce((sum, m) => sum + m.amount, 0)

      for (const movement of movements) {
        const bucket = await tx.cashBucket.findUnique({
          where: { id: movement.cashBucketId },
        })
        if (bucket) {
          const nextBalance = bucket.balance - movement.amount
          if (nextBalance < -0.0001) {
            throw new Error('INSUFFICIENT_CASH')
          }
          await tx.cashBucket.update({
            where: { id: bucket.id },
            data: { balance: nextBalance },
          })
        }
      }

      const cashSetting = await tx.systemSetting.findUnique({
        where: { key: 'CASH_BALANCE' },
      })
      const currentCash = cashSetting ? Number(cashSetting.value) : 0
      const nextCash = currentCash - netMovement
      if (nextCash < -0.0001) {
        throw new Error('INSUFFICIENT_CASH')
      }

      if (cashSetting) {
        await tx.systemSetting.update({
          where: { key: 'CASH_BALANCE' },
          data: { value: Math.max(0, nextCash).toString() },
        })
      } else {
        await tx.systemSetting.create({
          data: {
            key: 'CASH_BALANCE',
            value: Math.max(0, nextCash).toString(),
            description: 'Available cash balance for investments',
          },
        })
      }

      await tx.cashBucketMovement.deleteMany({
        where: { investmentId: id },
      })

      if (commissionMovements.length > 0) {
        await tx.cashBucketMovement.deleteMany({
          where: {
            id: {
              in: commissionMovements.map((m) => m.id),
            },
          },
        })
      }

      // Remove any profit buckets that were created for this Sukuk.
      if (profitBucketIds.length > 0) {
        await tx.cashBucket.deleteMany({
          where: {
            id: { in: profitBucketIds },
          },
        })
      }
      await tx.investmentBucketAllocation.deleteMany({
        where: { investmentId: id },
      })

      await tx.transaction.deleteMany({
        where: {
          OR: [
            { investmentId: id },
            {
              type: 'PARTNER_COMMISSION',
              metadata: { contains: `"investmentId":"${id}"` },
            },
          ],
        },
      })

      await tx.investment.delete({
        where: { id },
      })

      // Log audit
      await logAudit(tx, {
        userId: user.id,
        action: 'DELETE',
        entityType: 'SUKUK',
        entityId: id,
        changes: JSON.stringify({ deleted: existingSukuk, reversedCash: netMovement }),
      })
    })
    
    return NextResponse.json({
      success: true,
      message: 'Sukuk deleted successfully',
    })
  } catch (error) {
    console.error('Sukuk delete error:', error)
    
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
            ? 'Cash balance is lower than the deleted deal effects'
            : error instanceof Error
              ? error.message
              : 'Failed to delete Sukuk',
      },
      { status: statusCode }
    )
  }
}
