import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'
import { createSukukSchema } from '@/lib/validation'
import { logAudit } from '@/lib/audit'

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
      // Create the investment
      const newSukuk = await tx.investment.create({
        data: {
          accountId: data.accountId,
          name: data.name,
          category: data.category,
          principalAmount: data.principalAmount,
          currentValue: data.currentValue ?? data.principalAmount,
          startDate: new Date(data.startDate),
          maturityDate: data.maturityDate ? new Date(data.maturityDate) : null,
          interestRate: data.interestRate,
          fees: data.fees ?? 0,
          totalReceived: data.totalReceived ?? 0,
          notes: data.notes,
          metadata: data.metadata,
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
      }
    }
    
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create Sukuk' },
      { status: statusCode }
    )
  }
}
