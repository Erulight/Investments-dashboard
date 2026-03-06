import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

export async function POST(req: NextRequest) {
  try {
    await requireAuth(['OWNER'])

    console.log('FIXING PROFIT ROUNDING IN DATABASE')

    const result = await prisma.$transaction(async (tx) => {
      // Find investment by name first
      const investmentToUpdate = await tx.investment.findFirst({
        where: { name: 'Ridwan KIA' },
      })

      if (!investmentToUpdate) {
        throw new Error('Investment "Ridwan KIA" not found')
      }

      // Update investment with correct rounded values
      const investment = await tx.investment.update({
        where: { id: investmentToUpdate.id },
        data: {
          receivableAmount: 2500.00,
          fees: 250.00,
        },
      })

      // Update deal participants with correct rounded values
      const participants = await tx.dealParticipant.updateMany({
        where: {
          investmentId: investmentToUpdate.id,
        },
        data: {
          profit: 2500.00,
          receivable: 2500.00,
        },
      })

      return {
        investmentUpdated: !!investment,
        investmentId: investment?.id,
        participantsUpdated: participants.count,
        newReceivableAmount: 2500.00,
        newFees: 250.00,
      }
    })

    console.log('PROFIT ROUNDING FIX COMPLETED:', result)

    return NextResponse.json({
      success: true,
      message: 'Profit rounding fixed in database',
      details: result,
    })
  } catch (error) {
    console.error('Profit rounding fix error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fix profit rounding' },
      { status: 500 }
    )
  }
}
