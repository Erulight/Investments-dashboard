import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireModuleAccess } from '@/lib/rbac'
import { createSukukSchema } from '@/lib/validation'
import { logAudit } from '@/lib/audit'
import { withdrawFromBuckets } from '@/lib/cashBuckets'
import { getBucketCashBalance, recomputeCashSetting } from '@/lib/cashBalance'
import { parseDateInput } from '@/lib/date'

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

const parseMetadata = (value: unknown) => {
  if (!value) return {}
  if (typeof value === 'object') return value as Record<string, unknown>
  if (typeof value !== 'string') return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

const round2 = (value: number) => Math.round((Number(value) || 0) * 100) / 100

const SUKUK_WITHDRAW_BUCKET_PRIORITY = [
  'Savings Receipt •',
  'Circlys Reward Receipt •',
  'Sukuk Principal •',
  'Profit •',
]

export async function POST(req: NextRequest) {
  try {
    const user = await requireModuleAccess('sukuk')
    if (user.role === 'PARTNER' && !user.personId) {
      return NextResponse.json({ error: 'Partner is missing a person profile' }, { status: 400 })
    }
    
    const body = await req.json()
    
    const DEBUG = Boolean(process.env.SUKUK_DEBUG)
    
    // Validate input
    const validationResult = createSukukSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        { 
          error: 'Validation failed', 
          details: validationResult.error.format() 
        },
        { status: 400 }
      )
    }
    
    const data = validationResult.data
    const receivableAmount = data.receivableAmount ?? 0
    const isIjarah = data.isIjarah ?? false
    const fees = data.fees ?? 0
    const startDate = typeof data.startDate === 'string'
      ? (parseDateInput(data.startDate) ?? new Date(data.startDate))
      : new Date(data.startDate)
    const maturityDate = data.maturityDate
      ? (typeof data.maturityDate === 'string'
          ? (parseDateInput(data.maturityDate) ?? new Date(data.maturityDate))
          : new Date(data.maturityDate))
      : null

    if (Number.isNaN(startDate.getTime())) {
      return NextResponse.json({ error: 'Invalid startDate' }, { status: 400 })
    }
    
    // BARRIER: Prevent future start dates
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const startDateOnly = new Date(startDate)
    startDateOnly.setHours(0, 0, 0, 0)
    
    if (startDateOnly > today) {
      const formattedStartDate = startDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
      const formattedToday = today.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
      return NextResponse.json(
        { 
          error: `Cannot create Sukuk with future start date. Start date (${formattedStartDate}) cannot be later than today (${formattedToday}).` 
        }, 
        { status: 400 }
      )
    }
    
    if (maturityDate && Number.isNaN(maturityDate.getTime())) {
      return NextResponse.json({ error: 'Invalid maturityDate' }, { status: 400 })
    }
    const periodMonths = maturityDate
      ? (maturityDate.getFullYear() - startDate.getFullYear()) * 12
        + (maturityDate.getMonth() - startDate.getMonth())
        + (maturityDate.getDate() - startDate.getDate()) / 30
      : null
    const periodYears = periodMonths ? periodMonths / 12 : null
    const computedApr = periodYears && data.principalAmount > 0
      ? ((receivableAmount + fees) / data.principalAmount / periodYears) * 100
      : data.interestRate

    const partnerCommissionType = data.partnerCommissionType === 'FIXED_CASH'
      ? 'FIXED_CASH'
      : 'AUTO_ABOVE_10'
    const partnerCommissionCashRaw = Number(data.partnerCommissionCash ?? 0)
    const partnerCommissionCash = Number.isFinite(partnerCommissionCashRaw)
      ? Math.max(0, partnerCommissionCashRaw)
      : 0
    const autoCommissionRaw = periodYears && data.principalAmount > 0 && Number.isFinite(computedApr)
      ? data.principalAmount * (Math.max(0, Number(computedApr) - 10) / 100) * periodYears
      : 0
    const configuredCommission = partnerCommissionType === 'FIXED_CASH'
      ? partnerCommissionCash
      : autoCommissionRaw
    const ownerCommissionAmount = user.role === 'PARTNER'
      ? round2(Math.max(0, configuredCommission))
      : 0

    if (user.role === 'PARTNER' && ownerCommissionAmount - receivableAmount > 0.01) {
      return NextResponse.json(
        { error: 'Commission cannot exceed net profit receivable' },
        { status: 400 }
      )
    }

    const partnerNetReceivable = user.role === 'PARTNER'
      ? round2(Math.max(0, receivableAmount - ownerCommissionAmount))
      : receivableAmount

    const baseMetadata = parseMetadata(data.metadata)
    const metadataWithCommission = user.role === 'PARTNER'
      ? {
          ...baseMetadata,
          partnerCommissionPlan: {
            type: partnerCommissionType,
            thresholdApr: 10,
            aprAtCreation: Number.isFinite(computedApr) ? round2(Number(computedApr)) : null,
            grossReceivable: round2(receivableAmount),
            amount: ownerCommissionAmount,
            cashAmount: partnerCommissionType === 'FIXED_CASH' ? round2(partnerCommissionCash) : null,
            partnerNetReceivable,
            issuedAt: startDate.toISOString(),
            maturityDate: maturityDate ? maturityDate.toISOString() : null,
          },
        }
      : baseMetadata
    
    // Check if account exists
    const account = await prisma.account.findUnique({
      where: { id: data.accountId },
    })
    
    if (!account) {
      return NextResponse.json(
        { error: 'Account not found' },
        { status: 404 }
      )
    }
    
    // Create the Sukuk investment with participants in a transaction
    const sukuk = await prisma.$transaction(async (tx: any) => {
      const scopePersonId = user.role === 'OWNER' ? null : user.personId!

      // CRITICAL FIX: Calculate cash balance AS OF the deal start date
      // This prevents creating deals before cash actually existed
      const cashAccountForDateCheck = await tx.account.findFirst({
        where: { type: 'CASH', isActive: true },
      })

      let cashBalanceAtStartDate = 0
      try {
        if (cashAccountForDateCheck && (tx as any).transaction?.aggregate) {
          // Sum all cash transactions UP TO and INCLUDING the deal start date
          const txAgg = await (tx as any).transaction.aggregate({
            where: {
              accountId: cashAccountForDateCheck.id,
              date: { lte: startDate }, // only transactions ON OR BEFORE deal start date
            },
            _sum: { amount: true },
          })
          const txSum = txAgg?._sum?.amount || 0
          cashBalanceAtStartDate = Number.isFinite(txSum) ? Number(txSum) : 0
        }
      } catch {
        cashBalanceAtStartDate = 0
      }

      // Also check cash buckets as of the start date
      // IMPORTANT: For savings receipt buckets, check createdAt (receipt date) not haulStartDate
      // haulStartDate is the first contribution date, not when money was actually received
      const bucketAgg = await tx.cashBucket.aggregate({
        where: {
          ...(user.role === 'OWNER'
            ? { personId: null }
            : { personId: user.personId }),
          createdAt: { lte: startDate }, // only buckets created ON OR BEFORE deal start date
        } as any,
        _sum: { balance: true },
      })
      const bucketSum = Number.isFinite(bucketAgg._sum.balance as any) ? Number(bucketAgg._sum.balance) : 0

      // Use whichever is higher (transaction sum or bucket sum)
      const cashAtStartDate = Math.max(cashBalanceAtStartDate, bucketSum)

      if (DEBUG) {
        console.log('[SUKUK_CREATE] Deal start date:', startDate.toISOString().split('T')[0])
        console.log('[SUKUK_CREATE] Cash at start date:', cashAtStartDate, 'Required:', data.principalAmount)
      }

      if (cashAtStartDate < data.principalAmount) {
        throw new Error(`INSUFFICIENT_CASH_AT_DATE:${startDate.toISOString().split('T')[0]}:${cashAtStartDate.toFixed(2)}:${data.principalAmount.toFixed(2)}`)
      }

      // Check current bucket-backed cash for deduction.
      const currentCash = await getBucketCashBalance(tx, scopePersonId)
      if (currentCash - data.principalAmount < -0.0001) {
        throw new Error('INSUFFICIENT_CASH')
      }

      const cashAccount = await tx.account.findFirst({
        where: { type: 'CASH', isActive: true },
      }) ?? await tx.account.create({
        data: {
          name: 'Cash Balance',
          type: 'CASH',
          currency: account.currency || 'SAR',
          description: 'Cash ledger account',
        },
      })

      // Create the investment
      if (DEBUG) console.log('[SUKUK_CREATE] Creating investment with principalAmount:', data.principalAmount)
      const newSukuk = await tx.investment.create({
        data: {
          accountId: data.accountId,
          name: data.name,
          category: data.category,
          principalAmount: data.principalAmount,
          currentValue: data.currentValue ?? data.principalAmount,
          startDate,
          maturityDate,
          interestRate: computedApr,
          fees,
          totalReceived: data.totalReceived ?? 0,
          receivableAmount,
          isIjarah,
          notes: data.notes,
          metadata: user.role === 'PARTNER' ? JSON.stringify(metadataWithCommission) : data.metadata,
        },
      })
      if (DEBUG) console.log('[SUKUK_CREATE] Investment created with ID:', newSukuk.id)

      await withdrawFromBuckets(tx, {
        amount: data.principalAmount,
        currency: account.currency || 'SAR',
        date: startDate,
        type: 'INVEST_OUT',
        investmentId: newSukuk.id,
        notes: 'Investment principal',
        allocateToInvestment: true,
        availableOnOrBefore: startDate,
        personId: user.role === 'OWNER' ? null : user.personId,
        preferredLabelPrefixes: user.role === 'OWNER'
          ? SUKUK_WITHDRAW_BUCKET_PRIORITY
          : undefined,
      })

      await recomputeCashSetting(tx, scopePersonId)

      let inheritedSavingsHaulStart: Date | null = null
      try {
        const fundingAllocations = await tx.investmentBucketAllocation.findMany({
          where: {
            investmentId: newSukuk.id,
            principalAllocated: { gt: 0 },
          },
          include: {
            cashBucket: {
              select: {
                id: true,
                label: true,
                haulStartDate: true,
              },
            },
          },
        })

        if (DEBUG) {
          console.log('[SUKUK_CREATE] Investment ID:', newSukuk.id, 'Allocations:', fundingAllocations.length)
        }

        const resolvedFundingAnchors = fundingAllocations
          .map((alloc: any) => {
            const label = typeof alloc?.cashBucket?.label === 'string' ? alloc.cashBucket.label : ''
            const rawAnchor = alloc?.haulStartDate
              ? new Date(alloc.haulStartDate)
              : (alloc?.cashBucket?.haulStartDate ? new Date(alloc.cashBucket.haulStartDate) : null)
            if (!rawAnchor || Number.isNaN(rawAnchor.getTime())) return null

            const anchorDay = new Date(rawAnchor.getFullYear(), rawAnchor.getMonth(), rawAnchor.getDate())
            const isRewardRoscaReceipt = label.startsWith('Circlys Reward Receipt •')
            const isSavingsRoscaReceipt = label.startsWith('Savings Receipt •')
            const isPrincipalReceiptFunding =
              label.startsWith('Sukuk Principal •') || label.endsWith(' Principal Receipt')

            if (isRewardRoscaReceipt) {
              // Reward receipts inherit Hawl 1 start (first contribution) and
              // convert to the last completed cycle at investment time.
              return {
                allocationId: alloc.id as string,
                anchor: getLastCompletedHawlAnchor(anchorDay, startDate),
              }
            }
            if (isSavingsRoscaReceipt) {
              // Savings continuity: use the last completed cycle at investment date.
              return {
                allocationId: alloc.id as string,
                anchor: getLastCompletedHawlAnchor(anchorDay, startDate),
              }
            }
            if (isPrincipalReceiptFunding) {
              // Principal continuity: keep inherited running anchor.
              return {
                allocationId: alloc.id as string,
                anchor: anchorDay,
              }
            }
            return null
          })
          .filter((item: { allocationId: string; anchor: Date } | null): item is { allocationId: string; anchor: Date } => Boolean(item))
          .sort((a: { anchor: Date }, b: { anchor: Date }) => a.anchor.getTime() - b.anchor.getTime())

        for (const item of resolvedFundingAnchors) {
          await tx.investmentBucketAllocation.update({
            where: { id: item.allocationId },
            data: { haulStartDate: item.anchor } as any,
          })
        }

        inheritedSavingsHaulStart = resolvedFundingAnchors[0]?.anchor || null

        if (DEBUG) console.log('[SUKUK_CREATE] Inherited hawl start:', inheritedSavingsHaulStart?.toISOString().split('T')[0] || 'NONE')
      } catch (err) {
        console.error('[SUKUK_CREATE] Error finding allocations:', err)
        inheritedSavingsHaulStart = null
      }

      if (inheritedSavingsHaulStart) {
        const existingMeta = parseMetadata(newSukuk.metadata)
        const inheritedIso = inheritedSavingsHaulStart.toISOString().split('T')[0]
        if (DEBUG) console.log('[SUKUK_CREATE] Saving savingsHaulStartDate:', inheritedIso)
        await tx.investment.update({
          where: { id: newSukuk.id },
          data: {
            metadata: JSON.stringify({
              ...existingMeta,
              savingsHaulStartDate: inheritedIso,
            }),
          },
        })
        
        // BARRIER: savingsHaulStartDate must never be later than investment startDate
        if (inheritedSavingsHaulStart > startDate) {
          throw new Error('ROSCA bucket haulStartDate cannot be in the future relative to investment start')
        }
      } else {
        const existingMeta = parseMetadata(newSukuk.metadata)
        if (typeof existingMeta?.savingsHaulStartDate === 'string') {
          const { savingsHaulStartDate: _removed, ...metaWithoutSavingsHaul } = existingMeta as Record<string, unknown>
          await tx.investment.update({
            where: { id: newSukuk.id },
            data: {
              metadata: JSON.stringify(metaWithoutSavingsHaul),
            },
          })
        } else {
        }
      }

      await tx.transaction.create({
        data: {
          accountId: cashAccount.id,
          investmentId: newSukuk.id,
          personId: user.role === 'OWNER' ? null : (user.personId || null),
          type: 'CASH_INVEST',
          amount: -Math.abs(data.principalAmount),
          date: startDate,
          description: 'Cash used to create Sukuk',
        },
      })

      // Create participants
      if (user.role === 'PARTNER') {
        await tx.dealParticipant.create({
          data: {
            investmentId: newSukuk.id,
            personId: user.personId!,
            investedAmount: data.principalAmount,
            currentValue: data.principalAmount,
            receivable: partnerNetReceivable,
            profit: partnerNetReceivable,
            acquiredAt: startDate,
            commissionFees: ownerCommissionAmount,
            sharePercentage: 100,
            notes: null,
          },
        })

        if (ownerCommissionAmount > 0) {
          const ownerUser = await tx.user.findFirst({
            where: { role: 'OWNER' },
            select: { id: true },
          })

          if (ownerUser?.id) {
            const maturityLabel = maturityDate
              ? maturityDate.toISOString().slice(0, 10)
              : 'unspecified maturity'
            const message = `Commission issued on ${newSukuk.name}: SAR ${ownerCommissionAmount.toFixed(2)} will be delivered on ${maturityLabel}`
            const key = `NOTIFICATION:${ownerUser.id}:${newSukuk.id}`

            await tx.systemSetting.upsert({
              where: { key },
              update: {
                value: JSON.stringify({
                  message,
                  investmentId: newSukuk.id,
                  createdAt: new Date().toISOString(),
                  readAt: null,
                  amounts: { commission: ownerCommissionAmount },
                  partnerPersonId: user.personId,
                }),
              },
              create: {
                key,
                value: JSON.stringify({
                  message,
                  investmentId: newSukuk.id,
                  createdAt: new Date().toISOString(),
                  readAt: null,
                  amounts: { commission: ownerCommissionAmount },
                  partnerPersonId: user.personId,
                }),
                description: 'Unread notification: partner sukuk commission issued',
              },
            })
          }
        }
      } else if (data.participants && data.participants.length > 0) {
        await tx.dealParticipant.createMany({
          data: data.participants.map((p: any) => ({
            investmentId: newSukuk.id,
            personId: p.personId,
            investedAmount: p.investedAmount,
            currentValue: p.investedAmount,
            acquiredAt: startDate,
            commissionFees: 0,
            sharePercentage: p.sharePercentage,
            notes: p.notes,
          })),
        })
      }
      
      // Log audit
      await logAudit(tx, {
        userId: user.id,
        action: 'CREATE',
        entityType: 'SUKUK',
        entityId: newSukuk.id,
        changes: JSON.stringify({ created: newSukuk }),
      })
      
      return newSukuk
    })
    
    // Fetch the complete sukuk with relations
    const completeSukuk = await prisma.investment.findUnique({
      where: { id: sukuk.id },
      include: {
        account: true,
        dealParticipants: {
          include: {
            person: true,
          },
        },
      },
    })
    
    return NextResponse.json(
      { 
        success: true, 
        sukuk: completeSukuk 
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Sukuk create error:', error)

    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      if (error.message === 'Forbidden') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      if (error.message === 'INSUFFICIENT_CASH') {
        return NextResponse.json({ error: 'Insufficient cash balance' }, { status: 400 })
      }
      if (error.message.startsWith('INSUFFICIENT_CASH_AT_DATE:')) {
        const parts = error.message.split(':')
        return NextResponse.json(
          {
            error: parts.length >= 4
              ? `Insufficient cash balance on ${parts[1]}. Available: SAR ${parts[2]}, Required: SAR ${parts[3]}`
              : error.message,
          },
          { status: 400 }
        )
      }
    }

    return NextResponse.json({ error: 'Failed to create Sukuk' }, { status: 500 })
  }
}
