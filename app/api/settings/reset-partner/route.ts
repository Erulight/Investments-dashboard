import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

const RESET_CONFIRM_TEXT = 'RESET PARTNER'
const CASH_BALANCE_KEY = 'CASH_BALANCE'

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(['OWNER'])
    const body = await req.json().catch(() => ({}))

    const partnerPersonId = typeof body.partnerPersonId === 'string' ? body.partnerPersonId.trim() : ''
    const confirmText = typeof body.confirmText === 'string' ? body.confirmText.trim() : ''
    const password = typeof body.password === 'string' ? body.password : ''

    if (!partnerPersonId) {
      return NextResponse.json({ error: 'Partner is required' }, { status: 400 })
    }

    const currentUser = await prisma.user.findUnique({ where: { id: user.id } })
    if (!currentUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const confirmMatch = confirmText.toUpperCase() === RESET_CONFIRM_TEXT
    const passwordMatch = password ? await bcrypt.compare(password, currentUser.password) : false

    if (!confirmMatch && !passwordMatch) {
      return NextResponse.json(
        { error: 'Provide owner password or type RESET PARTNER to confirm' },
        { status: 400 }
      )
    }

    const partner = await prisma.person.findUnique({ where: { id: partnerPersonId } })
    if (!partner) {
      return NextResponse.json({ error: 'Partner not found' }, { status: 404 })
    }

    await prisma.$transaction(async (tx) => {
      const buckets = await tx.cashBucket.findMany({
        where: { personId: partnerPersonId } as any,
        select: { id: true },
      })
      const bucketIds = buckets.map((b) => b.id)

      if (bucketIds.length > 0) {
        await tx.cashBucketMovement.deleteMany({
          where: { cashBucketId: { in: bucketIds } },
        })

        await tx.investmentBucketAllocation.deleteMany({
          where: { cashBucketId: { in: bucketIds } },
        })
      }

      await tx.cashBucket.deleteMany({
        where: { personId: partnerPersonId } as any,
      })

      await tx.transaction.deleteMany({
        where: { personId: partnerPersonId } as any,
      })

      const key = `${CASH_BALANCE_KEY}:${partnerPersonId}`
      const setting = await tx.systemSetting.findUnique({ where: { key } })
      if (setting) {
        await tx.systemSetting.update({ where: { key }, data: { value: '0' } })
      } else {
        await tx.systemSetting.create({
          data: {
            key,
            value: '0',
            description: 'Available cash balance for investments',
          },
        })
      }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Reset partner error:', error)

    let statusCode = 500
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        statusCode = 401
      } else if (error.message === 'Forbidden') {
        statusCode = 403
      }
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to reset partner' },
      { status: statusCode }
    )
  }
}
