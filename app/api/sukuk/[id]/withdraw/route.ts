import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'
import { logAudit } from '@/lib/audit'
import { creditBucketsForReceipt } from '@/lib/cashBuckets'
import { createCashBucket } from '@/lib/cashBuckets'
import { recomputeCashSetting } from '@/lib/cashBalance'
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

const round2 = (value: number) => Math.round((Number(value) || 0) * 100) / 100

const diffDays = (start: Date, end: Date) => {
  const s = new Date(start)
  const e = new Date(end)
  s.setHours(0, 0, 0, 0)
  e.setHours(0, 0, 0, 0)
  return Math.max(0, Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)))
}

const addDays = (date: Date, days: number) => {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

const getLastCompletedHawlAnchor = (initialAnchor: Date, referenceDate: Date) => {
  const start = new Date(initialAnchor.getFullYear(), initialAnchor.getMonth(), initialAnchor.getDate())
  const ref = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate())
  const elapsed = diffDays(start, ref)
  if (elapsed < 354) return start
  const completedCycles = Math.floor(elapsed / 354)
  return addDays(start, completedCycles * 354)
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
      try {
        if (!user.personId) {
          return NextResponse.json(
            { error: 'Partner is missing a person profile' },
            { status: 400 },
          )
        }

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
            currentValue: source === 'PRINCIPAL'
              ? investment.currentValue
              : Math.max(0, investment.currentValue - amount),
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

          if (source === 'PRINCIPAL' && amount > remainingPrincipal + 0.01) {
            throw new Error('AMOUNT_EXCEEDS_PARTNER_PRINCIPAL')
          }
          if (source === 'PROFIT' && amount > remainingProfit + 0.01) {
            throw new Error('AMOUNT_EXCEEDS_PARTNER_PROFIT')
          }

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
            const commissionIssuedAtRaw = typeof commissionPlan?.issuedAt === 'string'
              ? commissionPlan.issuedAt
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
                    haulStartDate: commissionHaulStartDate,
                    label: `${investment.name} Commission Receipt`,
                    date,
                    notes: notes || 'Partner-created Sukuk commission payout',
                    investmentId: investment.id,
                    type: 'CASH_IN',
                    personId: null,
                  })

                  await recomputeCashSetting(tx, null)

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
          let principalHaulStart = date
          const invMeta = parseMetadata(investment.metadata)
          const savingsAnchorRaw = typeof invMeta?.savingsHaulStartDate === 'string'
            ? new Date(invMeta.savingsHaulStartDate)
            : null
          const savingsAnchor = savingsAnchorRaw && !Number.isNaN(savingsAnchorRaw.getTime())
            ? new Date(
                savingsAnchorRaw.getFullYear(),
                savingsAnchorRaw.getMonth(),
                savingsAnchorRaw.getDate(),
              )
            : null

          const fundingMovements = await tx.cashBucketMovement.findMany({
            where: {
              investmentId: investment.id,
              type: 'INVEST_OUT',
              cashBucket: {
                personId: null,
                OR: [
                  { label: { startsWith: 'Savings Receipt •' } },
                  { label: { startsWith: 'Circlys Reward Receipt •' } },
                  { label: { startsWith: 'Sukuk Principal •' } },
                  { label: { endsWith: ' Principal Receipt' } },
                ],
              },
            } as any,
            select: {
              date: true,
              cashBucket: {
                select: {
                  label: true,
                  haulStartDate: true,
                },
              },
            },
            orderBy: { date: 'asc' },
          })

          const rewardAnchors: Date[] = []
          const savingsAnchors: Date[] = []
          const principalAnchors: Date[] = []

          for (const movement of fundingMovements) {
            const label = typeof movement?.cashBucket?.label === 'string' ? movement.cashBucket.label : ''
            const anchorRaw = movement?.cashBucket?.haulStartDate ? new Date(movement.cashBucket.haulStartDate) : null
            const movementRaw = movement?.date ? new Date(movement.date) : null
            if (!anchorRaw || Number.isNaN(anchorRaw.getTime())) continue
            if (!movementRaw || Number.isNaN(movementRaw.getTime())) continue

            const anchor = new Date(anchorRaw.getFullYear(), anchorRaw.getMonth(), anchorRaw.getDate())
            const movementDay = new Date(movementRaw.getFullYear(), movementRaw.getMonth(), movementRaw.getDate())
            const completedAnchor = getLastCompletedHawlAnchor(anchor, movementDay)

            if (label.startsWith('Circlys Reward Receipt •')) {
              rewardAnchors.push(completedAnchor)
            } else if (label.startsWith('Savings Receipt •')) {
              savingsAnchors.push(completedAnchor)
            } else if (label.startsWith('Sukuk Principal •') || label.endsWith(' Principal Receipt')) {
              principalAnchors.push(completedAnchor)
            }
          }

          if (
            rewardAnchors.length === 0 &&
            savingsAnchors.length === 0 &&
            principalAnchors.length === 0
          ) {
            const allocationFunding = await tx.investmentBucketAllocation.findMany({
              where: {
                investmentId: investment.id,
                principalAllocated: { gt: 0 },
              },
              select: {
                cashBucket: {
                  select: {
                    label: true,
                    haulStartDate: true,
                    movements: {
                      where: { type: 'CASH_IN' },
                      select: { date: true },
                      orderBy: { date: 'asc' },
                      take: 1,
                    },
                  },
                },
              },
            })

            for (const alloc of allocationFunding) {
              const label = typeof alloc?.cashBucket?.label === 'string' ? alloc.cashBucket.label : ''
              const anchorRaw = alloc?.cashBucket?.haulStartDate
                ? new Date(alloc.cashBucket.haulStartDate)
                : null
              const refRaw = alloc?.cashBucket?.movements?.[0]?.date
                ? new Date(alloc.cashBucket.movements[0].date)
                : date
              if (!anchorRaw || Number.isNaN(anchorRaw.getTime())) continue
              if (!refRaw || Number.isNaN(refRaw.getTime())) continue

              const anchor = new Date(anchorRaw.getFullYear(), anchorRaw.getMonth(), anchorRaw.getDate())
              const referenceDay = new Date(refRaw.getFullYear(), refRaw.getMonth(), refRaw.getDate())
              const completedAnchor = getLastCompletedHawlAnchor(anchor, referenceDay)

              if (label.startsWith('Circlys Reward Receipt •')) {
                rewardAnchors.push(completedAnchor)
              } else if (label.startsWith('Savings Receipt •')) {
                savingsAnchors.push(completedAnchor)
              } else if (label.startsWith('Sukuk Principal •') || label.endsWith(' Principal Receipt')) {
                principalAnchors.push(completedAnchor)
              }
            }
          }

          const startDay = (() => {
            const raw = investment.startDate ? new Date(investment.startDate as any) : null
            if (!raw || Number.isNaN(raw.getTime())) return date
            return new Date(raw.getFullYear(), raw.getMonth(), raw.getDate())
          })()

          const latestRewardAnchor = rewardAnchors.length > 0
            ? [...rewardAnchors].sort((a: Date, b: Date) => a.getTime() - b.getTime())[rewardAnchors.length - 1]
            : null
          const latestSavingsAnchor = savingsAnchors.length > 0
            ? [...savingsAnchors].sort((a: Date, b: Date) => a.getTime() - b.getTime())[savingsAnchors.length - 1]
            : null
          const latestPrincipalAnchor = principalAnchors.length > 0
            ? [...principalAnchors].sort((a: Date, b: Date) => a.getTime() - b.getTime())[principalAnchors.length - 1]
            : null
          const normalizedSavingsAnchor = savingsAnchor
            ? getLastCompletedHawlAnchor(savingsAnchor, date)
            : null

          const derivedAnchor =
            latestRewardAnchor ||
            latestSavingsAnchor ||
            latestPrincipalAnchor ||
            normalizedSavingsAnchor ||
            startDay

          principalHaulStart = derivedAnchor

          const derivedIso = `${derivedAnchor.getFullYear()}-${String(derivedAnchor.getMonth() + 1).padStart(2, '0')}-${String(derivedAnchor.getDate()).padStart(2, '0')}`
          if (invMeta?.savingsHaulStartDate !== derivedIso) {
            await tx.investment.update({
              where: { id: investment.id },
              data: {
                metadata: JSON.stringify({
                  ...invMeta,
                  savingsHaulStartDate: derivedIso,
                }),
              },
            })
          }

          await createCashBucket(tx, {
            amount: amount,
            haulStartDate: principalHaulStart,
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
            orderBy: { createdAt: 'asc' },
          })

          let remainingReduction = Math.max(0, amount)
          for (const alloc of allocations) {
            if (remainingReduction <= 0.0001) break
            const allocRemaining = Math.max(0, Number(alloc.principalRemaining || 0))
            if (allocRemaining <= 0.0001) continue

            const reduceBy = Math.min(allocRemaining, remainingReduction)
            await tx.investmentBucketAllocation.update({
              where: { id: alloc.id },
              data: { principalRemaining: Math.max(0, allocRemaining - reduceBy) },
            })

            remainingReduction = Math.max(0, remainingReduction - reduceBy)
          }

          if (remainingReduction > 0.0001) {
            throw new Error('PRINCIPAL_ALLOCATION_MISMATCH')
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

      await recomputeCashSetting(tx, user.role === 'OWNER' ? null : (user.personId || null))

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
      } else if (error.message === 'PRINCIPAL_ALLOCATION_MISMATCH') {
        statusCode = 409
      }
    }

    return NextResponse.json(
      {
        error: error instanceof Error
          ? error.message === 'AMOUNT_EXCEEDS_PARTNER_PRINCIPAL'
            ? 'Amount exceeds your remaining principal'
            : error.message === 'AMOUNT_EXCEEDS_PARTNER_PROFIT'
              ? 'Amount exceeds your remaining profit'
              : error.message === 'PRINCIPAL_ALLOCATION_MISMATCH'
                ? 'Cannot withdraw principal because allocation state is inconsistent. Reopen the deal and try again.'
              : error.message
          : 'Failed to withdraw',
      },
      { status: statusCode }
    )
  }
}
