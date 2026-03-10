import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'
import { recomputeCashSetting } from '@/lib/cashBalance'

const RESET_CONFIRM_TEXT = 'RESET'

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(['OWNER'])
    const body = await req.json().catch(() => ({}))

    const confirmText = typeof body.confirmText === 'string' ? body.confirmText.trim() : ''
    const password = typeof body.password === 'string' ? body.password : ''

    const currentUser = await prisma.user.findUnique({ where: { id: user.id } })
    if (!currentUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const confirmMatch = confirmText.toUpperCase() === RESET_CONFIRM_TEXT
    const passwordMatch = password ? await bcrypt.compare(password, currentUser.password) : false

    if (!confirmMatch && !passwordMatch) {
      return NextResponse.json(
        { error: 'Provide owner password or type RESET to confirm' },
        { status: 400 }
      )
    }

    await prisma.$transaction(async (tx: any) => {
      await tx.cashBucketMovement.deleteMany({})
      await tx.investmentBucketAllocation.deleteMany({})
      await tx.cashBucket.deleteMany({})
      await tx.transaction.deleteMany({})
      await tx.debtPayment.deleteMany({})
      await tx.debt.deleteMany({})
      await tx.dealParticipant.deleteMany({})
      await tx.investment.deleteMany({})
      await tx.valuation.deleteMany({})

      await recomputeCashSetting(tx, null)
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Reset data error:', error)

    let statusCode = 500
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        statusCode = 401
      } else if (error.message === 'Forbidden') {
        statusCode = 403
      }
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to reset data' },
      { status: statusCode }
    )
  }
}
