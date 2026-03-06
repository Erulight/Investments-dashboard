import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'
import { createAuditLog } from '@/lib/audit'
import { createSnapshot } from '@/lib/snapshot'

const CASH_BALANCE_KEY = 'CASH_BALANCE'

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

    // Find the SELL_TO_PARTNER transaction to get owner's profit share
    const sellTx = investment.transactions.find((t: any) => t.type === 'SELL_TO_PARTNER')
    if (!sellTx) {
      return NextResponse.json({ error: 'This is not a sold deal' }, { status: 400 })
    }

    const saleMeta = (() => {
      try {
        return sellTx.metadata ? JSON.parse(sellTx.metadata) : null
      } catch {
        return null
      }
    })()

    if (!saleMeta) {
      return NextResponse.json({ error: 'Invalid sale metadata' }, { status: 400 })
    }

    // Owner's profit share from the sale
    const ownerProfit = Math.round((Number(saleMeta.investorProfit) || 0) * 100) / 100

    // Check if commission was already paid
    const commissionTx = investment.transactions.find((t: any) => t.type === 'PARTNER_COMMISSION')
    const commissionAlreadyPaid = !!commissionTx

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
        const cashSetting = await tx.systemSetting.findUnique({
          where: { key: CASH_BALANCE_KEY },
        })
        const currentCash = cashSetting ? Number(cashSetting.value) : 0
        const nextCash = currentCash + ownerProfit

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
              }),
            },
          })
        }
      }

      // Mark investment as fully received
      await tx.investment.update({
        where: { id },
        data: {
          totalReceived: ownerProfit,
          receivableAmount: 0,
        },
      })

      await createAuditLog(user.id, 'UPDATE', 'INVESTMENT', id, {
        action: 'RECEIVE_SOLD_DEAL',
        ownerProfit,
        commissionAlreadyPaid,
      })

      return { ownerProfit, commissionAlreadyPaid }
    })

    return NextResponse.json({
      success: true,
      ownerProfit: result.ownerProfit,
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
