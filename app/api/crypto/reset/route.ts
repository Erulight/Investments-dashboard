import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { requireModuleAccess } from '@/lib/rbac'
import { createAuditLog } from '@/lib/audit'
import { recomputeCashSetting } from '@/lib/cashBalance'

const getCashAccount = async (tx: any, currency = 'SAR') => {
  const existing = await tx.account.findFirst({
    where: { type: 'CASH', isActive: true },
  })
  if (existing) return existing
  return tx.account.create({
    data: {
      name: 'Cash Balance',
      type: 'CASH',
      currency,
      description: 'Cash ledger account',
    },
  })
}

export async function POST(request: Request) {
  try {
    await requireModuleAccess('crypto')
    const user = await getCurrentUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (user.role !== 'OWNER') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const cryptoId = typeof body.cryptoId === 'string' ? body.cryptoId : ''

    if (!cryptoId) {
      return NextResponse.json({ error: 'cryptoId is required' }, { status: 400 })
    }

    const inv = await prisma.investment.findUnique({
      where: { id: cryptoId },
      include: { account: true },
    })

    if (!inv) {
      return NextResponse.json({ error: 'Crypto portfolio not found' }, { status: 404 })
    }

    const metadata = (() => {
      try {
        return JSON.parse(inv.metadata || '{}')
      } catch {
        return {}
      }
    })()

    if (metadata.type !== 'CRYPTO_PORTFOLIO') {
      return NextResponse.json({ error: 'Invalid crypto portfolio' }, { status: 400 })
    }

    const currency = inv.account?.currency || 'SAR'
    const nowIso = new Date().toISOString()

    const updated = await prisma.$transaction(async (tx: any) => {
      const investOutMovements = await tx.cashBucketMovement.findMany({
        where: {
          investmentId: cryptoId,
          type: 'INVEST_OUT',
        },
      })

      const refundTotal = investOutMovements.reduce(
        (sum: number, m: { amount: number }) => sum + Math.abs(m.amount),
        0
      )

      if (refundTotal > 0) {
        for (const movement of investOutMovements) {
          const delta = Math.abs(movement.amount)
          if (delta <= 0) continue
          await tx.cashBucket.update({
            where: { id: movement.cashBucketId },
            data: { balance: { increment: delta } },
          })
        }

        await tx.cashBucketMovement.deleteMany({
          where: {
            investmentId: cryptoId,
            type: 'INVEST_OUT',
          },
        })

        await tx.transaction.deleteMany({
          where: {
            investmentId: cryptoId,
            type: 'INVEST_OUT',
          },
        })

        await recomputeCashSetting(tx, null)

        const cashAccount = await getCashAccount(tx, currency)
        await tx.transaction.create({
          data: {
            accountId: cashAccount.id,
            investmentId: cryptoId,
            personId: user.role === 'OWNER' ? null : (user.personId || null),
            type: 'ROLLBACK_PRINCIPAL',
            amount: refundTotal,
            date: new Date(),
            description: `Crypto Reset Refund • ${inv.name}`,
            metadata: JSON.stringify({
              type: 'CRYPTO_PORTFOLIO',
              action: 'RESET_REFUND',
              refunded: refundTotal,
            }),
          },
        })
      }

      const nextMeta = {
        ...metadata,
        investedAmount: 0,
        currentValue: 0,
        history: [
          {
            at: nowIso,
            action: 'RESET',
            investedAmount: 0,
            currentValue: 0,
          },
        ],
      }

      return tx.investment.update({
        where: { id: cryptoId },
        data: {
          principalAmount: 0,
          currentValue: 0,
          metadata: JSON.stringify(nextMeta),
        },
        include: { account: true },
      })
    })

    await createAuditLog(user.id, 'UPDATE', 'INVESTMENT', cryptoId, {
      type: 'CRYPTO_PORTFOLIO',
      field: 'reset',
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error resetting crypto portfolio:', error)
    if (error instanceof Error && error.message === 'Module access denied') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }
    return NextResponse.json({ error: 'Failed to reset portfolio' }, { status: 500 })
  }
}
