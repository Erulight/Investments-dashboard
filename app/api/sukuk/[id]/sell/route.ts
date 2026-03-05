import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'
import { logAudit } from '@/lib/audit'
import { creditBucketsForReceipt } from '@/lib/cashBuckets'
import { createCashBucket } from '@/lib/cashBuckets'
import { withdrawFromBuckets } from '@/lib/cashBuckets'

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

    const buyerPersonId = typeof body.buyerPersonId === 'string' ? body.buyerPersonId : ''
    const amount = Number(body.amount)
    const salePrice = body.salePrice !== undefined ? Number(body.salePrice) : amount
    const paymentMode = body.paymentMode === 'SETTLE_DEBT' ? 'SETTLE_DEBT' : 'CASH'
    const debtId = typeof body.debtId === 'string' ? body.debtId : ''
    const commissionType = body.commissionType === 'PERCENT'
      ? 'PERCENT'
      : body.commissionType === 'AUTO'
        ? 'AUTO'
        : body.commissionType === 'FIXED'
          ? 'FIXED'
          : 'FIXED'
    const commissionValueRaw = body.commissionValue !== undefined ? Number(body.commissionValue) : 0
    const notes = typeof body.notes === 'string' ? body.notes : ''
    const date = body.date ? new Date(body.date) : new Date()

    if (body.date && Number.isNaN(date.getTime())) {
      return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
    }

    if (!buyerPersonId) {
      return NextResponse.json({ error: 'Buyer is required' }, { status: 400 })
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 })
    }
    if (!Number.isFinite(salePrice) || salePrice < 0) {
      return NextResponse.json({ error: 'Sale price must be 0 or more' }, { status: 400 })
    }
    if (paymentMode === 'SETTLE_DEBT' && !debtId) {
      return NextResponse.json({ error: 'Debt is required for settlement' }, { status: 400 })
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

    const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
    const diffDaysExclusive = (start: Date, end: Date) => {
      const s = startOfDay(start)
      const e = startOfDay(end)
      return Math.max(0, Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)))
    }
    const diffDaysInclusive = (start: Date, end: Date) => {
      const days = diffDaysExclusive(start, end)
      return days > 0 ? days + 1 : 1
    }

    const startDate = investment.startDate ? new Date(investment.startDate) : null
    const maturityDate = investment.maturityDate ? new Date(investment.maturityDate) : null
    if (!startDate || !maturityDate || Number.isNaN(maturityDate.getTime())) {
      return NextResponse.json({ error: 'Sukuk maturity date is required for selling' }, { status: 400 })
    }
    const saleDate = new Date(date)

    // Inclusive day counting:
    // - Total days includes both start and maturity day.
    // - Investor days excludes the sale day (owner holds up to the day before sale).
    // - Partner days includes sale day through maturity.
    const totalDays = diffDaysInclusive(startDate, maturityDate)
    const investorDays = diffDaysExclusive(startDate, saleDate)
    const partnerDays = diffDaysInclusive(saleDate, maturityDate)

    const totalNetProfitFull = Number.isFinite(investment.receivableAmount)
      ? Number(investment.receivableAmount)
      : 0
    const totalFeesFull = Number.isFinite(investment.fees) ? Number(investment.fees) : 0

    const principalRatio = investment.principalAmount > 0
      ? Math.min(1, Math.max(0, amount / investment.principalAmount))
      : 0

    const dailyNetProfit = totalDays > 0 ? (totalNetProfitFull / totalDays) : 0
    const dailyFee = totalDays > 0 ? (totalFeesFull / totalDays) : 0

    const investorProfit = dailyNetProfit * investorDays * principalRatio
    const partnerGrossProfit = dailyNetProfit * partnerDays * principalRatio
    const partnerFeeShare = dailyFee * partnerDays * principalRatio
    const investorFeeShare = dailyFee * investorDays * principalRatio
    const feeRecoveredFromPartner = partnerFeeShare
    const sellerProfitAtSale = investorProfit + feeRecoveredFromPartner
    const accruedProfitAtSale = Math.max(0, sellerProfitAtSale)

    const partnerHoldingYears = partnerDays > 0 ? (partnerDays / 365) : 0
    const partnerApr = (partnerHoldingYears > 0 && amount > 0)
      ? ((partnerGrossProfit / amount) / partnerHoldingYears) * 100
      : 0
    const allowedProfitAtTenApr = (partnerHoldingYears > 0 && amount > 0)
      ? amount * 0.10 * partnerHoldingYears
      : 0

    const commissionAmount = (() => {
      if (commissionType === 'PERCENT') {
        return Math.max(0, (partnerGrossProfit * commissionValueRaw) / 100)
      }
      if (commissionType === 'AUTO') {
        const excess = partnerGrossProfit - allowedProfitAtTenApr
        return Math.max(0, excess)
      }
      return Math.max(0, commissionValueRaw)
    })()
    const sharePercentage = investment.principalAmount > 0
      ? (amount / investment.principalAmount) * 100
      : null

    const updated = await prisma.$transaction(async (tx: any) => {
      const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate())

      const firstSellTx = await tx.transaction.findFirst({
        where: { investmentId: investment.id, type: 'SELL_TO_PARTNER' },
        orderBy: { date: 'asc' },
      })
      const firstMeta = parseMetadata(firstSellTx?.metadata)
      const originalOwnerPersonId = firstSellTx?.personId || null

      const originalPrincipalFromMeta = Number((firstMeta as any)?.originalPrincipal ?? 0)
      const originalReceivableFromMeta = Number((firstMeta as any)?.originalReceivable ?? 0)
      const originalInterestFromMeta = Number((firstMeta as any)?.originalInterestRate ?? 0)
      const originalFeesFromMeta = Number((firstMeta as any)?.originalFees ?? 0)

      const baseOriginal = {
        originalPrincipal:
          Number.isFinite(originalPrincipalFromMeta) && originalPrincipalFromMeta > 0
            ? originalPrincipalFromMeta
            : investment.principalAmount,
        originalReceivable:
          Number.isFinite(originalReceivableFromMeta) && originalReceivableFromMeta >= 0
            ? originalReceivableFromMeta
            : (Number.isFinite(investment.receivableAmount) ? investment.receivableAmount : 0),
        originalInterestRate:
          Number.isFinite(originalInterestFromMeta) && originalInterestFromMeta > 0
            ? originalInterestFromMeta
            : (Number.isFinite(investment.interestRate) ? investment.interestRate : 0),
        originalFees:
          Number.isFinite(originalFeesFromMeta) && originalFeesFromMeta >= 0
            ? originalFeesFromMeta
            : (Number.isFinite(investment.fees) ? investment.fees : 0),
      }

      const snapshotFromMeta = (firstMeta as any)?.snapshot
      const snapshot = snapshotFromMeta && typeof snapshotFromMeta === 'object'
        ? snapshotFromMeta
        : {
            principalAmount: baseOriginal.originalPrincipal,
            receivableAmount: baseOriginal.originalReceivable,
            interestRate: baseOriginal.originalInterestRate,
            feeRate: (investment as any).feeRate ?? null,
            fees: baseOriginal.originalFees,
            startDate: investment.startDate,
            maturityDate: investment.maturityDate,
            period: (investment as any).period ?? null,
          }

      // Buyer must fund the purchase from their own cash buckets/balance.
      // This is partner-scoped and does not touch the owner's global CASH_BALANCE.
      if (paymentMode === 'CASH' && salePrice > 0) {
        const buyerCashKey = `CASH_BALANCE:${buyerPersonId}`
        const buyerSetting = await tx.systemSetting.findUnique({ where: { key: buyerCashKey } })
        const buyerCurrentRaw = buyerSetting ? Number(buyerSetting.value) : 0
        const buyerCurrent = Number.isFinite(buyerCurrentRaw) ? buyerCurrentRaw : 0
        const buyerNext = buyerCurrent - salePrice

        if (buyerNext < -0.0001) {
          throw new Error('INSUFFICIENT_CASH')
        }

        if (buyerSetting) {
          await tx.systemSetting.update({
            where: { key: buyerCashKey },
            data: { value: buyerNext.toString() },
          })
        } else {
          await tx.systemSetting.create({
            data: {
              key: buyerCashKey,
              value: buyerNext.toString(),
              description: 'Available cash balance for investments',
            },
          })
        }

        await withdrawFromBuckets(tx, {
          amount: salePrice,
          currency: investment.account?.currency || 'SAR',
          date,
          type: 'INVEST_OUT',
          notes: notes || 'Sukuk purchase',
          availableOnOrBefore: date,
          personId: buyerPersonId,
        })

        // Also write to cash ledger (CASH account) for consistency.
        const cashAccount = await tx.account.findFirst({
          where: { type: 'CASH', isActive: true },
        })
        if (cashAccount) {
          await tx.transaction.create({
            data: {
              accountId: cashAccount.id,
              investmentId: investment.id,
              personId: buyerPersonId,
              type: 'INVEST_OUT',
              amount: -Math.abs(salePrice),
              date,
              description: notes || 'Sukuk purchase',
              metadata: JSON.stringify({
                source: 'BUY_FROM_PARTNER',
                sellerPersonId,
                principalTransferred: amount,
                salePrice,
              }),
            },
          })
        }
      }

      if (paymentMode === 'SETTLE_DEBT' && salePrice > 0) {
        const debt = await tx.debt.findUnique({
          where: { id: debtId },
          include: { payments: true, cashBucket: true },
        })

        if (!debt) {
          throw new Error('DEBT_NOT_FOUND')
        }

        const totalPaidBefore = debt.payments.reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0)
        const outstandingBefore = Math.max(0, Number(debt.amount) - totalPaidBefore)
        if (salePrice > outstandingBefore + 0.000001) {
          throw new Error('DEBT_PAYMENT_EXCEEDS_OUTSTANDING')
        }

        const debtPaymentNotesBase = notes || 'Debt settlement via Sukuk transfer'
        const debtPaymentNotes = `${debtPaymentNotesBase} [INVESTMENT:${investment.id}]`

        await tx.debtPayment.create({
          data: {
            debtId: debt.id,
            amount: salePrice,
            paidAt: date,
            notes: debtPaymentNotes,
          },
        })

        const totalPaidAfter = totalPaidBefore + salePrice
        const outstandingAfter = Math.max(0, Number(debt.amount) - totalPaidAfter)
        const fullyPaid = outstandingAfter <= 0.000001

        if (fullyPaid && debt.cashBucketId) {
          await tx.cashBucket.update({
            where: { id: debt.cashBucketId },
            data: {
              excludeFromZakat: false,
              haulStartDate: date,
              lastZakatPaidDate: null,
            },
          })
        }
      }

      if (paymentMode === 'SETTLE_DEBT' && commissionAmount > 0) {
      }

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
            commissionFees: (buyer.commissionFees || 0) + commissionAmount + partnerFeeShare,
            profit: (buyer.profit || 0) + partnerGrossProfit,
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
            commissionFees: commissionAmount + partnerFeeShare,
            profit: partnerGrossProfit,
            sharePercentage,
          },
        })
      }

      // Create (or reuse) a partner-owned haul bucket to represent the acquired principal.
      // This ensures the partner haul starts at the acquisition date (sell date).
      const allocationLabel = `Sukuk Principal • ${investment.name}`
      const existingBucket = await tx.cashBucket.findFirst({
        where: {
          personId: buyerPersonId,
          label: allocationLabel,
          haulStartDate: dayStart,
        } as any,
        select: { id: true },
      })

      const allocationBucketId = existingBucket?.id
        ? existingBucket.id
        : (await createCashBucket(tx, {
            amount: 0,
            haulStartDate: dayStart,
            currency: investment.account?.currency || 'SAR',
            label: allocationLabel,
            date,
            notes: null,
            investmentId: null,
            type: 'CASH_IN',
            personId: buyerPersonId,
          })).id

      await tx.investmentBucketAllocation.upsert({
        where: {
          investmentId_cashBucketId: {
            investmentId: investment.id,
            cashBucketId: allocationBucketId,
          },
        },
        update: {
          principalAllocated: { increment: amount },
          principalRemaining: { increment: amount },
        },
        create: {
          investmentId: investment.id,
          cashBucketId: allocationBucketId,
          principalAllocated: amount,
          principalRemaining: amount,
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

      await tx.transaction.createMany({
        data: [
          {
            accountId: cashAccount.id,
            investmentId: investment.id,
            personId: sellerPersonId,
            type: 'SELL_TO_PARTNER',
            amount: paymentMode === 'CASH' ? Math.abs(salePrice) : 0,
            date,
            description: notes || null,
            metadata: JSON.stringify({
              buyerPersonId,
              principalTransferred: amount,
              salePrice,
              commissionAmount,
              accruedProfitAtSale,
              paymentMode,
              debtId: paymentMode === 'SETTLE_DEBT' ? debtId : null,
              totalDays,
              investorDays,
              partnerDays,
              totalNetProfitFull,
              totalFeesFull,
              investorProfit,
              investorFeeShare,
              partnerGrossProfit,
              partnerFeeShare,
              feeRecoveredFromPartner,
              partnerHoldingYears,
              partnerApr,
              allowedProfitAtTenApr,
              commissionType,
              commissionValueRaw,
              originalPrincipal: baseOriginal.originalPrincipal,
              originalReceivable: baseOriginal.originalReceivable,
              originalInterestRate: baseOriginal.originalInterestRate,
              originalFees: baseOriginal.originalFees,
              snapshot: {
                principalAmount: investment.principalAmount,
                receivableAmount: investment.receivableAmount,
                interestRate: investment.interestRate,
                feeRate: (investment as any).feeRate ?? null,
                fees: investment.fees,
                period: (investment as any).period ?? null,
                startDate: investment.startDate,
                maturityDate: investment.maturityDate,
              },
            }),
          },
          ...(paymentMode === 'CASH' && accruedProfitAtSale > 0
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
                    totalDays,
                    investorDays,
                    partnerDays,
                    totalNetProfitFull,
                    totalFeesFull,
                    investorProfit,
                    investorFeeShare,
                    partnerGrossProfit,
                    partnerFeeShare,
                    feeRecoveredFromPartner,
                    partnerHoldingYears,
                    partnerApr,
                    allowedProfitAtTenApr,
                  }),
                },
              ]
            : []),
          {
            accountId: investment.accountId,
            investmentId: investment.id,
            personId: buyerPersonId,
            type: 'BUY_FROM_PARTNER',
            amount: paymentMode === 'CASH' ? -Math.abs(salePrice) : 0,
            date,
            description: notes || null,
            metadata: JSON.stringify({
              sellerPersonId,
              principalTransferred: amount,
              salePrice,
              commissionAmount,
              accruedProfitAtSale,
              paymentMode,
              debtId: paymentMode === 'SETTLE_DEBT' ? debtId : null,
            }),
          },
        ],
      })

      if (paymentMode === 'CASH') {
        const cashSetting = await tx.systemSetting.findUnique({
          where: { key: 'CASH_BALANCE' },
        })
        const currentCash = cashSetting ? Number(cashSetting.value) : 0
        const nextCash = currentCash + salePrice + accruedProfitAtSale

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
          personId: null,
        })

      }

      const isReturnToOwner =
        user.role === 'PARTNER' &&
        !!buyerPersonId &&
        !!originalOwnerPersonId &&
        buyerPersonId === originalOwnerPersonId

      if (isReturnToOwner && originalOwnerPersonId) {
        const snapshotForRestore: any = (firstMeta as any)?.snapshot || snapshot
        const canonicalPrincipal = Number.isFinite(Number(snapshotForRestore?.principalAmount))
          ? Number(snapshotForRestore.principalAmount)
          : baseOriginal.originalPrincipal
        const canonicalReceivable = Number.isFinite(Number(snapshotForRestore?.receivableAmount))
          ? Number(snapshotForRestore.receivableAmount)
          : baseOriginal.originalReceivable
        const canonicalInterest = Number.isFinite(Number(snapshotForRestore?.interestRate))
          ? Number(snapshotForRestore.interestRate)
          : baseOriginal.originalInterestRate
        const canonicalFeeRate = Number.isFinite(Number(snapshotForRestore?.feeRate))
          ? Number(snapshotForRestore.feeRate)
          : (investment as any).feeRate ?? null
        const canonicalFees = Number.isFinite(Number(snapshotForRestore?.fees))
          ? Number(snapshotForRestore.fees)
          : baseOriginal.originalFees
        const canonicalPeriod =
          typeof snapshotForRestore?.period !== 'undefined'
            ? snapshotForRestore.period
            : (investment as any).period ?? null

        await tx.investment.update({
          where: { id: investment.id },
          data: {
            principalAmount: canonicalPrincipal,
            receivableAmount: canonicalReceivable,
            interestRate: canonicalInterest,
            feeRate: canonicalFeeRate,
            fees: canonicalFees,
            period: canonicalPeriod,
            totalReceived: 0,
            currentValue: canonicalPrincipal,
            reopenedAt: date,
          },
        })

        if (sellerPersonId) {
          await tx.dealParticipant.deleteMany({
            where: { investmentId: investment.id, personId: sellerPersonId },
          })
        }

        const ownerParticipant = await tx.dealParticipant.findFirst({
          where: { investmentId: investment.id, personId: originalOwnerPersonId },
        })

        if (ownerParticipant) {
          await tx.dealParticipant.update({
            where: { id: ownerParticipant.id },
            data: {
              investedAmount: canonicalPrincipal,
              currentValue: canonicalPrincipal,
              profit: canonicalReceivable,
              receivable: canonicalReceivable,
              sharePercentage: 100,
              acquiredAt: investment.startDate,
            },
          })
        } else {
          await tx.dealParticipant.create({
            data: {
              investmentId: investment.id,
              personId: originalOwnerPersonId,
              investedAmount: canonicalPrincipal,
              currentValue: canonicalPrincipal,
              profit: canonicalReceivable,
              receivable: canonicalReceivable,
              sharePercentage: 100,
              acquiredAt: investment.startDate,
            },
          })
        }
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
            paymentMode,
            debtId: paymentMode === 'SETTLE_DEBT' ? debtId : null,
          },
        }),
      })

      return { success: true }
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('TRANSFER ERROR:', error)

    let statusCode = 500
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        statusCode = 401
      } else if (error.message === 'Forbidden') {
        statusCode = 403
      } else if (error.message === 'INSUFFICIENT_CASH') {
        statusCode = 400
      } else if (error.message === 'DEBT_NOT_FOUND') {
        statusCode = 400
      } else if (error.message === 'DEBT_PAYMENT_EXCEEDS_OUTSTANDING') {
        statusCode = 400
      }
    }

    return NextResponse.json(
      {
        error: error instanceof Error
          ? error.message === 'INSUFFICIENT_CASH'
            ? 'Insufficient partner cash balance'
            : error.message === 'DEBT_NOT_FOUND'
              ? 'Debt not found'
              : error.message === 'DEBT_PAYMENT_EXCEEDS_OUTSTANDING'
                ? 'Settlement exceeds outstanding debt amount'
                : error.message
          : 'Failed to sell',
      },
      { status: statusCode }
    )
  }
}
