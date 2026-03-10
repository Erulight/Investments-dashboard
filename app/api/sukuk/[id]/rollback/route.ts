import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'
import { logAudit } from '@/lib/audit'
import { creditBucketsForReceipt, createCashBucket } from '@/lib/cashBuckets'
import { recomputeCashSetting } from '@/lib/cashBalance'

const toDate = (value?: string | Date | null) => {
  if (!value) return null
  if (value instanceof Date) return value
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date
}

const getPeriodMonths = (start?: string | Date | null, end?: string | Date | null) => {
  const startDate = toDate(start)
  const endDate = toDate(end)
  if (!startDate || !endDate) return null
  const months = (endDate.getFullYear() - startDate.getFullYear()) * 12
    + (endDate.getMonth() - startDate.getMonth())
    + (endDate.getDate() - startDate.getDate()) / 30
  return Math.max(0, months)
}

const computeNetProfit = (investment: any) => {
  const principal = Number.isFinite(investment.principalAmount) ? investment.principalAmount : 0
  const fees = Number.isFinite(investment.fees) ? investment.fees : 0
  const receivableAmount = Number.isFinite(investment.receivableAmount) ? investment.receivableAmount : 0
  if (receivableAmount > 0) return receivableAmount
  const apr = Number.isFinite(investment.interestRate) ? investment.interestRate : 0
  const periodMonths = getPeriodMonths(investment.startDate, investment.maturityDate)
  const periodYears = periodMonths ? periodMonths / 12 : 0
  const grossProfit = principal > 0 && apr > 0 && periodYears > 0
    ? principal * (apr / 100) * periodYears
    : 0
  return Math.max(0, grossProfit - fees)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(['OWNER', 'PARTNER'])
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const date = body.date ? new Date(body.date) : new Date()
    const notes = typeof body.notes === 'string' ? body.notes : ''

    if (body.date && Number.isNaN(date.getTime())) {
      return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
    }

    const today = new Date()
    const rollbackDay = new Date(date.getFullYear(), date.getMonth(), date.getDate())
    const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    if (rollbackDay.getTime() > todayDay.getTime()) {
      return NextResponse.json({ error: 'Rollback date cannot be in the future' }, { status: 400 })
    }

    const investment = await prisma.investment.findUnique({
      where: { id },
      include: {
        account: true,
        dealParticipants: true,
      },
    })

    if (!investment) {
      return NextResponse.json({ error: 'Sukuk not found' }, { status: 404 })
    }

    const investmentStartAt = toDate(investment.startDate)
    if (investmentStartAt) {
      const startDay = new Date(
        investmentStartAt.getFullYear(),
        investmentStartAt.getMonth(),
        investmentStartAt.getDate(),
      )
      if (rollbackDay.getTime() < startDay.getTime()) {
        return NextResponse.json({ error: 'Rollback date cannot be before investment start date' }, { status: 400 })
      }
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

    const remainingPrincipal = Number(investment.principalAmount)
    if (!Number.isFinite(remainingPrincipal) || remainingPrincipal <= 0) {
      return NextResponse.json(
        { error: 'No principal balance remaining to rollback' },
        { status: 400 }
      )
    }

    const netProfit = computeNetProfit(investment)

    const updated = await prisma.$transaction(async (tx: any) => {
      const updatedInvestment = await tx.investment.update({
        where: { id },
        data: {
          principalAmount: 0,
          currentValue: Math.max(0, investment.currentValue - remainingPrincipal),
        },
      })

      if (user.role === 'PARTNER') {
        const participants = Array.isArray(investment.dealParticipants)
          ? investment.dealParticipants
          : []
        const acquiredAtRaw = participants[0]?.acquiredAt || investment.startDate
        const acquiredAt = acquiredAtRaw instanceof Date ? acquiredAtRaw : new Date(acquiredAtRaw)
        const haulStartDate = Number.isNaN(acquiredAt.getTime()) ? date : acquiredAt

        await createCashBucket(tx, {
          amount: remainingPrincipal,
          haulStartDate,
          currency: investment.account?.currency || 'SAR',
          label: `Sukuk Receipt • ${investment.name}`,
          date,
          notes: notes || null,
          investmentId: investment.id,
          type: 'ROLLBACK_PRINCIPAL',
          personId: user.personId || null,
        })
      } else {
        await creditBucketsForReceipt(tx, {
          investmentId: investment.id,
          amount: remainingPrincipal,
          principalReduction: remainingPrincipal,
          date,
          type: 'ROLLBACK_PRINCIPAL',
          notes: notes || null,
        })
      }

      await recomputeCashSetting(tx, user.role === 'PARTNER' ? (user.personId || null) : null)

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
          personId: user.role === 'OWNER' ? null : (user.personId || null),
          type: 'ROLLBACK_PRINCIPAL',
          amount: Math.abs(remainingPrincipal),
          date,
          description: notes || 'Rollback remaining principal',
          metadata: JSON.stringify({
            remainingPrincipal,
            netProfit,
          }),
        },
      })

      await logAudit(tx, {
        userId: user.id,
        action: 'UPDATE',
        entityType: 'SUKUK',
        entityId: investment.id,
        changes: JSON.stringify({
          rollback: {
            amount: remainingPrincipal,
            date,
          },
        }),
      })

      return updatedInvestment
    })

    return NextResponse.json({ success: true, investment: updated })
  } catch (error) {
    console.error('Rollback error:', error)
    let statusCode = 500
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        statusCode = 401
      } else if (error.message === 'Forbidden') {
        statusCode = 403
      }
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to rollback' },
      { status: statusCode }
    )
  }
}
