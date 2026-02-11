import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'
import { logAudit } from '@/lib/audit'
import { creditBucketsForReceipt } from '@/lib/cashBuckets'
import { createCashBucket } from '@/lib/cashBuckets'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(['OWNER', 'PARTNER'])
    const { id } = await params
    const body = await req.json()

    const buyerPersonId = typeof body.buyerPersonId === 'string' ? body.buyerPersonId : ''
    const amount = Number(body.amount)
    const salePrice = body.salePrice !== undefined ? Number(body.salePrice) : amount
    const commissionType = body.commissionType === 'PERCENT' ? 'PERCENT' : body.commissionType === 'FIXED' ? 'FIXED' : 'FIXED'
    const commissionValueRaw = body.commissionValue !== undefined ? Number(body.commissionValue) : 0
    const notes = typeof body.notes === 'string' ? body.notes : ''
    const date = body.date ? new Date(body.date) : new Date()

    if (!buyerPersonId) {
      return NextResponse.json({ error: 'Buyer is required' }, { status: 400 })
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 })
    }
    if (!Number.isFinite(salePrice) || salePrice < 0) {
      return NextResponse.json({ error: 'Sale price must be 0 or more' }, { status: 400 })
    }
    if (!Number.isFinite(commissionValueRaw) || commissionValueRaw < 0) {
      return NextResponse.json({ error: 'Commission must be 0 or more' }, { status: 400 })
    }

    let investment = await prisma.investment.findUnique({
      where: { id },
      include: { dealParticipants: { include: { person: true } }, account: true },
    })

    if (!investment) {
      return NextResponse.json({ error: 'Sukuk not found' }, { status: 404 })
    }

    if (investment.dealParticipants.length === 0) {
      if (user.role !== 'OWNER') {
        return NextResponse.json({ error: 'Seller does not own this Sukuk' }, { status: 400 })
      }

      if (!user.personId) {
        return NextResponse.json({ error: 'Seller is missing a person profile' }, { status: 400 })
      }

      await prisma.dealParticipant.create({
        data: {
          investmentId: investment.id,
          personId: user.personId,
          investedAmount: investment.principalAmount,
          currentValue: investment.currentValue,
          receivable: investment.receivableAmount || 0,
          profit: investment.unrealizedProfit || 0,
          acquiredAt: investment.startDate,
          sharePercentage: 100,
        },
      })

      investment = await prisma.investment.findUnique({
        where: { id },
        include: { dealParticipants: { include: { person: true } }, account: true },
      })

      if (!investment) {
        return NextResponse.json({ error: 'Sukuk not found' }, { status: 404 })
      }
    }

    if (!user.personId) {
      return NextResponse.json({ error: 'Seller is missing a person profile' }, { status: 400 })
    }

    if (buyerPersonId === user.personId) {
      return NextResponse.json({ error: 'Buyer must be different from seller' }, { status: 400 })
    }

    const seller =
      investment.dealParticipants.find((p: any) => p.personId === user.personId) ||
      investment.dealParticipants.find((p: any) => (p.person?.email ? p.person.email === user.email : false)) ||
      investment.dealParticipants.find((p: any) => (p.person?.name ? p.person.name === user.name : false))

    if (!seller) {
      return NextResponse.json(
        {
          error: 'Seller does not own this Sukuk',
          debug: {
            user: {
              id: user.id,
              role: user.role,
              personId: user.personId,
              email: (user as any).email,
              name: (user as any).name,
            },
            participants: investment.dealParticipants.map((p: any) => ({
              id: p.id,
              personId: p.personId,
              personEmail: p.person?.email || null,
              personName: p.person?.name || null,
              investedAmount: p.investedAmount,
            })),
          },
        },
        { status: 400 }
      )
    }

    const sellerPersonId = seller.personId

    if (amount > seller.investedAmount) {
      return NextResponse.json({ error: 'Amount exceeds your principal' }, { status: 400 })
    }

    const ratio = seller.investedAmount > 0 ? amount / seller.investedAmount : 0
    const currentValueTransfer = seller.currentValue * ratio
    const profitTransfer = 0
    const accruedProfitAtSale = Math.max(0, currentValueTransfer - amount)
    const commissionAmount = commissionType === 'PERCENT'
      ? Math.max(0, (salePrice * commissionValueRaw) / 100)
      : Math.max(0, commissionValueRaw)
    const sharePercentage = investment.principalAmount > 0
      ? (amount / investment.principalAmount) * 100
      : null

    const updated = await prisma.$transaction(async (tx: any) => {
      const sellerRemaining = seller.investedAmount - amount
      if (sellerRemaining <= 0.000001) {
        await tx.dealParticipant.delete({
          where: { id: seller.id },
        })
      } else {
        await tx.dealParticipant.update({
          where: { id: seller.id },
          data: {
            investedAmount: sellerRemaining,
            currentValue: Math.max(0, seller.currentValue - currentValueTransfer),
            sharePercentage: investment.principalAmount > 0
              ? (sellerRemaining / investment.principalAmount) * 100
              : seller.sharePercentage,
          },
        })
      }

      const buyer = await tx.dealParticipant.findFirst({
        where: { investmentId: investment.id, personId: buyerPersonId },
      })

      if (buyer) {
        await tx.dealParticipant.update({
          where: { id: buyer.id },
          data: {
            investedAmount: buyer.investedAmount + amount,
            currentValue: buyer.currentValue + currentValueTransfer,
            acquiredAt: buyer.acquiredAt || date,
            commissionFees: (buyer.commissionFees || 0) + commissionAmount,
            sharePercentage: investment.principalAmount > 0
              ? ((buyer.investedAmount + amount) / investment.principalAmount) * 100
              : buyer.sharePercentage,
          },
        })
      } else {
        await tx.dealParticipant.create({
          data: {
            investmentId: investment.id,
            personId: buyerPersonId,
            investedAmount: amount,
            currentValue: currentValueTransfer,
            acquiredAt: date,
            commissionFees: commissionAmount,
            sharePercentage,
          },
        })
      }

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

      await tx.transaction.createMany({
        data: [
          {
            accountId: cashAccount.id,
            investmentId: investment.id,
            personId: sellerPersonId,
            type: 'SELL_TO_PARTNER',
            amount: Math.abs(salePrice),
            date,
            description: notes || null,
            metadata: JSON.stringify({
              buyerPersonId,
              principalTransferred: amount,
              salePrice,
              commissionAmount,
              accruedProfitAtSale,
            }),
          },
          ...(accruedProfitAtSale > 0
            ? [
                {
                  accountId: cashAccount.id,
                  investmentId: investment.id,
                  personId: sellerPersonId,
                  type: 'SELL_PROFIT_ACCRUED',
                  amount: Math.abs(accruedProfitAtSale),
                  date,
                  description: notes || 'Accrued profit realized at sale',
                  metadata: JSON.stringify({
                    buyerPersonId,
                    principalTransferred: amount,
                    salePrice,
                    commissionAmount,
                    accruedProfitAtSale,
                  }),
                },
              ]
            : []),
          ...(commissionAmount > 0
            ? [
                {
                  accountId: cashAccount.id,
                  investmentId: null,
                  personId: sellerPersonId,
                  type: 'PARTNER_COMMISSION',
                  amount: Math.abs(commissionAmount),
                  date,
                  description: notes || 'Partner commission',
                  metadata: JSON.stringify({
                    buyerPersonId,
                    investmentId: investment.id,
                    principalTransferred: amount,
                    salePrice,
                    commissionType,
                    commissionValue: commissionValueRaw,
                    commissionAmount,
                    accruedProfitAtSale,
                  }),
                },
              ]
            : []),
          {
            accountId: investment.accountId,
            investmentId: investment.id,
            personId: buyerPersonId,
            type: 'BUY_FROM_PARTNER',
            amount: -Math.abs(salePrice),
            date,
            description: notes || null,
            metadata: JSON.stringify({
              sellerPersonId,
              principalTransferred: amount,
              salePrice,
              commissionAmount,
              accruedProfitAtSale,
            }),
          },
        ],
      })

      const cashSetting = await tx.systemSetting.findUnique({
        where: { key: 'CASH_BALANCE' },
      })
      const currentCash = cashSetting ? Number(cashSetting.value) : 0
      const nextCash = currentCash + salePrice + commissionAmount + accruedProfitAtSale

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
        amount: salePrice + accruedProfitAtSale,
        principalReduction: amount,
        date,
        type: 'SELL_RECEIPT',
        notes: notes || null,
      })

      if (commissionAmount > 0) {
        await createCashBucket(tx, {
          amount: commissionAmount,
          haulStartDate: date,
          currency: investment.account?.currency || 'SAR',
          label: 'Partner Commission',
          date,
          notes: notes || null,
          type: 'CASH_IN',
        })
      }

      await logAudit(tx, {
        userId: user.id,
        action: 'UPDATE',
        entityType: 'SUKUK',
        entityId: investment.id,
        changes: JSON.stringify({
          sell: {
            buyerPersonId,
            amount,
            salePrice,
            commissionType,
            commissionValue: commissionValueRaw,
            commissionAmount,
            date,
          },
        }),
      })

      return { success: true }
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Sell error:', error)

    let statusCode = 500
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        statusCode = 401
      } else if (error.message === 'Forbidden') {
        statusCode = 403
      }
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to sell' },
      { status: statusCode }
    )
  }
}
