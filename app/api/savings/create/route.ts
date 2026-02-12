import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { requireModuleAccess } from '@/lib/rbac'
import { createSavingsSchema, CreateSavingsInput } from '@/lib/validation'
import { createAuditLog } from '@/lib/audit'

export async function POST(req: NextRequest) {
  try {
    await requireModuleAccess('savings')
    const user = await getCurrentUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (user.role === 'PARTNER' && !user.personId) {
      return NextResponse.json({ error: 'Partner is missing a person profile' }, { status: 400 })
    }
    if (user.role !== 'OWNER' && user.role !== 'PARTNER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const validatedData = createSavingsSchema.parse(body) as CreateSavingsInput

    // Verify the account exists and is of type CIRCLYS
    const account = await prisma.account.findUnique({
      where: { id: validatedData.accountId },
    })

    if (!account || account.type !== 'CIRCLYS') {
      return NextResponse.json({ error: 'Invalid or non-CIRCLYS account selected' }, { status: 400 })
    }

    // Create the savings plan as an investment with ROSCA fields
    const participants = user.role === 'PARTNER'
      ? [{ personId: user.personId!, investedAmount: 0, sharePercentage: 100, notes: null }]
      : (validatedData.participants || [])

    const investment = await prisma.investment.create({
      data: {
        accountId: validatedData.accountId,
        name: validatedData.name,
        // Use metadata to store ROSCA-specific fields
        principalAmount: 0,
        currentValue: 0,
        startDate: new Date(validatedData.startDate),
        // ROSCA fields in metadata
        metadata: JSON.stringify({
          type: 'ROSCA',
          monthlyContribution: validatedData.monthlyContribution,
          totalMonths: validatedData.totalMonths,
          bookingFee: validatedData.bookingFee ?? 0,
          rewardProgram: validatedData.rewardProgram ?? 'NONE',
          rewardAmount: validatedData.rewardAmount ?? 0,
          receiptMonth: validatedData.receiptMonth ?? null,
          monthsPaid: 0,
          currentMonth: 0,
          status: 'ACTIVE',
          totalPayout: validatedData.monthlyContribution * validatedData.totalMonths,
          // Add reward to payout if applicable
          totalReward: validatedData.rewardProgram && validatedData.rewardAmount
            ? validatedData.rewardProgram === 'PERCENTAGE'
              ? (validatedData.monthlyContribution * validatedData.totalMonths) * (validatedData.rewardAmount / 100)
              : validatedData.rewardAmount
            : 0,
          payments: {},
          totalPaid: 0,
          totalRewardPaid: 0,
        }),
        // Initialize other fields
        totalReceived: 0,
        fees: validatedData.bookingFee ?? 0,
        receivableAmount: 0,
        isIjarah: false,
        category: 'SAVINGS_ROSCA',
        ...(participants && participants.length > 0
          ? {
              dealParticipants: {
                create: participants.map((p: any) => ({
                  personId: p.personId,
                  investedAmount: Number(p.investedAmount) || 0,
                  currentValue: p.investedAmount,
                  profit: 0,
                  sharePercentage: p.sharePercentage,
                  notes: p.notes,
                })),
              },
            }
          : {}),
      },
      include: {
        account: true,
        dealParticipants: {
          include: { person: true },
        },
      },
    })

    // Log the action
    await createAuditLog(
      user.id,
      'CREATE',
      'INVESTMENT',
      investment.id,
      {
        type: 'ROSCA',
        name: investment.name,
        accountId: investment.accountId,
        monthlyContribution: JSON.parse(investment.metadata || '{}').monthlyContribution,
        totalMonths: JSON.parse(investment.metadata || '{}').totalMonths,
        bookingFee: JSON.parse(investment.metadata || '{}').bookingFee,
        rewardProgram: JSON.parse(investment.metadata || '{}').rewardProgram,
        rewardAmount: JSON.parse(investment.metadata || '{}').rewardAmount,
        receiptMonth: JSON.parse(investment.metadata || '{}').receiptMonth,
      }
    )

    return NextResponse.json(investment)
  } catch (error) {
    console.error('Error creating savings plan:', error)
    if (error instanceof Error && 'issues' in error) {
      return NextResponse.json({ error: 'Validation failed', issues: (error as any).issues }, { status: 400 })
    }
    return NextResponse.json({ error: 'Failed to create savings plan' }, { status: 500 })
  }
}
