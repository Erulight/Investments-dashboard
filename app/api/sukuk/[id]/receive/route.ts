import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'
import { createAuditLog } from '@/lib/audit'
import { createSnapshot } from '@/lib/snapshot'
import { creditBucketsForReceipt } from '@/lib/cashBuckets'
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

    const investment = await prisma.investment.findUnique({
      where: { id },
      include: {
        dealParticipants: { include: { person: true } },
        transactions: true,
        account: true,
      },
    })

    if (!investment) {
      return NextResponse.json({ error: 'Investment not found' }, { status: 404 })
    }

    if (!user.personId) {
      return NextResponse.json({ error: 'User is missing a person profile' }, { status: 400 })
    }

    // Find latest owner sale transaction for this sold cycle.
    const ownerSellTxs = investment.transactions
      .filter((t: any) => t.type === 'SELL_TO_PARTNER' && (!user.personId || t.personId === user.personId))
      .map((t: any) => {
        const d = new Date(t.date)
        return {
          tx: t,
          date: Number.isNaN(d.getTime()) ? null : d,
          meta: parseMetadata(t.metadata),
        }
      })
      .filter((x: any) => x.date)
      .sort((a: any, b: any) => (b.date as Date).getTime() - (a.date as Date).getTime())

    const latestSell = ownerSellTxs[0] || null
    const sellTx = latestSell?.tx || null
    if (!sellTx) {
      return NextResponse.json({ error: 'This is not a sold deal' }, { status: 400 })
    }

    const saleMeta = latestSell?.meta || null

    if (!saleMeta) {
      return NextResponse.json({ error: 'Invalid sale metadata' }, { status: 400 })
    }

    const openPartnerHolders = (Array.isArray(investment.dealParticipants) ? investment.dealParticipants : [])
      .filter((p: any) => p?.personId && p.personId !== user.personId)
      .filter((p: any) => {
        const invested = Number(p?.investedAmount || 0)
        return Number.isFinite(invested) && invested > 0.01
      })

    const ownerParticipant = (Array.isArray(investment.dealParticipants) ? investment.dealParticipants : [])
      .find((p: any) => p?.personId === user.personId)
    const ownerPrincipal = Number(ownerParticipant?.investedAmount || 0)
    if (Number.isFinite(ownerPrincipal) && ownerPrincipal > 0.01) {
      return NextResponse.json(
        { error: 'This deal has active owner principal and is not eligible for sold-deal receive' },
        { status: 409 },
      )
    }

    if (openPartnerHolders.length > 0) {
      const holderNames = openPartnerHolders
        .map((p: any) => p?.person?.name || p?.personId)
        .filter(Boolean)
      return NextResponse.json(
        {
          error: `Cannot receive sold deal before partner closes position. Remaining holders: ${holderNames.join(', ')}`,
        },
        { status: 409 },
      )
    }

    const soldAt = latestSell?.date as Date

    // Owner's earned profit from this sold cycle.
    // Prefer accruedProfitAtSale (includes fee recovery), fallback to investorProfit.
    const ownerProfitTarget = round2(
      Math.max(0, Number(saleMeta.accruedProfitAtSale ?? saleMeta.investorProfit ?? 0) || 0)
    )

    // Amount already received for this sold cycle.
    const alreadyReceived = round2(
      investment.transactions.reduce((sum: number, t: any) => {
        if (user.personId && t.personId !== user.personId) return sum

        const txDate = new Date(t.date)
        if (Number.isNaN(txDate.getTime())) return sum
        if (soldAt && txDate.getTime() < soldAt.getTime()) return sum

        if (t.type === 'SELL_PROFIT_ACCRUED') {
          const amount = Number(t.amount)
          return sum + (Number.isFinite(amount) ? Math.max(0, amount) : 0)
        }

        if (t.type === 'WITHDRAW_PROFIT') {
          const meta = parseMetadata(t.metadata)
          if (meta?.source !== 'SOLD_DEAL_RECEIPT') return sum
          const amount = Number(t.amount)
          return sum + (Number.isFinite(amount) ? Math.max(0, amount) : 0)
        }

        return sum
      }, 0)
    )

    // Only receive the remaining amount (idempotent).
    const ownerProfit = round2(Math.max(0, ownerProfitTarget - alreadyReceived))

    const commissionAlreadyPaid = investment.transactions.some(
      (t: any) => t.type === 'PARTNER_COMMISSION' && (!user.personId || t.personId === user.personId)
    )

    if (ownerProfit <= 0.01) {
      const reconciledTotalReceived = round2(
        Math.max(Number(investment.totalReceived || 0), Math.min(ownerProfitTarget, alreadyReceived))
      )

      if (
        Number(investment.receivableAmount || 0) > 0.01 ||
        Math.abs(Number(investment.totalReceived || 0) - reconciledTotalReceived) > 0.01
      ) {
        await prisma.investment.update({
          where: { id },
          data: {
            totalReceived: reconciledTotalReceived,
            receivableAmount: 0,
          },
        })
      }

      return NextResponse.json({
        success: true,
        ownerProfit: 0,
        ownerProfitTarget,
        alreadyReceived,
        commissionAlreadyPaid,
      })
    }

    // Snapshot before receiving
    await createSnapshot(prisma as any, {
      label: `Before: Receive ${investment.name}`,
      trigger: 'RECEIVE',
      userId: user.id,
      investmentId: investment.id,
      personId: user.personId,
    })

    const result = await prisma.$transaction(async (tx: any) => {
      // Only add profit if there's profit to receive
      if (ownerProfit > 0) {
        await creditBucketsForReceipt(tx, {
          investmentId: investment.id,
          amount: ownerProfit,
          principalReduction: 0,
          date: new Date(),
          type: 'WITHDRAW_PROFIT',
          notes: `Sold deal receipt • ${investment.name}`,
          personId: null,
        })

        await recomputeCashSetting(tx, null)

        // Create cash account if needed
        const cashAccount = await tx.account.findFirst({
          where: { type: 'CASH', isActive: true },
        })

        if (cashAccount) {
          await tx.transaction.create({
            data: {
              accountId: cashAccount.id,
              investmentId: investment.id,
              personId: user.personId,
              type: 'WITHDRAW_PROFIT',
              amount: ownerProfit,
              date: new Date(),
              description: `Profit received from sold deal ${investment.name}`,
              metadata: JSON.stringify({
                source: 'SOLD_DEAL_RECEIPT',
                originalSalePrice: saleMeta.salePrice,
                investorProfit: ownerProfit,
                ownerProfitTarget,
                alreadyReceived,
              }),
            },
          })
        }
      }

      // Mark sold-cycle receivable as settled for owner view.
      await tx.investment.update({
        where: { id },
        data: {
          totalReceived: round2(Math.max(Number(investment.totalReceived || 0), alreadyReceived + ownerProfit)),
          receivableAmount: 0,
        },
      })

      await createAuditLog(user.id, 'UPDATE', 'INVESTMENT', id, {
        action: 'RECEIVE_SOLD_DEAL',
        ownerProfit,
        ownerProfitTarget,
        alreadyReceived,
        commissionAlreadyPaid,
      })

      return { ownerProfit, ownerProfitTarget, alreadyReceived, commissionAlreadyPaid }
    })

    return NextResponse.json({
      success: true,
      ownerProfit: result.ownerProfit,
      ownerProfitTarget: result.ownerProfitTarget,
      alreadyReceived: result.alreadyReceived,
      commissionAlreadyPaid: result.commissionAlreadyPaid,
    })
  } catch (error) {
    console.error('Error receiving sold deal:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to receive sold deal' },
      { status: 500 }
    )
  }
}
