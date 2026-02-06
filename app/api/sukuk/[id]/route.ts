import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'
import { updateSukukSchema } from '@/lib/validation'
import { logAudit } from '@/lib/audit'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth()
    const { id } = await params
    
    const sukuk = await prisma.investment.findUnique({
      where: { id },
      include: {
        account: true,
        dealParticipants: {
          include: {
            person: true,
          },
        },
        transactions: {
          where: {
            type: { in: ['WITHDRAW_PROFIT', 'WITHDRAW_PRINCIPAL'] },
          },
          orderBy: { date: 'asc' },
        },
      },
    })
    
    if (!sukuk) {
      return NextResponse.json(
        { error: 'Sukuk not found' },
        { status: 404 }
      )
    }
    
    // Apply RBAC: Partners can only view their own participations
    if (user.role === 'PARTNER' && user.personId) {
      const hasParticipation = sukuk.dealParticipants.some(
        (p) => p.personId === user.personId
      )
      
      if (!hasParticipation) {
        return NextResponse.json(
          { error: 'Forbidden' },
          { status: 403 }
        )
      }
      
      // Filter to show only their participation
      const myParticipation = sukuk.dealParticipants.find(
        (p) => p.personId === user.personId
      )
      
      return NextResponse.json({
        ...sukuk,
        dealParticipants: myParticipation ? [myParticipation] : [],
      })
    }
    
    return NextResponse.json(sukuk)
  } catch (error) {
    console.error('Sukuk get error:', error)
    
    let statusCode = 500
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        statusCode = 401
      } else if (error.message === 'Forbidden') {
        statusCode = 403
      }
    }
    
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch Sukuk' },
      { status: statusCode }
    )
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(['OWNER'])
    const { id } = await params
    
    const body = await req.json()
    
    // Validate input
    const validationResult = updateSukukSchema.safeParse(body)
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
    
    // Check if sukuk exists
    const existingSukuk = await prisma.investment.findUnique({
      where: { id },
    })
    
    if (!existingSukuk) {
      return NextResponse.json(
        { error: 'Sukuk not found' },
        { status: 404 }
      )
    }
    
    // Update the Sukuk in a transaction
    const updatedSukuk = await prisma.$transaction(async (tx) => {
      // Prepare update data
      const updateData: any = {}
      
      if (data.accountId !== undefined) updateData.accountId = data.accountId
      if (data.name !== undefined) updateData.name = data.name
      if (data.category !== undefined) updateData.category = data.category
      if (data.principalAmount !== undefined) updateData.principalAmount = data.principalAmount
      if (data.currentValue !== undefined) updateData.currentValue = data.currentValue
      const startDate = data.startDate !== undefined
        ? new Date(data.startDate)
        : existingSukuk.startDate
      const maturityDate = data.maturityDate !== undefined
        ? (data.maturityDate ? new Date(data.maturityDate) : null)
        : existingSukuk.maturityDate
      if (data.startDate !== undefined) updateData.startDate = startDate
      if (data.maturityDate !== undefined) updateData.maturityDate = maturityDate

      if (data.fees !== undefined) updateData.fees = data.fees
      if (data.totalReceived !== undefined) updateData.totalReceived = data.totalReceived
      if (data.receivableAmount !== undefined) updateData.receivableAmount = data.receivableAmount

      const principalAmount = data.principalAmount ?? existingSukuk.principalAmount
      const fees = data.fees ?? existingSukuk.fees
      const receivableAmount = data.receivableAmount ?? existingSukuk.receivableAmount
      const periodMonths = maturityDate
        ? (maturityDate.getFullYear() - startDate.getFullYear()) * 12
          + (maturityDate.getMonth() - startDate.getMonth())
          + (maturityDate.getDate() - startDate.getDate()) / 30
        : null
      const periodYears = periodMonths ? periodMonths / 12 : null
      const computedApr = periodYears && principalAmount > 0
        ? ((receivableAmount + fees) / principalAmount / periodYears) * 100
        : data.interestRate ?? existingSukuk.interestRate
      updateData.interestRate = computedApr
      if (data.notes !== undefined) updateData.notes = data.notes
      if (data.metadata !== undefined) updateData.metadata = data.metadata
      
      const updated = await tx.investment.update({
        where: { id },
        data: updateData,
      })
      
      // Update participants if provided
      if (data.participants !== undefined) {
        // Delete existing participants
        await tx.dealParticipant.deleteMany({
          where: { investmentId: id },
        })
        
        // Create new participants
        if (data.participants.length > 0) {
          await tx.dealParticipant.createMany({
            data: data.participants.map((p) => ({
              investmentId: id,
              personId: p.personId,
              investedAmount: p.investedAmount,
              currentValue: p.investedAmount,
              sharePercentage: p.sharePercentage,
              notes: p.notes,
            })),
          })
        }
      }
      
      // Log audit
      await logAudit(tx, {
        userId: user.id,
        action: 'UPDATE',
        entityType: 'SUKUK',
        entityId: id,
        changes: JSON.stringify({ before: existingSukuk, after: updateData }),
      })
      
      return updated
    })
    
    // Fetch the complete updated sukuk
    const completeSukuk = await prisma.investment.findUnique({
      where: { id },
      include: {
        account: true,
        dealParticipants: {
          include: {
            person: true,
          },
        },
      },
    })
    
    return NextResponse.json({
      success: true,
      sukuk: completeSukuk,
    })
  } catch (error) {
    console.error('Sukuk update error:', error)
    
    let statusCode = 500
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        statusCode = 401
      } else if (error.message === 'Forbidden') {
        statusCode = 403
      }
    }
    
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update Sukuk' },
      { status: statusCode }
    )
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(['OWNER'])
    const { id } = await params
    
    // Check if sukuk exists
    const existingSukuk = await prisma.investment.findUnique({
      where: { id },
    })
    
    if (!existingSukuk) {
      return NextResponse.json(
        { error: 'Sukuk not found' },
        { status: 404 }
      )
    }
    
    // Delete the sukuk (participants will be cascade deleted)
    await prisma.$transaction(async (tx) => {
      await tx.investment.delete({
        where: { id },
      })
      
      // Log audit
      await logAudit(tx, {
        userId: user.id,
        action: 'DELETE',
        entityType: 'SUKUK',
        entityId: id,
        changes: JSON.stringify({ deleted: existingSukuk }),
      })
    })
    
    return NextResponse.json({
      success: true,
      message: 'Sukuk deleted successfully',
    })
  } catch (error) {
    console.error('Sukuk delete error:', error)
    
    let statusCode = 500
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        statusCode = 401
      } else if (error.message === 'Forbidden') {
        statusCode = 403
      }
    }
    
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete Sukuk' },
      { status: statusCode }
    )
  }
}
