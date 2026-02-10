import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { requireModuleAccess } from '@/lib/rbac'
import { createAuditLog } from '@/lib/audit'

export async function POST(request: Request) {
  try {
    await requireModuleAccess('savings') // We'll reuse savings permissions for SIP
    const user = await getCurrentUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { sipId, amount } = await request.json()

    if (!sipId || !amount || amount <= 0) {
      return NextResponse.json({ error: 'Invalid investment amount' }, { status: 400 })
    }

    // Get the SIP investment
    const sip = await prisma.investment.findUnique({
      where: { id: sipId },
      include: { account: true },
    })

    if (!sip) {
      return NextResponse.json({ error: 'SIP plan not found' }, { status: 404 })
    }

    const metadata = JSON.parse(sip.metadata || '{}')
    if (metadata.type !== 'SIP') {
      return NextResponse.json({ error: 'Invalid SIP plan' }, { status: 400 })
    }

    // Check if user has permission (OWNER or participant)
    if (user.role !== 'OWNER') {
      const isParticipant = await prisma.dealParticipant.findFirst({
        where: {
          investmentId: sipId,
          person: { user: { id: user.id } },
        },
      })
      if (!isParticipant) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
    }

    // For now, we'll just update the invested amount in metadata
    // In a real implementation, you would:
    // 1. Create a cash transaction to deduct from Cash Balance
    // 2. Update the investment's principalAmount and currentValue
    // 3. Create audit logs for the transaction

    const currentInvested = metadata.investedAmount || sip.principalAmount || 0
    const newInvested = currentInvested + amount
    const newPrincipal = sip.principalAmount + amount
    const prevHistory = Array.isArray(metadata.history) ? metadata.history : []
    const currentValue = metadata.currentValue || sip.currentValue || 0

    // Update the SIP investment
    const updatedSip = await prisma.investment.update({
      where: { id: sipId },
      data: {
        principalAmount: newPrincipal,
        metadata: JSON.stringify({
          ...metadata,
          investedAmount: newInvested,
          lastInvestmentDate: new Date().toISOString(),
          history: [
            ...prevHistory,
            {
              at: new Date().toISOString(),
              action: 'INVEST',
              amount,
              investedAmount: newInvested,
              totalAmount: metadata.totalAmount || 0,
              currentValue,
            },
          ].slice(-50),
        }),
      },
      include: { account: true },
    })

    // Log the investment action
    await createAuditLog(
      user.id,
      'UPDATE',
      'INVESTMENT',
      sipId,
      {
        amount,
        previousInvested: currentInvested,
        newInvested,
      }
    )

    return NextResponse.json(updatedSip)
  } catch (error) {
    console.error('Error investing in SIP:', error)
    if (error instanceof Error && error.message === 'Module access denied') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }
    return NextResponse.json({ error: 'Failed to invest in SIP plan' }, { status: 500 })
  }
}
