import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { z } from 'zod'

const PayZakatSchema = z.object({
  investmentId: z.string(),
  amount: z.number().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const canAccess = user.role === 'OWNER' || user.role === 'PARTNER'
    if (!canAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { investmentId, amount, date, notes } = PayZakatSchema.parse(body)

    // Verify the investment exists and user has access
    const investment = await prisma.investment.findFirst({
      where: {
        id: investmentId,
        account: { type: 'SUKUK' },
        ...(user.role === 'PARTNER' && user.personId ? {
          dealParticipants: {
            some: { personId: user.personId }
          }
        } : {})
      },
      include: {
        dealParticipants: user.role === 'PARTNER' && user.personId ? {
          where: { personId: user.personId }
        } : true
      }
    })

    if (!investment) {
      return NextResponse.json({ error: 'Investment not found or access denied' }, { status: 404 })
    }

    // Create Zakat payment record - temporarily create transaction only until schema is migrated
    // TODO: Uncomment after running prisma generate and migrate
    /*
    const zakatPayment = await prisma.zakatPayment.create({
      data: {
        investmentId,
        userId: user.id,
        personId: user.role === 'PARTNER' ? user.personId : null,
        amount,
        date: new Date(date),
        notes: notes || `Zakat payment for ${investment.name}`,
        paymentMethod: 'MANUAL',
        status: 'COMPLETED'
      }
    })
    */
    
    // Temporary: Create a unique ID for the payment
    const tempPaymentId = `zakat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    // Create corresponding transaction record for audit trail
    await prisma.transaction.create({
      data: {
        accountId: investment.accountId,
        type: 'ZAKAT_PAYMENT',
        amount: -amount, // Negative because it's an outflow
        date: new Date(date),
        description: `Zakat payment for ${investment.name}`,
        investmentId,
        personId: user.role === 'PARTNER' ? user.personId : null,
        metadata: JSON.stringify({
          zakatPaymentId: tempPaymentId,
          calculationMethod: 'RULE_BASED',
          rulesVersion: '1.0'
        })
      }
    })

    return NextResponse.json({
      success: true,
      payment: {
        id: tempPaymentId,
        amount: amount,
        date: date,
        investmentName: investment.name
      }
    })

  } catch (error) {
    console.error('Error processing Zakat payment:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.issues },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const canAccess = user.role === 'OWNER' || user.role === 'PARTNER'
    if (!canAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Get Zakat payment history - temporarily return empty array until schema is migrated
    // TODO: Uncomment after running prisma generate and migrate
    /*
    const payments = await prisma.zakatPayment.findMany({
      where: {
        userId: user.id,
        ...(user.role === 'PARTNER' ? { personId: user.personId } : {})
      },
      include: {
        investment: {
          select: {
            id: true,
            name: true,
            isIjarah: true
          }
        }
      },
      orderBy: { date: 'desc' }
    })
    */

    return NextResponse.json({
      payments: [] // Temporary empty array
      /*
      payments: payments.map((payment: any) => ({
        id: payment.id,
        investmentId: payment.investmentId,
        investmentName: payment.investment.name,
        amount: payment.amount,
        date: payment.date.toISOString().split('T')[0],
        notes: payment.notes,
        status: payment.status,
        createdAt: payment.createdAt.toISOString()
      }))
      */
    })

  } catch (error) {
    console.error('Error fetching Zakat payments:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
