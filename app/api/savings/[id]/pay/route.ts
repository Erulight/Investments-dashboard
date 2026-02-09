import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { requireModuleAccess } from '@/lib/rbac'
import { createAuditLog } from '@/lib/audit'

type PayBody = {
  monthIndex: number
  amount: number
  reward?: number
  paidDate?: string
}

type UnpayBody = {
  monthIndex: number
}

const addMonths = (date: Date, months: number) => {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireModuleAccess('savings')
    const user = await getCurrentUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (user.role !== 'OWNER') {
      return NextResponse.json(
        { error: 'Only owners can record monthly contributions' },
        { status: 403 }
      )
    }

    const { id } = await params

    const investment = await prisma.investment.findUnique({
      where: { id },
      include: { account: true },
    })

    if (!investment || investment.account?.type !== 'CIRCLYS') {
      return NextResponse.json({ error: 'Savings plan not found' }, { status: 404 })
    }

    const body = (await req.json()) as PayBody

    const monthIndex = Number(body.monthIndex)
    const amount = Number(body.amount)
    const reward = body.reward !== undefined ? Number(body.reward) : 0

    if (!Number.isInteger(monthIndex) || monthIndex < 0) {
      return NextResponse.json({ error: 'Invalid monthIndex' }, { status: 400 })
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })
    }

    if (!Number.isFinite(reward) || reward < 0) {
      return NextResponse.json({ error: 'Invalid reward' }, { status: 400 })
    }

    const meta = (() => {
      try {
        return JSON.parse(investment.metadata || '{}')
      } catch {
        return {}
      }
    })()

    const totalMonths = Number(meta.totalMonths || 0)
    if (totalMonths > 0 && monthIndex >= totalMonths) {
      return NextResponse.json({ error: 'monthIndex exceeds plan totalMonths' }, { status: 400 })
    }

    const payments: Record<string, any> = meta.payments && typeof meta.payments === 'object' ? meta.payments : {}
    if (payments[String(monthIndex)]?.bucketId) {
      return NextResponse.json({ error: 'This month is already paid' }, { status: 400 })
    }

    const paidDate = body.paidDate ? new Date(body.paidDate) : new Date()
    if (isNaN(paidDate.getTime())) {
      return NextResponse.json({ error: 'Invalid paidDate' }, { status: 400 })
    }

    const dueDate = addMonths(new Date(investment.startDate), monthIndex)
    const monthLabel = `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, '0')}`

    const bucket = await prisma.cashBucket.create({
      data: {
        label: `Circlys • ${investment.name} • ${monthLabel}`,
        currency: investment.account?.currency || 'SAR',
        haulStartDate: paidDate,
        balance: amount + reward,
        movements: {
          create: [
            {
              investmentId: investment.id,
              amount,
              type: 'SAVINGS_CONTRIBUTION',
              date: paidDate,
              notes: `Month ${monthIndex + 1}`,
            },
            ...(reward > 0
              ? [
                  {
                    investmentId: investment.id,
                    amount: reward,
                    type: 'SAVINGS_REWARD',
                    date: paidDate,
                    notes: `Month ${monthIndex + 1}`,
                  },
                ]
              : []),
          ],
        },
      },
      select: { id: true, label: true, currency: true, haulStartDate: true, balance: true },
    })

    const nextPayments = {
      ...payments,
      [String(monthIndex)]: {
        monthIndex,
        dueDate: dueDate.toISOString(),
        paidDate: paidDate.toISOString(),
        amount,
        reward,
        bucketId: bucket.id,
      },
    }

    const totalPaid = Object.values(nextPayments).reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0)
    const totalRewardPaid = Object.values(nextPayments).reduce((sum: number, p: any) => sum + (Number(p.reward) || 0), 0)
    const monthsPaid = Object.keys(nextPayments).length

    const updated = await prisma.investment.update({
      where: { id: investment.id },
      data: {
        principalAmount: totalPaid,
        currentValue: totalPaid + totalRewardPaid,
        metadata: JSON.stringify({
          ...meta,
          payments: nextPayments,
          monthsPaid,
          totalPaid,
          totalRewardPaid,
        }),
      },
      include: { account: true },
    })

    await createAuditLog(user.id, 'CREATE', 'CASH_BUCKET', bucket.id, {
      type: 'CIRCLYS_CONTRIBUTION',
      investmentId: investment.id,
      monthIndex,
      amount,
      reward,
    })

    return NextResponse.json({ investment: updated, bucket })
  } catch (error) {
    console.error('Error paying savings month:', error)
    return NextResponse.json({ error: 'Failed to record payment' }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireModuleAccess('savings')
    const user = await getCurrentUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (user.role !== 'OWNER') {
      return NextResponse.json(
        { error: 'Only owners can undo monthly contributions' },
        { status: 403 }
      )
    }

    const { id } = await params

    const investment = await prisma.investment.findUnique({
      where: { id },
      include: { account: true },
    })

    if (!investment || investment.account?.type !== 'CIRCLYS') {
      return NextResponse.json({ error: 'Savings plan not found' }, { status: 404 })
    }

    const body = (await req.json()) as UnpayBody
    const monthIndex = Number(body.monthIndex)

    if (!Number.isInteger(monthIndex) || monthIndex < 0) {
      return NextResponse.json({ error: 'Invalid monthIndex' }, { status: 400 })
    }

    const meta = (() => {
      try {
        return JSON.parse(investment.metadata || '{}')
      } catch {
        return {}
      }
    })()

    const payments: Record<string, any> =
      meta.payments && typeof meta.payments === 'object' ? meta.payments : {}

    const existing = payments[String(monthIndex)]
    const bucketId = existing?.bucketId

    if (!bucketId) {
      return NextResponse.json({ error: 'This month is not paid' }, { status: 400 })
    }

    await prisma.cashBucket.delete({ where: { id: bucketId } })

    const nextPayments = { ...payments }
    delete nextPayments[String(monthIndex)]

    const totalPaid = Object.values(nextPayments).reduce(
      (sum: number, p: any) => sum + (Number(p.amount) || 0),
      0
    )
    const totalRewardPaid = Object.values(nextPayments).reduce(
      (sum: number, p: any) => sum + (Number(p.reward) || 0),
      0
    )
    const monthsPaid = Object.keys(nextPayments).length

    const updated = await prisma.investment.update({
      where: { id: investment.id },
      data: {
        principalAmount: totalPaid,
        currentValue: totalPaid + totalRewardPaid,
        metadata: JSON.stringify({
          ...meta,
          payments: nextPayments,
          monthsPaid,
          totalPaid,
          totalRewardPaid,
        }),
      },
      include: { account: true },
    })

    await createAuditLog(user.id, 'DELETE', 'CASH_BUCKET', bucketId, {
      type: 'CIRCLYS_CONTRIBUTION_UNDO',
      investmentId: investment.id,
      monthIndex,
    })

    return NextResponse.json({ investment: updated })
  } catch (error) {
    console.error('Error undoing savings month payment:', error)
    return NextResponse.json({ error: 'Failed to undo payment' }, { status: 500 })
  }
}
