import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'
import { logAudit } from '@/lib/audit'
import { creditBucketsForReceipt } from '@/lib/cashBuckets'

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
    const user = await requireAuth(['OWNER'])
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const date = body.date ? new Date(body.date) : new Date()
    const notes = typeof body.notes === 'string' ? body.notes : ''

    const investment = await prisma.investment.findUnique({
      where: { id },
      include: { account: true },
    })

    if (!investment) {
      return NextResponse.json({ error: 'Sukuk not found' }, { status: 404 })
    }

    const remainingPrincipal = Number(investment.principalAmount)
    if (!Number.isFinite(remainingPrincipal) || remainingPrincipal <= 0) {
      return NextResponse.json(
        { error: 'No principal balance remaining to rollback' },
        { status: 400 }
      )
    }

    const netProfit = computeNetProfit(investment)
    if (netProfit > 0 && investment.totalReceived < netProfit - 0.01) {
      return NextResponse.json(
        { error: 'Receivable not fully received yet' },
        { status: 400 }
      )
    }

    const updated = await prisma.$transaction(async (tx) => {
      const updatedInvestment = await tx.investment.update({
        where: { id },
        data: {
          principalAmount: 0,
          currentValue: Math.max(0, investment.currentValue - remainingPrincipal),
        },
      })

      const cashSetting = await tx.systemSetting.findUnique({
        where: { key: 'CASH_BALANCE' },
      })
      const currentCash = cashSetting ? Number(cashSetting.value) : 0
      const nextCash = currentCash + remainingPrincipal

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

      await creditBucketsForReceipt(tx, {
        investmentId: investment.id,
        amount: remainingPrincipal,
        principalReduction: remainingPrincipal,
        date,
        type: 'ROLLBACK_PRINCIPAL',
        notes: notes || null,
      })

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
