import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'
import { createAuditLog } from '@/lib/audit'
import { createCashBucket } from '@/lib/cashBuckets'
import { recomputeCashSetting } from '@/lib/cashBalance'

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

const round2 = (value: number) => {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100) / 100
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(['OWNER'])
    const { id } = await params
    const body = await req.json()
    const date = body.date ? new Date(body.date) : new Date()
    const notes = typeof body.notes === 'string' ? body.notes : ''

    if (body.date && Number.isNaN(date.getTime())) {
      return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
    }

    const investment = await prisma.investment.findUnique({
      where: { id },
      include: {
        account: true,
        transactions: true,
      },
    })

    if (!investment) {
      return NextResponse.json({ error: 'Investment not found' }, { status: 404 })
    }

    if (!user.personId) {
      return NextResponse.json({ error: 'User is missing a person profile' }, { status: 400 })
    }

    // Get commission plan from metadata
    const invMeta = parseMetadata(investment.metadata)
    const plannedCommissionRaw = Number(invMeta?.partnerCommissionPlan?.amount ?? 0)
    const plannedCommission = Number.isFinite(plannedCommissionRaw) ? Math.max(0, plannedCommissionRaw) : 0

    if (plannedCommission <= 0.01) {
      return NextResponse.json({ error: 'No commission plan found for this deal' }, { status: 400 })
    }

    // Calculate already received commission
    const transactions = Array.isArray(investment.transactions) ? investment.transactions : []
    const alreadyReceived = round2(
      transactions
        .filter((tx: any) => tx.type === 'PARTNER_COMMISSION')
        .filter((tx: any) => {
          if (user.personId && tx.personId !== user.personId) return false
          const meta = parseMetadata(tx.metadata)
          return meta?.source === 'PARTNER_CREATE_COMMISSION_PAYOUT' || meta?.source === 'OWNER_COMMISSION_RECEIPT'
        })
        .reduce((sum: number, tx: any) => {
          const amount = Number(tx.amount)
          return sum + (Number.isFinite(amount) ? Math.max(0, amount) : 0)
        }, 0)
    )

    const pendingCommission = round2(Math.max(0, plannedCommission - alreadyReceived))

    if (pendingCommission <= 0.01) {
      return NextResponse.json({ error: 'No pending commission to receive' }, { status: 400 })
    }

    // Determine commission hawl start date
    const commissionIssuedAtRaw = typeof invMeta?.partnerCommissionPlan?.issuedAt === 'string'
      ? invMeta.partnerCommissionPlan.issuedAt
      : null
    const commissionIssuedAt = commissionIssuedAtRaw ? new Date(commissionIssuedAtRaw) : null
    const issuedAtAnchor = commissionIssuedAt && !Number.isNaN(commissionIssuedAt.getTime())
      ? new Date(
          commissionIssuedAt.getFullYear(),
          commissionIssuedAt.getMonth(),
          commissionIssuedAt.getDate(),
        )
      : null
    const investmentStartRaw = investment.startDate ? new Date(investment.startDate as any) : null
    const investmentStartAnchor = investmentStartRaw && !Number.isNaN(investmentStartRaw.getTime())
      ? new Date(
          investmentStartRaw.getFullYear(),
          investmentStartRaw.getMonth(),
          investmentStartRaw.getDate(),
        )
      : null
    const commissionHaulStartDate = investmentStartAnchor || issuedAtAnchor || date

    const result = await prisma.$transaction(async (tx: any) => {
      // Create commission receipt bucket
      await createCashBucket(tx, {
        amount: pendingCommission,
        haulStartDate: commissionHaulStartDate,
        label: `${investment.name} Commission Receipt`,
        date,
        notes: notes || 'Commission from partner deal',
        investmentId: investment.id,
        type: 'CASH_IN',
        personId: null,
      })

      await recomputeCashSetting(tx, null)

      // Create cash account if needed
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
          personId: user.personId,
          type: 'PARTNER_COMMISSION',
          amount: pendingCommission,
          date,
          description: notes || `Commission received from partner deal ${investment.name}`,
          metadata: JSON.stringify({
            source: 'OWNER_COMMISSION_RECEIPT',
            plannedCommission,
            alreadyReceived,
            pendingCommission,
          }),
        },
      })

      await createAuditLog(user.id, 'UPDATE', 'INVESTMENT', id, {
        action: 'RECEIVE_COMMISSION',
        amount: pendingCommission,
        plannedCommission,
        alreadyReceived,
      })

      return { pendingCommission, plannedCommission, alreadyReceived }
    })

    return NextResponse.json({
      success: true,
      commissionReceived: result.pendingCommission,
      totalCommission: result.plannedCommission,
      previouslyReceived: result.alreadyReceived,
    })
  } catch (error) {
    console.error('Error receiving commission:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to receive commission' },
      { status: 500 }
    )
  }
}
