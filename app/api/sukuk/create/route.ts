import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'
import { createSukukSchema } from '@/lib/validation'
import { logAudit } from '@/lib/audit'
import { withdrawFromBuckets } from '@/lib/cashBuckets'

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(['OWNER'])
    
    const body = await req.json()
    
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
    const startDate = new Date(data.startDate)
    const maturityDate = data.maturityDate ? new Date(data.maturityDate) : null
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
    const sukuk = await prisma.$transaction(async (tx) => {
      const cashSetting = await tx.systemSetting.findUnique({
        where: { key: 'CASH_BALANCE' },
      })
      const currentCashRaw = cashSetting ? Number(cashSetting.value) : 0
      const currentCash = Number.isFinite(currentCashRaw) ? currentCashRaw : 0
      const nextCash = currentCash - data.principalAmount

      if (nextCash < 0) {
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

      await withdrawFromBuckets(tx, {
        amount: data.principalAmount,
        currency: account.currency || 'SAR',
        date: startDate,
        type: 'INVEST_OUT',
        investmentId: newSukuk.id,
        notes: 'Investment principal',
        allocateToInvestment: true,
        availableOnOrBefore: startDate,
      })

      await tx.transaction.create({
        data: {
          accountId: cashAccount.id,
          investmentId: newSukuk.id,
          personId: user.personId || null,
          type: 'CASH_INVEST',
          amount: -Math.abs(data.principalAmount),
          date: startDate,
          description: 'Cash used to create Sukuk',
        },
      })

      // Create participants if provided
      if (data.participants && data.participants.length > 0) {
        await tx.dealParticipant.createMany({
          data: data.participants.map((p) => ({
            investmentId: newSukuk.id,
            personId: p.personId,
            investedAmount: p.investedAmount,
            currentValue: p.investedAmount, // Initialize with invested amount
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
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        statusCode = 401
      } else if (error.message === 'Forbidden') {
        statusCode = 403
      } else if (error.message === 'INSUFFICIENT_CASH') {
        statusCode = 400
      }
    }
    
    return NextResponse.json(
      {
        error:
          error instanceof Error && error.message === 'INSUFFICIENT_CASH'
            ? 'Insufficient cash balance'
            : error instanceof Error
              ? error.message
              : 'Failed to create Sukuk',
      },
      { status: statusCode }
    )
  }
}
