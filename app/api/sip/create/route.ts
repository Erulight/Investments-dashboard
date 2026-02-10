import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { requireModuleAccess } from '@/lib/rbac'
import { createSipSchema, CreateSipInput } from '@/lib/validation'
import { createAuditLog } from '@/lib/audit'

export async function POST(req: NextRequest) {
  try {
    await requireModuleAccess('savings')
    const user = await getCurrentUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (user.role !== 'OWNER') {
      return NextResponse.json({ error: 'Only owners can create SIP plans' }, { status: 403 })
    }

    const body = await req.json()
    const validatedData = createSipSchema.parse(body) as CreateSipInput

    // Verify the account exists and is suitable for SIPs (any account type for now)
    const account = await prisma.account.findUnique({
      where: { id: validatedData.accountId },
    })

    if (!account) {
      return NextResponse.json({ error: 'Invalid account selected' }, { status: 400 })
    }

    // Create the SIP as an investment with simple metadata
    const investment = await prisma.investment.create({
      data: {
        accountId: validatedData.accountId,
        name: validatedData.name,
        principalAmount: 0, // Start with 0, will be updated when investing
        currentValue: 0,
        startDate: new Date(validatedData.startDate),
        // SIP fields in metadata
        metadata: JSON.stringify({
          type: 'SIP',
          totalAmount: validatedData.totalAmount,
          investedAmount: 0,
          status: 'ACTIVE',
          lastInvestmentDate: null,
        }),
        // Initialize other fields
        totalReceived: 0,
        fees: 0,
        receivableAmount: 0,
        isIjarah: false,
        category: 'SIP',
        notes: validatedData.notes,
      },
      include: {
        account: true,
      },
    })

    // Log the action
    await createAuditLog(
      user.id,
      'CREATE',
      'INVESTMENT',
      investment.id,
      {
        type: 'SIP',
        name: investment.name,
        accountId: investment.accountId,
        totalAmount: validatedData.totalAmount,
      }
    )

    return NextResponse.json(investment)
  } catch (error) {
    console.error('Error creating SIP plan:', error)
    if (error instanceof Error && 'issues' in error) {
      return NextResponse.json({ error: 'Validation failed', issues: (error as any).issues }, { status: 400 })
    }
    return NextResponse.json({ error: 'Failed to create SIP plan' }, { status: 500 })
  }
}
