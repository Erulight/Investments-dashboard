import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

export const dynamic = 'force-dynamic'

// Test what happens when we try to withdraw from the current deal
export async function POST() {
  try {
    await requireAuth(['OWNER'])

    const deal = await prisma.investment.findFirst({
      where: { name: { contains: 'البندرية' } },
      include: {
        account: true,
        dealParticipants: true,
        transactions: true,
      },
    })

    if (!deal) {
      return NextResponse.json({ error: 'Deal not found' }, { status: 404 })
    }

    // Simulate what the withdraw route checks
    const checks = {
      dealId: deal.id,
      dealName: deal.name,
      principalAmount: deal.principalAmount,
      receivableAmount: deal.receivableAmount,
      totalReceived: deal.totalReceived,
      
      // Check profit validation
      profitCheck: {
        receivable: Number(deal.receivableAmount || 0),
        received: Number(deal.totalReceived || 0),
        receivableCents: Math.round(Number(deal.receivableAmount || 0) * 100),
        receivedCents: Math.round(Number(deal.totalReceived || 0) * 100),
        remainingProfitCents: Math.max(0, Math.round(Number(deal.receivableAmount || 0) * 100) - Math.round(Number(deal.totalReceived || 0) * 100)),
        requestedProfitCents: Math.round(500 * 100), // User is trying to withdraw 500
        wouldPass: Math.round(500 * 100) - Math.max(0, Math.round(Number(deal.receivableAmount || 0) * 100) - Math.round(Number(deal.totalReceived || 0) * 100)) <= 1,
      },

      // Check principal validation
      principalCheck: {
        dealPrincipal: deal.principalAmount,
        requestedPrincipal: 5000,
        wouldPass: 5000 <= deal.principalAmount,
      },

      existingTransactions: deal.transactions.map(t => ({
        type: t.type,
        amount: t.amount,
        date: t.date,
      })),
    }

    return NextResponse.json(checks)
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
