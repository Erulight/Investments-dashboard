import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { requireModuleAccess } from '@/lib/rbac'
import { DISPLAY_CURRENCY_KEY, normalizeDisplayCurrency } from '@/lib/currency'
import { ZakatAuditClient } from '@/components/zakat/ZakatAuditClient'

export const dynamic = 'force-dynamic'

export default async function ZakatAuditPage() {
  await requireModuleAccess('zakat')
  const user = await getCurrentUser()
  if (!user) return null

  const canAccess = user.role === 'OWNER' || user.role === 'PARTNER'
  if (!canAccess) {
    return (
      <div className="p-8 text-slate-400 text-sm">Access restricted.</div>
    )
  }

  const displayCurrencySetting = await prisma.systemSetting.findUnique({
    where: { key: DISPLAY_CURRENCY_KEY },
  })
  const displayCurrency = normalizeDisplayCurrency(displayCurrencySetting?.value)

  // Fetch all ZAKAT_PAID movements scoped to the user
  const personFilter =
    user.role === 'PARTNER' && user.personId
      ? { personId: user.personId }
      : undefined

  const movements = await prisma.cashBucketMovement.findMany({
    where: {
      type: 'ZAKAT_PAID',
      cashBucket: personFilter,
    },
    orderBy: { date: 'desc' },
    include: {
      cashBucket: {
        select: {
          id: true,
          label: true,
          currency: true,
          personId: true,
          person: { select: { name: true } },
          allocations: {
            take: 1,
            select: {
              investment: {
                select: {
                  id: true,
                  name: true,
                  account: { select: { type: true } },
                },
              },
            },
          },
        },
      },
    },
  })

  const now = new Date()
  const startOfYear = new Date(now.getFullYear(), 0, 1)

  let totalPaid = 0
  let paidThisYear = 0

  const payments = movements.map((m) => {
    const amount = Math.abs(Number(m.amount))
    totalPaid += amount
    if (new Date(m.date) >= startOfYear) paidThisYear += amount

    const alloc = m.cashBucket?.allocations?.[0]

    return {
      id: m.id,
      amount,
      date: m.date instanceof Date ? m.date.toISOString() : String(m.date),
      notes: m.notes || null,
      bucketId: m.cashBucketId,
      bucketLabel: m.cashBucket?.label || null,
      bucketCurrency: m.cashBucket?.currency || 'SAR',
      personId: m.cashBucket?.personId || null,
      personName: m.cashBucket?.person?.name || null,
      investmentId: alloc?.investment?.id || null,
      investmentName: alloc?.investment?.name || null,
      investmentType: alloc?.investment?.account?.type || null,
      createdAt: m.date instanceof Date ? m.date.toISOString() : String(m.date),
    }
  })

  return (
    <div className="min-h-screen bg-slate-950 p-4 sm:p-6 lg:p-8">
      <ZakatAuditClient
        payments={payments}
        totalPaid={totalPaid}
        paidThisYear={paidThisYear}
        displayCurrency={displayCurrency}
      />
    </div>
  )
}
