import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { ZakatDashboard } from '@/components/zakat/ZakatDashboard'

export const dynamic = 'force-dynamic'

const addDays = (date: Date, days: number) => {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

const receiptTypes = new Set([
  'WITHDRAW_PROFIT',
  'WITHDRAW_PRINCIPAL',
  'ROLLBACK_PRINCIPAL',
  'SELL_RECEIPT',
])

export default async function ZakatPage() {
  const user = await getCurrentUser()
  if (!user || user.role !== 'OWNER') {
    return null
  }

  const buckets = await prisma.cashBucket.findMany({
    orderBy: { haulStartDate: 'asc' },
    include: {
      movements: {
        orderBy: { date: 'asc' },
        include: {
          investment: {
            select: {
              id: true,
              name: true,
              isIjarah: true,
              reopenedAt: true,
            },
          },
        },
      },
    },
  })

  const rows = buckets.map((bucket) => {
    const effectiveStart = bucket.lastZakatPaidDate
      ? new Date(bucket.lastZakatPaidDate)
      : new Date(bucket.haulStartDate)
    const haulCompleteDate = addDays(effectiveStart, 354)

    const idleMovements = bucket.movements.filter((movement) => {
      const movementDate = new Date(movement.date)
      if (movement.type === 'ZAKAT_PAID') return false
      if (movementDate < effectiveStart) return false
      return movementDate <= haulCompleteDate
    })

    const idleBase = Math.max(
      0,
      idleMovements.reduce((sum, movement) => sum + movement.amount, 0)
    )

    const rawReceipts = bucket.movements.filter((movement) => {
      if (!receiptTypes.has(movement.type)) return false
      if (!movement.investmentId) return false
      if (!movement.investment) return false
      if (movement.investment?.isIjarah) return false
      if (movement.investment?.reopenedAt) {
        const reopenedAt = new Date(movement.investment.reopenedAt)
        if (new Date(movement.createdAt) < reopenedAt) return false
      }
      const movementDate = new Date(movement.date)
      if (movementDate < effectiveStart) return false
      return movementDate >= haulCompleteDate
    })
    const dedupedMap = new Map<string, typeof rawReceipts[number]>()
    rawReceipts.forEach((movement) => {
      const key = [
        movement.investmentId,
        movement.type,
        movement.amount,
        new Date(movement.date).toISOString().split('T')[0],
      ].join('|')
      if (!dedupedMap.has(key)) {
        dedupedMap.set(key, movement)
      }
    })
    const dueReceipts = Array.from(dedupedMap.values())
    const receiptsTotal = dueReceipts.reduce((sum, m) => sum + m.amount, 0)
    const zakatBase = idleBase + receiptsTotal
    const zakatDue = zakatBase * 0.025

    const payments = bucket.movements
      .filter((movement) => movement.type === 'ZAKAT_PAID')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    const lastPayment = payments[0]

    return {
      id: bucket.id,
      label: bucket.label,
      currency: bucket.currency,
      balance: bucket.balance,
      haulStartDate: bucket.haulStartDate.toISOString().split('T')[0],
      lastZakatPaidDate: bucket.lastZakatPaidDate
        ? bucket.lastZakatPaidDate.toISOString().split('T')[0]
        : null,
      receiptsTotal,
      zakatDue,
      lastPayment: lastPayment
        ? {
            id: lastPayment.id,
            date: new Date(lastPayment.date).toISOString().split('T')[0],
            amount: Math.abs(lastPayment.amount),
          }
        : null,
      haulCompleteDate: haulCompleteDate.toISOString().split('T')[0],
      idleBase,
      dueReceipts: dueReceipts.map((m) => ({
        date: new Date(m.date).toISOString().split('T')[0],
        amount: m.amount,
        type: m.type,
        investmentName: m.investment?.name || null,
      })),
    }
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Zakat Dashboard</h1>
        <p className="text-sm text-gray-600 mt-2">
          Zakat is calculated only on cash received after the haul is completed.
        </p>
      </div>

      <ZakatDashboard buckets={rows} />
    </div>
  )
}
