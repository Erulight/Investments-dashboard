import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { requireModuleAccess } from '@/lib/rbac'
import { createSavingsSchema, CreateSavingsInput } from '@/lib/validation'
import { auditLog } from '@/lib/audit'

export async function POST(req: NextRequest) {
  try {
    await requireModuleAccess('savings')
    const user = await getCurrentUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (user.role !== 'OWNER') {
      return NextResponse.json({ error: 'Only owners can create savings plans' }, { status: 403 })
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

    // Create the savings plan as an investment
    const investment = await prisma.investment.create({
      data: {
        accountId: validatedData.accountId,
        name: validatedData.name,
        principalAmount: validatedData.principalAmount,
        currentValue: validatedData.currentValue ?? validatedData.principalAmount,
        startDate: new Date(validatedData.startDate),
        interestRate: validatedData.interestRate,
        notes: validatedData.notes,
        // Savings plans don't have maturity dates by default
        maturityDate: null,
        // Initialize other fields
        totalReceived: 0,
        fees: 0,
        receivableAmount: 0,
        isIjarah: false,
        metadata: null,
        category: 'SAVINGS',
        // Create participants if provided
        dealParticipants: validatedData.participants?.map(p => ({
          personId: p.personId,
          investedAmount: p.investedAmount,
          currentValue: p.investedAmount, // Initially same as invested
          profit: 0, // No profit initially
          sharePercentage: p.sharePercentage,
          notes: p.notes,
        })) ?? [],
      },
      include: {
        account: true,
        dealParticipants: {
          include: { person: true },
        },
      },
    })

    // Log the creation
    await auditLog({
      userId: user.id,
      action: 'CREATE',
      entityType: 'SAVINGS_PLAN',
      entityId: investment.id,
      details: `Created savings plan: ${investment.name}`,
      metadata: {
        planName: investment.name,
        principalAmount: investment.principalAmount,
        accountId: investment.accountId,
      },
    })

    return NextResponse.json(investment)
  } catch (error) {
    console.error('Error creating savings plan:', error)
    if (error instanceof Error && 'issues' in error) {
      return NextResponse.json({ error: 'Validation failed', issues: (error as any).issues }, { status: 400 })
    }
    return NextResponse.json({ error: 'Failed to create savings plan' }, { status: 500 })
  }
}
