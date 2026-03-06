import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

export async function POST(req: NextRequest) {
  try {
    await requireAuth(['OWNER'])

    console.log('CLEANING CASH LEDGER')

    const result = await prisma.$transaction(async (tx) => {
      // Delete all partner-related cash transactions
      const deletedTransactions = await tx.transaction.deleteMany({
        where: {
          type: { in: [
            'SOLD_DEAL_SETTLEMENT',
            'PARTNER_COMMISSION',
            'RETURN_TO_OWNER_REVERSAL',
            'SELL_PROFIT_ACCRUED'
          ]}
        }
      })

      // Verify CASH_INVEST exists
      const cashInvest = await tx.transaction.findFirst({
        where: { type: 'CASH_INVEST' }
      })

      console.log('CASH_INVEST exists:', cashInvest)

      // Fix CASH_BALANCE to correct value
      await tx.systemSetting.update({
        where: { key: 'CASH_BALANCE' },
        data: { value: '5000' }
      })

      return {
        deletedTransactions: deletedTransactions.count,
        cashInvestExists: !!cashInvest,
        cashInvestDetails: cashInvest ? {
          id: cashInvest.id,
          type: cashInvest.type,
          amount: cashInvest.amount,
          date: cashInvest.date
        } : null,
        newBalance: '5000'
      }
    })

    console.log('CASH LEDGER CLEANUP COMPLETED:', result)

    return NextResponse.json({
      success: true,
      message: 'Cash ledger cleaned successfully',
      details: result
    })

  } catch (error) {
    console.error('Cash ledger cleanup error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to clean cash ledger' },
      { status: 500 }
    )
  }
}
