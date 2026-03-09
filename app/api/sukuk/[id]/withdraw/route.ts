import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'
import { logAudit } from '@/lib/audit'
import { creditBucketsForReceipt } from '@/lib/cashBuckets'
import { createCashBucket } from '@/lib/cashBuckets'
import { createSnapshot } from '@/lib/snapshot'

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

const round2 = (value: number) => Math.round((Number(value) || 0) * 100) / 100

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
      try {
        if (!user.personId) {
          return NextResponse.json(
            { error: 'Partner is missing a person profile' },
            { status: 400 },
          )
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
      } catch (err) {
        console.error('PARTNER WITHDRAW ERROR:', err)
        return NextResponse.json({ error: String(err) }, { status: 500 })
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

        // Work in cents to avoid floating-point rounding issues
        const receivableCents = Math.round(receivable * 100)
        const receivedCents = Math.round(received * 100)
        const remainingProfitCents = Math.max(0, receivableCents - receivedCents)
        const amountCents = Math.round(amount * 100)

        // Allow 1-cent tolerance for rounding
        if (amountCents - remainingProfitCents > 1) {
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
      // Creating a full snapshot is expensive; for partner close-position flow
      // it can make the modal appear stuck on "Processing".
      // Keep snapshots for owner withdrawals where full rollback is most critical.
      if (user.role === 'OWNER') {
        await createSnapshot(tx, {
          label: `Before: Withdraw ${source.toLowerCase()} from ${investment.name}`,
          trigger: 'WITHDRAW',
          userId: user.id,
          investmentId: investment.id,
          personId: user.personId || undefined,
        })
      }
      // NOTE: SOLD_DEAL_SETTLEMENT and PARTNER_COMMISSION should NOT be created here
      // They should only be created when the OWNER withdraws from their own deal
      // When a PARTNER closes their position, no settlement/commission transactions should be created
      const settleOwnerOnPartnerWithdraw = async () => {
        // This function is intentionally empty
        // Partner withdrawals do not affect owner's cash balance
        return
      }

      let updatedInvestment = investment

      if (user.role === 'OWNER') {
        // OWNER can always withdraw requested profit; skip remaining profit validation
        if (source === 'PROFIT') {
          // no validation
        }
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
          const partnerMaxProfitRaw = Number(partnerParticipant.profit || 0)

          const principalCap = Number.isFinite(principalCapRaw) ? principalCapRaw : 0
          const partnerMaxProfit = Number.isFinite(partnerMaxProfitRaw) ? partnerMaxProfitRaw : 0

          const remainingPrincipal = Math.max(0, principalCap - withdrawnPrincipal)
          const remainingProfit = Math.max(0, partnerMaxProfit - withdrawnProfit)

          console.log('PARTNER WITHDRAW CAPS', {
            investmentId: investment.id,
            partnerPersonId,
            source,
            amount,
            principalCap,
            withdrawnPrincipal,
            remainingPrincipal,
            partnerMaxProfit,
            withdrawnProfit,
            remainingProfit,
          })

          if (source === 'PRINCIPAL' && amount > remainingPrincipal + 0.01) {
            throw new Error('AMOUNT_EXCEEDS_PARTNER_PRINCIPAL')
          }
          if (source === 'PROFIT' && amount > remainingProfit + 0.01) {
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

          if (source === 'PROFIT') {
            const invMeta = parseMetadata(investment.metadata)
            const commissionPlan = invMeta?.partnerCommissionPlan && typeof invMeta.partnerCommissionPlan === 'object'
              ? invMeta.partnerCommissionPlan
              : null

            const plannedCommissionRaw = Number(commissionPlan?.amount ?? 0)
            const plannedCommission = Number.isFinite(plannedCommissionRaw)
              ? Math.max(0, plannedCommissionRaw)
              : 0

            const partnerProfitTargetRaw = Number(commissionPlan?.partnerNetReceivable ?? 0)
            const partnerProfitTarget = Number.isFinite(partnerProfitTargetRaw)
              ? Math.max(0, partnerProfitTargetRaw)
              : 0
            const commissionMaturityRaw = typeof commissionPlan?.maturityDate === 'string'
              ? commissionPlan.maturityDate
              : null
            const commissionMaturity = commissionMaturityRaw ? new Date(commissionMaturityRaw) : null
            const canPayoutNow = !commissionMaturity || Number.isNaN(commissionMaturity.getTime())
              ? true
              : date.getTime() >= commissionMaturity.getTime()

            if (plannedCommission > 0.01 && canPayoutNow) {
              const ownerUser = await tx.user.findFirst({
                where: { role: 'OWNER' },
                select: { id: true, personId: true },
              })

              if (ownerUser?.id) {
                const txs = Array.isArray(investment.transactions) ? investment.transactions : []
                const alreadyPaid = txs
                  .filter((entry: any) => entry?.type === 'PARTNER_COMMISSION')
                  .reduce((sum: number, entry: any) => {
                    const meta = parseMetadata(entry?.metadata)
                    if (meta?.source !== 'PARTNER_CREATE_COMMISSION_PAYOUT') return sum
                    const amount = Number(entry?.amount)
                    return sum + (Number.isFinite(amount) ? Math.max(0, amount) : 0)
                  }, 0)

                const withdrawnAfter = Math.max(0, withdrawnProfit + amount)
                const expectedCumulative = partnerProfitTarget > 0
                  ? round2(Math.min(plannedCommission, (withdrawnAfter / partnerProfitTarget) * plannedCommission))
                  : round2(plannedCommission)

                const remainingCommission = Math.max(0, plannedCommission - alreadyPaid)
                const payoutNow = round2(Math.min(remainingCommission, Math.max(0, expectedCumulative - alreadyPaid)))

                if (payoutNow > 0.01) {
                  const ownerCashAccount = await tx.account.findFirst({
                    where: { type: 'CASH', isActive: true },
                  }) ?? await tx.account.create({
                    data: {
                      name: 'Cash Balance',
                      type: 'CASH',
                      currency: investment.account?.currency || 'SAR',
                      description: 'Cash ledger account',
                    },
                  })

                  await createCashBucket(tx, {
                    amount: payoutNow,
                    haulStartDate: date,
                    label: `${investment.name} Commission Receipt`,
                    date,
                    notes: notes || 'Partner-created Sukuk commission payout',
                    investmentId: investment.id,
                    type: 'CASH_IN',
                    personId: null,
                  })

                  const ownerBucketAgg = await tx.cashBucket.aggregate({
                    where: { personId: null },
                    _sum: { balance: true },
                  })
                  const ownerBucketSumRaw = ownerBucketAgg?._sum?.balance
                  const ownerBucketSum = Number.isFinite(ownerBucketSumRaw as any) ? Number(ownerBucketSumRaw) : 0

                  await tx.systemSetting.upsert({
                    where: { key: CASH_BALANCE_KEY },
                    update: { value: ownerBucketSum.toString() },
                    create: {
                      key: CASH_BALANCE_KEY,
                      value: ownerBucketSum.toString(),
                      description: 'Available cash balance for investments',
                    },
                  })

                  await tx.transaction.create({
                    data: {
                      accountId: ownerCashAccount.id,
                      investmentId: investment.id,
                      personId: ownerUser.personId || null,
                      type: 'PARTNER_COMMISSION',
                      amount: payoutNow,
                      date,
                      description: `Commission from partner deal ${investment.name}`,
                      metadata: JSON.stringify({
                        source: 'PARTNER_CREATE_COMMISSION_PAYOUT',
                        partnerPersonId,
                        partnerWithdrawAmount: amount,
                        plannedCommission,
                        alreadyPaid,
                        partnerProfitTarget,
                      }),
                    },
                  })
                }
              }
            }
          }

          await settleOwnerOnPartnerWithdraw()
        } catch (err) {
          console.error('PARTNER WITHDRAW ERROR (inside tx):', err)
          throw err
        }
      } else {
        if (source === 'PRINCIPAL') {
          // For principal withdrawals, create a new independent bucket
          // Use maturity date as hawl start (new cycle)
          await createCashBucket(tx, {
            amount: amount,
            haulStartDate: date,
            label: `${investment.name} Principal Receipt`,
            date: date,
            notes: notes || null,
            investmentId: investment.id,
            type: 'WITHDRAW_PRINCIPAL',
            excludeFromZakat: false,
            personId: null,
          })

          // Reduce the allocation principal remaining (but don't delete the allocation)
          const allocations = await tx.investmentBucketAllocation.findMany({
            where: { investmentId: investment.id },
          })

          for (const alloc of allocations) {
            const newRemaining = Math.max(0, alloc.principalRemaining - amount)
            await tx.investmentBucketAllocation.update({
              where: { id: alloc.id },
              data: { principalRemaining: newRemaining },
            })
          }
        } else {
          // For profit withdrawals, use default logic (Sukuk start date)
          await creditBucketsForReceipt(tx, {
            investmentId: investment.id,
            amount,
            principalReduction: 0,
            date,
            type: 'WITHDRAW_PROFIT',
            notes: notes || null,
            personId: null,
          })
        }
      }

      // Recalculate cash balance from buckets AFTER receipt buckets are credited.
      const cashBucketAgg = await tx.cashBucket.aggregate({
        where: (user.role === 'OWNER'
          ? { personId: null }
          : { personId: user.personId }) as any,
        _sum: { balance: true },
      })
      const cashBucketSumRaw = cashBucketAgg?._sum?.balance
      const cashBucketSum = Number.isFinite(cashBucketSumRaw as any) ? Number(cashBucketSumRaw) : 0

      await tx.systemSetting.upsert({
        where: { key: cashBalanceKey },
        update: { value: cashBucketSum.toString() },
        create: {
          key: cashBalanceKey,
          value: cashBucketSum.toString(),
          description: 'Available cash balance for investments',
        },
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
          personId: user.role === 'OWNER' ? null : (user.personId || null),
          type: source === 'PROFIT' ? 'WITHDRAW_PROFIT' : 'WITHDRAW_PRINCIPAL',
          amount: Math.abs(amount),
          date,
          description: notes || null,
          metadata: JSON.stringify({
            source,
            ...(user.role === 'PARTNER' && source === 'PRINCIPAL' ? {
              snapshotBeforeClose: {
                principalAmount: investment.principalAmount,
                receivableAmount: investment.receivableAmount,
                interestRate: investment.interestRate,
                feeRate: (investment as any).feeRate ?? null,
                fees: investment.fees,
                period: (investment as any).period ?? null,
              }
            } : {})
          }),
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

    // FIX 3: when partner closes (fully withdraws principal), notify owner that profit+commission is ready.
    if (user.role === 'PARTNER' && user.personId && source === 'PRINCIPAL') {
      const participant = await prisma.dealParticipant.findFirst({
        where: {
          investmentId: investment.id,
          personId: user.personId,
        },
        select: { investedAmount: true },
      })

      const remaining = Number(participant?.investedAmount ?? 0)
      const partnerClosed = Number.isFinite(remaining) ? remaining <= 0.000001 : false

      if (partnerClosed) {
        const transactions = Array.isArray(investment.transactions) ? investment.transactions : []
        const saleTx = transactions
          .filter((t: any) => t.type === 'SELL_TO_PARTNER')
          .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]
        const meta = saleTx ? parseMetadata(saleTx.metadata) : null
        const sellerPersonId = saleTx && typeof saleTx.personId === 'string' ? saleTx.personId : null

        if (sellerPersonId) {
          const ownerUser = await prisma.user.findFirst({
            where: { personId: sellerPersonId },
            select: { id: true },
          })

          if (ownerUser?.id) {
            const profit = Number(meta?.accruedProfitAtSale ?? 0)
            const commission = Number(meta?.commissionAmount ?? 0)
            const profitAmount = Number.isFinite(profit) ? Math.max(0, profit) : 0
            const commissionAmount = Number.isFinite(commission) ? Math.max(0, commission) : 0

            const message = `${user.name} has closed ${investment.name} — SAR ${profitAmount.toFixed(2)} profit + SAR ${commissionAmount.toFixed(2)} commission ready to receive`
            const key = `NOTIFICATION:${ownerUser.id}:${investment.id}`
            await prisma.systemSetting.upsert({
              where: { key },
              update: {
                value: JSON.stringify({
                  message,
                  investmentId: investment.id,
                  createdAt: new Date().toISOString(),
                  readAt: null,
                  amounts: { profit: profitAmount, commission: commissionAmount },
                  partnerPersonId: user.personId,
                }),
              },
              create: {
                key,
                value: JSON.stringify({
                  message,
                  investmentId: investment.id,
                  createdAt: new Date().toISOString(),
                  readAt: null,
                  amounts: { profit: profitAmount, commission: commissionAmount },
                  partnerPersonId: user.personId,
                }),
                description: 'Unread notification: sold deal ready to receive',
              },
            })
          }
        }
      }
    }

    return NextResponse.json({ success: true, investment: updated })
  } catch (error) {
    console.error('Withdraw error:', error)

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
