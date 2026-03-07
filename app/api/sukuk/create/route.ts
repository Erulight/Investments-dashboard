import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import type { Prisma } from '@prisma/client'
import { requireModuleAccess } from '@/lib/rbac'
import { createSukukSchema } from '@/lib/validation'
import { logAudit } from '@/lib/audit'
import { withdrawFromBuckets } from '@/lib/cashBuckets'
import { parseDateInput } from '@/lib/date'

export async function POST(req: NextRequest) {
  try {
    const user = await requireModuleAccess('sukuk')
    if (user.role === 'PARTNER' && !user.personId) {
      return NextResponse.json({ error: 'Partner is missing a person profile' }, { status: 400 })
    }
    
    const body = await req.json()
    
    // DEBUG: Log incoming request body
    console.log('[SUKUK_CREATE] Received body:', JSON.stringify(body, null, 2))
    console.log('[SUKUK_CREATE] principalAmount type:', typeof body.principalAmount)
    console.log('[SUKUK_CREATE] principalAmount value:', body.principalAmount)
    
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
    const sukuk = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const cashBalanceKey = user.role === 'OWNER'
        ? 'CASH_BALANCE'
        : `CASH_BALANCE:${user.personId!}`

      // CRITICAL FIX: Calculate cash balance AS OF the deal start date
      // This prevents creating deals before cash actually existed
      const cashAccountForDateCheck = await tx.account.findFirst({
        where: { type: 'CASH', isActive: true },
      })

      let cashBalanceAtStartDate = 0
      if (cashAccountForDateCheck) {
        // Sum all cash transactions UP TO and INCLUDING the deal start date
        const txAgg = await tx.transaction.aggregate({
          where: {
            accountId: cashAccountForDateCheck.id,
            date: { lte: startDate }, // only transactions ON OR BEFORE deal start date
          },
          _sum: { amount: true },
        })
        const txSum = txAgg._sum.amount || 0
        cashBalanceAtStartDate = Number.isFinite(txSum) ? Number(txSum) : 0
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

      // Log for debugging
      console.log('[SUKUK_CREATE] Deal start date:', startDate.toISOString().split('T')[0])
      console.log('[SUKUK_CREATE] Cash from transactions at start date:', cashBalanceAtStartDate)
      console.log('[SUKUK_CREATE] Cash from buckets at start date:', bucketSum)
      console.log('[SUKUK_CREATE] Total cash at start date:', cashAtStartDate)
      console.log('[SUKUK_CREATE] Principal required:', data.principalAmount)

      if (cashAtStartDate < data.principalAmount) {
        throw new Error(`INSUFFICIENT_CASH_AT_DATE:${startDate.toISOString().split('T')[0]}:${cashAtStartDate.toFixed(2)}:${data.principalAmount.toFixed(2)}`)
      }

      // Now check current cash for the deduction
      const cashSetting = await tx.systemSetting.findUnique({
        where: { key: cashBalanceKey },
      })
      const currentCashRaw = cashSetting ? Number(cashSetting.value) : 0
      let currentCash = Number.isFinite(currentCashRaw) ? currentCashRaw : 0
      let nextCash = currentCash - data.principalAmount

      if (nextCash < 0) {
        const currentBucketAgg = await tx.cashBucket.aggregate({
          where: (user.role === 'OWNER'
            ? { personId: null }
            : { personId: user.personId }) as any,
          _sum: { balance: true },
        })
        const currentBucketSumRaw = currentBucketAgg?._sum?.balance
        const currentBucketSum = Number.isFinite(currentBucketSumRaw as any) ? Number(currentBucketSumRaw) : 0
        if (currentBucketSum > currentCash + 0.0001) {
          currentCash = currentBucketSum
          nextCash = currentCash - data.principalAmount
        }
      }

      if (nextCash < 0) {
        throw new Error('INSUFFICIENT_CASH')
      }

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
      console.log('[SUKUK_CREATE] Creating investment with principalAmount:', data.principalAmount)
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
          metadata: data.metadata,
        },
      })
      console.log('[SUKUK_CREATE] Investment created with ID:', newSukuk.id, 'principalAmount:', newSukuk.principalAmount)

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
      })

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
            acquiredAt: startDate,
            commissionFees: 0,
            sharePercentage: 100,
            notes: null,
          },
        })
      } else if (data.participants && data.participants.length > 0) {
        await tx.dealParticipant.createMany({
          data: data.participants.map((p) => ({
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
    
    let statusCode = 500
    let errorMessage = 'Failed to create Sukuk'
    
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        statusCode = 401
      } else if (error.message === 'Forbidden') {
        statusCode = 403
      } else if (error.message === 'INSUFFICIENT_CASH') {
        statusCode = 400
        errorMessage = 'Insufficient cash balance'
      } else if (error.message.startsWith('INSUFFICIENT_CASH_AT_DATE:')) {
        // Parse the date-aware error: INSUFFICIENT_CASH_AT_DATE:YYYY-MM-DD:available:required
        statusCode = 400
        const parts = error.message.split(':')
        if (parts.length >= 4) {
          const date = parts[1]
          const available = parts[2]
          const required = parts[3]
          errorMessage = `Insufficient cash balance on ${date}. Available: SAR ${available}, Required: SAR ${required}`
        } else {
          errorMessage = error.message
        }
      } else {
        errorMessage = error.message
      }
    }
    
    return NextResponse.json(
      { error: errorMessage },
      { status: statusCode }
    )
  }
}
