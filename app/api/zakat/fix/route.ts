import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (user.role !== 'OWNER') {
      return NextResponse.json({ error: 'Forbidden - Owner only' }, { status: 403 })
    }

    const body = await req.json()
    const { warningId, action, bucketId, investmentId, debtId } = body

    // Create fix history record
    const fixHistory = await prisma.zakatFixHistory.create({
      data: {
        userId: user.id,
        warningId,
        warningType: warningId.split('-')[0],
        action,
        bucketId,
        investmentId,
        debtId,
        status: 'IN_PROGRESS',
      },
    })

    let result: any = {}

    try {
      // Execute the fix based on action type
      if (action === 'exclude-from-zakat' && bucketId) {
        // Fix DEBT_BUCKET_LEAKING by marking bucket as excluded
        const bucket = await prisma.cashBucket.findUnique({
          where: { id: bucketId },
          include: { debt: true },
        })

        if (!bucket) {
          throw new Error('Bucket not found')
        }

        // Store old state for undo
        const oldState = {
          excludeFromZakat: bucket.excludeFromZakat,
        }

        // Apply fix
        await prisma.cashBucket.update({
          where: { id: bucketId },
          data: { excludeFromZakat: true },
        })

        result = {
          success: true,
          message: `Successfully excluded "${bucket.label}" from zakat calculations`,
          oldState,
          newState: { excludeFromZakat: true },
        }
      } else if (action === 'sync-rosca-haul' && investmentId) {
        // Fix MISSING_SAVINGS_HAUL by syncing from ROSCA bucket
        const investment = await prisma.investment.findUnique({
          where: { id: investmentId },
          include: {
            bucketAllocations: {
              include: {
                cashBucket: true,
              },
            },
          },
        })

        if (!investment) {
          throw new Error('Investment not found')
        }

        // Find ROSCA bucket (Savings Receipt or Circlys Reward Receipt)
        const roscaBucket = investment.bucketAllocations.find((a: any) => {
          const label = a.cashBucket?.label || ''
          return label.startsWith('Savings Receipt •') || label.startsWith('Circlys Reward Receipt •')
        })?.cashBucket

        if (!roscaBucket || !roscaBucket.haulStartDate) {
          throw new Error('ROSCA bucket not found or missing haulStartDate')
        }

        // Parse current metadata
        const currentMeta = investment.metadata ? JSON.parse(investment.metadata as string) : {}
        const oldState = { savingsHaulStartDate: currentMeta.savingsHaulStartDate }

        // Update investment metadata with ROSCA hawl start
        const newMeta = {
          ...currentMeta,
          savingsHaulStartDate: roscaBucket.haulStartDate.toISOString().split('T')[0],
        }

        await prisma.investment.update({
          where: { id: investmentId },
          data: { metadata: JSON.stringify(newMeta) },
        })

        result = {
          success: true,
          message: `Successfully synced hawl start date for "${investment.name}" from ${roscaBucket.label}`,
          oldState,
          newState: { savingsHaulStartDate: newMeta.savingsHaulStartDate },
        }
      } else {
        throw new Error(`Unknown action: ${action}`)
      }

      // Update fix history to SUCCESS
      await prisma.zakatFixHistory.update({
        where: { id: fixHistory.id },
        data: {
          status: 'SUCCESS',
          oldState: JSON.stringify(result.oldState),
          newState: JSON.stringify(result.newState),
          appliedAt: new Date(),
        },
      })

      return NextResponse.json({ success: true, ...result, fixId: fixHistory.id })
    } catch (error: any) {
      // Update fix history to FAILED
      await prisma.zakatFixHistory.update({
        where: { id: fixHistory.id },
        data: {
          status: 'FAILED',
          errorMessage: error.message,
        },
      })

      throw error
    }
  } catch (error: any) {
    console.error('Zakat fix error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to apply fix' },
      { status: 500 }
    )
  }
}

// Undo a previously applied fix
export async function DELETE(req: Request) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (user.role !== 'OWNER') {
      return NextResponse.json({ error: 'Forbidden - Owner only' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const fixId = searchParams.get('fixId')

    if (!fixId) {
      return NextResponse.json({ error: 'Missing fixId' }, { status: 400 })
    }

    const fixHistory = await prisma.zakatFixHistory.findUnique({
      where: { id: fixId },
    })

    if (!fixHistory || fixHistory.userId !== user.id) {
      return NextResponse.json({ error: 'Fix not found' }, { status: 404 })
    }

    if (fixHistory.status !== 'SUCCESS') {
      return NextResponse.json({ error: 'Can only undo successful fixes' }, { status: 400 })
    }

    if (fixHistory.undoneAt) {
      return NextResponse.json({ error: 'Fix already undone' }, { status: 400 })
    }

    const oldState = fixHistory.oldState ? JSON.parse(fixHistory.oldState as string) : {}

    // Revert the fix based on action type
    if (fixHistory.action === 'exclude-from-zakat' && fixHistory.bucketId) {
      await prisma.cashBucket.update({
        where: { id: fixHistory.bucketId },
        data: { excludeFromZakat: oldState.excludeFromZakat || false },
      })
    } else if (fixHistory.action === 'sync-rosca-haul' && fixHistory.investmentId) {
      const investment = await prisma.investment.findUnique({
        where: { id: fixHistory.investmentId },
      })

      if (investment) {
        const currentMeta = investment.metadata ? JSON.parse(investment.metadata as string) : {}
        const revertedMeta = {
          ...currentMeta,
          savingsHaulStartDate: oldState.savingsHaulStartDate || undefined,
        }

        // Remove the field if it was undefined before
        if (!oldState.savingsHaulStartDate) {
          delete revertedMeta.savingsHaulStartDate
        }

        await prisma.investment.update({
          where: { id: fixHistory.investmentId },
          data: { metadata: JSON.stringify(revertedMeta) },
        })
      }
    }

    // Mark fix as undone
    await prisma.zakatFixHistory.update({
      where: { id: fixId },
      data: { undoneAt: new Date() },
    })

    return NextResponse.json({ success: true, message: 'Fix successfully undone' })
  } catch (error: any) {
    console.error('Zakat undo error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to undo fix' },
      { status: 500 }
    )
  }
}
