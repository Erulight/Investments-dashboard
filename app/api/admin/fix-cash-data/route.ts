import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

export async function POST(req: NextRequest) {
  try {
    await requireAuth(['OWNER'])

    const body = await req.json()
    const { investmentId, confirm } = body

    if (!investmentId) {
      return NextResponse.json({ error: 'Investment ID is required' }, { status: 400 })
    }

    if (!confirm) {
      return NextResponse.json({ error: 'Confirmation required' }, { status: 400 })
    }

    console.log('FIXING CASH DATA FOR INVESTMENT:', investmentId)

    const result = await prisma.$transaction(async (tx) => {
      // Find the problematic transactions
      const settlementTx = await tx.transaction.findFirst({
        where: {
          investmentId: investmentId,
          type: 'SOLD_DEAL_SETTLEMENT'
        }
      })

      const commissionTx = await tx.transaction.findFirst({
        where: {
          investmentId: investmentId,
          type: 'PARTNER_COMMISSION'
        }
      })

      const settlementAmount = settlementTx?.amount || 0
      const commissionAmount = commissionTx?.amount || 0
      const totalToRemove = settlementAmount + commissionAmount

      console.log('FOUND TRANSACTIONS TO DELETE:', {
        settlementAmount,
        commissionAmount,
        totalToRemove
      })

      // Delete the wrong transactions
      const deletedTransactions = await tx.transaction.deleteMany({
        where: {
          investmentId: investmentId,
          type: { in: ['SOLD_DEAL_SETTLEMENT', 'PARTNER_COMMISSION'] }
        }
      })

      // Get current cash balance
      const currentSetting = await tx.systemSetting.findUnique({
        where: { key: 'CASH_BALANCE' }
      })
      const currentBalance = Number(currentSetting?.value || 0)
      const correctedBalance = currentBalance - totalToRemove

      console.log('CASH BALANCE CORRECTION:', {
        currentBalance,
        totalToRemove,
        correctedBalance
      })

      // Update SystemSetting CASH_BALANCE
      await tx.systemSetting.update({
        where: { key: 'CASH_BALANCE' },
        data: { value: String(correctedBalance) }
      })

      // Delete any cashBuckets for settlement/commission on this deal
      // Find buckets through allocations since CashBucket doesn't have investmentId directly
      const bucketsToDelete = await tx.cashBucket.findMany({
        where: {
          allocations: {
            some: {
              investmentId: investmentId
            }
          },
          OR: [
            { label: { contains: 'Settlement' } },
            { label: { contains: 'Commission' } }
          ]
        }
      })

      const deletedBuckets = await tx.cashBucket.deleteMany({
        where: {
          id: { in: bucketsToDelete.map(b => b.id) }
        }
      })

      // Also delete buckets by label pattern (fallback)
      const deletedByLabel = await tx.cashBucket.deleteMany({
        where: {
          label: { contains: 'Commission' }
        }
      })

      return {
        deletedTransactions: deletedTransactions.count,
        deletedBuckets: deletedBuckets.count,
        deletedByLabel: deletedByLabel.count,
        settlementAmount,
        commissionAmount,
        totalRemoved: totalToRemove,
        oldBalance: currentBalance,
        newBalance: correctedBalance
      }
    })

    console.log('CASH DATA FIX COMPLETED:', result)

    return NextResponse.json({
      success: true,
      message: 'Cash data fixed successfully',
      details: result
    })

  } catch (error) {
    console.error('Cash data fix error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fix cash data' },
      { status: 500 }
    )
  }
}
