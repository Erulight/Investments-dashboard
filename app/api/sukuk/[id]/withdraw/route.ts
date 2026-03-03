import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'
import { logAudit } from '@/lib/audit'
import { creditBucketsForReceipt } from '@/lib/cashBuckets'
import { createCashBucket } from '@/lib/cashBuckets'

const CASH_BALANCE_KEY = 'CASH_BALANCE'

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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(['OWNER', 'PARTNER'])
    const { id } = await params
    const body = await req.json()

    const source = body.source === 'PRINCIPAL' ? 'PRINCIPAL' : 'PROFIT'
    const amount = Number(body.amount)
    const notes = typeof body.notes === 'string' ? body.notes : ''
    const date = body.date ? new Date(body.date) : new Date()

    if (body.date && Number.isNaN(date.getTime())) {
      return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
    }

    const today = new Date()
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate())
    if (dateStart.getTime() > todayStart.getTime()) {
      return NextResponse.json(
        { error: 'Withdrawal date cannot be in the future' },
        { status: 400 },
      )
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 })
    }

    const investment = await prisma.investment.findUnique({
      where: { id },
      include: {
        account: true,
        dealParticipants: true,
        transactions: true,
      },
    })

    if (!investment) {
      return NextResponse.json({ error: 'Sukuk not found' }, { status: 404 })
    }

    if (user.role === 'PARTNER') {
      if (!user.personId) {
        return NextResponse.json({ error: 'Partner is missing a person profile' }, { status: 400 })
      }

      console.log('PARTNER WITHDRAW START', {
        investmentId: id,
        userId: user.id,
        personId: user.personId,
        body,
      })

      const participants = Array.isArray(investment.dealParticipants)
        ? investment.dealParticipants
        : []

      const partnerParticipant = participants.find((p: any) => p?.personId === user.personId)
      if (!partnerParticipant) {
        return NextResponse.json(
          { error: 'You are not a participant in this deal' },
          { status: 403 },
        )
      }
    }

    if (user.role === 'OWNER') {
      if (source === 'PRINCIPAL' && amount > investment.principalAmount) {
        return NextResponse.json(
          { error: 'Amount exceeds principal amount' },
          { status: 400 }
        )
      }

      if (source === 'PROFIT') {
        const receivable = Number(investment.receivableAmount || 0)
        const received = Number(investment.totalReceived || 0)
        const remainingProfit = Math.max(0, (Number.isFinite(receivable) ? receivable : 0) - (Number.isFinite(received) ? received : 0))

        if (receivable <= 0.000001) {
          return NextResponse.json(
            { error: 'Profit receivable is not set for this deal' },
            { status: 400 },
          )
        }

        if (amount > remainingProfit + 0.000001) {
          return NextResponse.json(
            { error: 'Amount exceeds remaining profit receivable' },
            { status: 400 },
          )
        }
      }
    }

    const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate())
    const dayEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1)
    const reopenedAt = investment.reopenedAt ? new Date(investment.reopenedAt) : null
    const existingTransaction = await prisma.transaction.findFirst({
      where: {
        investmentId: investment.id,
        type: source === 'PROFIT' ? 'WITHDRAW_PROFIT' : 'WITHDRAW_PRINCIPAL',
        amount: Math.abs(amount),
        ...(reopenedAt && !Number.isNaN(reopenedAt.getTime())
          ? { createdAt: { gte: reopenedAt } }
          : {}),
        date: {
          gte: dayStart,
          lt: dayEnd,
        },
      },
    })

    if (existingTransaction) {
      return NextResponse.json(
        { error: 'A matching withdrawal already exists for this date' },
        { status: 409 }
      )
    }

    const updated = await prisma.$transaction(async (tx: any) => {
      const settleOwnerOnPartnerWithdraw = async () => {
        if (user.role !== 'PARTNER' || !user.personId) return

        const transactions = Array.isArray(investment.transactions) ? investment.transactions : []
        const saleTx = transactions
          .filter((t: any) => t.type === 'SELL_TO_PARTNER')
          .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]

        if (!saleTx) return
        const meta = parseMetadata(saleTx.metadata)
        const buyerPersonId = typeof meta?.buyerPersonId === 'string' ? meta.buyerPersonId : null
        if (!buyerPersonId || buyerPersonId !== user.personId) return

        const sellerPersonId = typeof saleTx.personId === 'string' ? saleTx.personId : null

        const profit = Number(meta?.accruedProfitAtSale ?? 0)
        const commission = Number(meta?.commissionAmount ?? 0)
        const pendingFromMetadata = (Number.isFinite(profit) ? Math.max(0, profit) : 0)
          + (Number.isFinite(commission) ? Math.max(0, commission) : 0)

        const ownerParticipant = sellerPersonId
          ? await tx.dealParticipant.findFirst({
              where: {
                investmentId: investment.id,
                personId: sellerPersonId,
              },
              select: { id: true, receivable: true },
            })
          : null
        const pendingFromParticipantRaw = Number(ownerParticipant?.receivable ?? 0)
        const pendingFromParticipant = Number.isFinite(pendingFromParticipantRaw)
          ? Math.max(0, pendingFromParticipantRaw)
          : 0

        const totalPending = Math.max(pendingFromMetadata, pendingFromParticipant)

        if (totalPending <= 0.000001) return

        const alreadySettled = transactions.some((t: any) => t.type === 'SOLD_DEAL_SETTLEMENT')
        if (alreadySettled) return

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

        const saleDate = saleTx.date ? new Date(saleTx.date) : date
        const haulStartDate = Number.isNaN(saleDate.getTime())
          ? date
          : new Date(saleDate.getFullYear(), saleDate.getMonth(), saleDate.getDate())

        await createCashBucket(tx, {
          amount: totalPending,
          haulStartDate,
          currency: investment.account?.currency || 'SAR',
          label: `Sold Deal Settlement · ${investment.name}`,
          date,
          notes: null,
          investmentId: investment.id,
          personId: null,
          type: 'CASH_IN',
        })

        await tx.transaction.create({
          data: {
            accountId: cashAccount.id,
            investmentId: investment.id,
            personId: null,
            type: 'SOLD_DEAL_SETTLEMENT',
            amount: Math.abs(totalPending),
            date,
            description: 'Settlement of sold deal profit/commission on partner withdrawal',
            metadata: JSON.stringify({
              sourceTxId: saleTx.id,
              buyerPersonId,
              sellerPersonId,
              paymentMode: meta?.paymentMode ?? null,
              pendingFromMetadata,
              pendingFromParticipant,
              totalPending,
            }),
          },
        })

        const cashSetting = await tx.systemSetting.findUnique({ where: { key: CASH_BALANCE_KEY } })
        const currentCashRaw = cashSetting ? Number(cashSetting.value) : 0
        const currentCash = Number.isFinite(currentCashRaw) ? currentCashRaw : 0
        const nextCash = currentCash + totalPending
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

        if (ownerParticipant) {
          await tx.dealParticipant.update({
            where: { id: ownerParticipant.id },
            data: { receivable: 0 },
          })
        }
      }

      let updatedInvestment = investment

      if (user.role === 'OWNER') {
        updatedInvestment = await tx.investment.update({
          where: { id },
          data: {
            totalReceived: source === 'PROFIT'
              ? investment.totalReceived + amount
              : investment.totalReceived,
            principalAmount: source === 'PRINCIPAL'
              ? investment.principalAmount - amount
              : investment.principalAmount,
            currentValue: Math.max(0, investment.currentValue - amount),
          },
        })
      }

      const scopeKey = user.role === 'OWNER' ? 'OWNER' : user.personId!
      const cashBalanceKey = user.role === 'OWNER' ? CASH_BALANCE_KEY : `${CASH_BALANCE_KEY}:${scopeKey}`

      const cashSetting = await tx.systemSetting.findUnique({
        where: { key: cashBalanceKey },
      })
      const currentCash = cashSetting ? Number(cashSetting.value) : 0
      const nextCash = currentCash + amount

      if (cashSetting) {
        await tx.systemSetting.update({
          where: { key: cashBalanceKey },
          data: { value: nextCash.toString() },
        })
      } else {
        await tx.systemSetting.create({
          data: {
            key: cashBalanceKey,
            value: nextCash.toString(),
            description: 'Available cash balance for investments',
          },
        })
      }

      if (user.role === 'PARTNER') {
        try {
          const partnerPersonId = user.personId!
          const participants = Array.isArray(investment.dealParticipants)
            ? investment.dealParticipants
            : []
          const partnerParticipant = participants.find((p: any) => p?.personId === partnerPersonId)

          console.log('PARTNER WITHDRAW PARTICIPANT LOOKUP', {
            investmentId: investment.id,
            partnerPersonId,
            participantsCount: participants.length,
            found: Boolean(partnerParticipant),
          })

          if (!partnerParticipant) {
            throw new Error('Forbidden')
          }

          const reopenedAtRaw = investment.reopenedAt ? new Date(investment.reopenedAt) : null
          const reopenedAt = reopenedAtRaw && !Number.isNaN(reopenedAtRaw.getTime()) ? reopenedAtRaw : null

          const sums = await tx.cashBucketMovement.groupBy({
            by: ['type'],
            where: {
              investmentId: investment.id,
              type: { in: ['WITHDRAW_PROFIT', 'WITHDRAW_PRINCIPAL'] },
              cashBucket: { personId: partnerPersonId },
              ...(reopenedAt ? { createdAt: { gte: reopenedAt } } : {}),
            } as any,
            _sum: { amount: true },
          })

          const withdrawnProfit = Math.abs(Number(sums.find((s: any) => s.type === 'WITHDRAW_PROFIT')?._sum?.amount || 0))
          const withdrawnPrincipal = Math.abs(Number(sums.find((s: any) => s.type === 'WITHDRAW_PRINCIPAL')?._sum?.amount || 0))

          const principalCapRaw = Number(partnerParticipant.investedAmount || 0)
          const profitCapRaw = Number(partnerParticipant.receivable || 0)

          const principalCap = Number.isFinite(principalCapRaw) ? principalCapRaw : 0
          const profitCap = Number.isFinite(profitCapRaw) ? profitCapRaw : 0

          const remainingPrincipal = Math.max(0, principalCap - withdrawnPrincipal)
          const remainingProfit = Math.max(0, profitCap - withdrawnProfit)

          console.log('PARTNER WITHDRAW CAPS', {
            investmentId: investment.id,
            partnerPersonId,
            source,
            amount,
            principalCap,
            withdrawnPrincipal,
            remainingPrincipal,
            profitCap,
            withdrawnProfit,
            remainingProfit,
          })

          if (source === 'PRINCIPAL' && amount > remainingPrincipal + 0.000001) {
            throw new Error('AMOUNT_EXCEEDS_PARTNER_PRINCIPAL')
          }
          if (source === 'PROFIT' && amount > remainingProfit + 0.000001) {
            throw new Error('AMOUNT_EXCEEDS_PARTNER_PROFIT')
          }

          console.log('PARTNER WITHDRAW creditBucketsForReceipt START', {
            investmentId: investment.id,
            partnerPersonId,
            amount,
            source,
          })

          await creditBucketsForReceipt(tx, {
            investmentId: investment.id,
            amount,
            principalReduction: source === 'PRINCIPAL' ? amount : 0,
            date,
            type: source === 'PROFIT' ? 'WITHDRAW_PROFIT' : 'WITHDRAW_PRINCIPAL',
            notes: notes || null,
            personId: partnerPersonId,
            profitHaulStartDate: partnerParticipant.acquiredAt ? new Date(partnerParticipant.acquiredAt) : undefined,
          })

          console.log('PARTNER WITHDRAW creditBucketsForReceipt DONE', {
            investmentId: investment.id,
            partnerPersonId,
          })

          await tx.dealParticipant.update({
            where: { id: partnerParticipant.id },
            data: {
              investedAmount: source === 'PRINCIPAL'
                ? Math.max(0, Number(partnerParticipant.investedAmount || 0) - amount)
                : partnerParticipant.investedAmount,
              currentValue: source === 'PRINCIPAL'
                ? Math.max(0, Number(partnerParticipant.currentValue || 0) - amount)
                : partnerParticipant.currentValue,
              receivable: source === 'PROFIT'
                ? Math.max(0, Number(partnerParticipant.receivable || 0) - amount)
                : partnerParticipant.receivable,
              profit: source === 'PROFIT'
                ? Math.max(0, Number(partnerParticipant.profit || 0) - amount)
                : partnerParticipant.profit,
            },
          })

          await settleOwnerOnPartnerWithdraw()
        } catch (err) {
          console.error('PARTNER WITHDRAW ERROR (inside tx):', err)
          throw err
        }
      } else {
        await creditBucketsForReceipt(tx, {
          investmentId: investment.id,
          amount,
          principalReduction: source === 'PRINCIPAL' ? amount : 0,
          date,
          type: source === 'PROFIT' ? 'WITHDRAW_PROFIT' : 'WITHDRAW_PRINCIPAL',
          notes: notes || null,
          personId: null,
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

      await tx.transaction.create({
        data: {
          accountId: cashAccount.id,
          investmentId: investment.id,
          personId: user.personId || null,
          type: source === 'PROFIT' ? 'WITHDRAW_PROFIT' : 'WITHDRAW_PRINCIPAL',
          amount: Math.abs(amount),
          date,
          description: notes || null,
          metadata: JSON.stringify({ source }),
        },
      })

      await logAudit(tx, {
        userId: user.id,
        action: 'UPDATE',
        entityType: 'SUKUK',
        entityId: investment.id,
        changes: JSON.stringify({
          withdraw: {
            source,
            amount,
            date,
          },
        }),
      })

      return updatedInvestment
    })

    return NextResponse.json({ success: true, investment: updated })
  } catch (error) {
    console.error('Withdraw error:', error)

    if (error && typeof error === 'object') {
      // Prefer explicit error logging for partner withdrawals since they have been hanging/silently failing.
      try {
        const user = await requireAuth(['OWNER', 'PARTNER'])
        if (user.role === 'PARTNER') {
          console.error('PARTNER WITHDRAW ERROR:', error)
          return NextResponse.json({ error: String(error) }, { status: 500 })
        }
      } catch {
        // ignore
      }
    }

    let statusCode = 500
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        statusCode = 401
      } else if (error.message === 'Forbidden') {
        statusCode = 403
      } else if (error.message === 'AMOUNT_EXCEEDS_PARTNER_PRINCIPAL') {
        statusCode = 400
      } else if (error.message === 'AMOUNT_EXCEEDS_PARTNER_PROFIT') {
        statusCode = 400
      }
    }

    return NextResponse.json(
      {
        error: error instanceof Error
          ? error.message === 'AMOUNT_EXCEEDS_PARTNER_PRINCIPAL'
            ? 'Amount exceeds your remaining principal'
            : error.message === 'AMOUNT_EXCEEDS_PARTNER_PROFIT'
              ? 'Amount exceeds your remaining profit'
              : error.message
          : 'Failed to withdraw',
      },
      { status: statusCode }
    )
  }
}
