import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { requireModuleAccess } from '@/lib/rbac'
import { DISPLAY_CURRENCY_KEY, normalizeDisplayCurrency } from '@/lib/currency'
import { redirect } from 'next/navigation'
import { ZakatAuditClient } from '@/components/zakat/audit/ZakatAuditClient'
import { type Warning } from '@/components/zakat/audit/ReconciliationWarnings'
import { type InvestmentBreakdownItem } from '@/components/zakat/audit/InvestmentBreakdown'

export const dynamic = 'force-dynamic'

export default async function ZakatAuditPage() {
  await requireModuleAccess('zakat')
  const user = await getCurrentUser()
  
  if (!user) {
    redirect('/login')
  }

  if (user.role !== 'OWNER' && user.role !== 'PARTNER') {
    redirect('/dashboard')
  }

  const displayCurrencySetting = await prisma.systemSetting.findUnique({
    where: { key: DISPLAY_CURRENCY_KEY },
  })
  const displayCurrency = normalizeDisplayCurrency(displayCurrencySetting?.value)

  const ownerPersonId = user.role === 'OWNER' ? (user.personId || null) : null

  // Fetch all data needed for audit
  const [buckets, investments, zakatPayments, sukukInvestments, cryptoInvestments] = await Promise.all([
    prisma.cashBucket.findMany({
      where: {
        excludeFromZakat: false,
        ...(user.role === 'OWNER'
          ? { OR: [{ personId: null }, { personId: ownerPersonId }] }
          : { personId: user.personId }),
      },
      include: {
        movements: {
          orderBy: { date: 'desc' },
        },
        allocations: {
          include: {
            investment: {
              include: {
                account: { select: { type: true } },
              },
            },
          },
        },
        debt: { select: { id: true } },
      },
    }),
    prisma.investment.findMany({
      where: user.role === 'OWNER' ? {} : { dealParticipants: { some: { personId: user.personId } } },
      include: {
        account: { select: { type: true, currency: true } },
        transactions: {
          where: { type: { in: ['WITHDRAW_PROFIT', 'WITHDRAW_PRINCIPAL', 'CASH_INVEST'] } },
          orderBy: { date: 'desc' },
        },
        bucketAllocations: {
          include: {
            cashBucket: { select: { label: true, haulStartDate: true } },
          },
        },
      },
    }),
    prisma.cashBucketMovement.findMany({
      where: {
        type: 'ZAKAT_PAID',
        date: { gte: new Date(new Date().getFullYear(), 0, 1) },
      },
      select: { amount: true, date: true, cashBucketId: true },
    }),
    prisma.investment.findMany({
      where: {
        account: { type: 'SUKUK' },
        ...(user.role === 'OWNER' ? {} : { dealParticipants: { some: { personId: user.personId } } }),
      },
      select: {
        id: true,
        name: true,
        principalAmount: true,
        currentValue: true,
        receivableAmount: true,
        maturityDate: true,
      },
    }),
    prisma.investment.findMany({
      where: {
        account: { type: 'CRYPTO' },
        ...(user.role === 'OWNER' ? {} : { dealParticipants: { some: { personId: user.personId } } }),
      },
      select: { currentValue: true },
    }),
  ])

  const now = new Date()
  const currentYear = now.getFullYear()

  // Calculate total wealth
  const cashWealth = buckets.reduce((sum, b) => sum + Math.max(0, Number(b.balance) || 0), 0)
  const sukukWealth = sukukInvestments.reduce(
    (sum, inv) => sum + Math.max(0, Number(inv.principalAmount) || 0) + Math.max(0, Number(inv.receivableAmount) || 0),
    0
  )
  const cryptoWealth = cryptoInvestments.reduce((sum, inv) => sum + Math.max(0, Number(inv.currentValue) || 0), 0)
  const totalWealth = cashWealth + sukukWealth + cryptoWealth

  // Calculate zakat amounts
  const totalDue = buckets.reduce((sum, b) => {
    const movements = b.movements || []
    const zakatPaid = movements.filter(m => m.type === 'ZAKAT_PAID')
    const balance = Math.max(0, Number(b.balance) || 0)
    const due = balance * 0.025
    const paid = zakatPaid.reduce((s, m) => s + Math.abs(Number(m.amount) || 0), 0)
    return sum + Math.max(0, due - paid)
  }, 0)

  const totalPaidThisYear = zakatPayments.reduce((sum, p) => sum + Math.abs(Number(p.amount) || 0), 0)
  const remainingToPay = totalDue

  // Find next due date
  const nextDueDate = buckets
    .map(b => {
      if (!b.haulStartDate) return null
      const haulStart = new Date(b.haulStartDate)
      const nextHaulEnd = new Date(haulStart)
      nextHaulEnd.setDate(nextHaulEnd.getDate() + 354)
      return nextHaulEnd > now ? nextHaulEnd.toISOString().split('T')[0] : null
    })
    .filter(Boolean)
    .sort()[0] || null

  // Run system health checks
  const warnings: Warning[] = []

  // Check 1: Buckets missing haulStartDate
  buckets.forEach(b => {
    if (!b.haulStartDate || isNaN(new Date(b.haulStartDate).getTime())) {
      warnings.push({
        id: `missing-haul-${b.id}`,
        type: 'MISSING_HAUL_START',
        severity: 'error',
        title: 'Bucket Missing Hawl Start Date',
        description: `Bucket "${b.label || b.id.slice(0, 8)}" is missing haulStartDate`,
        bucketId: b.id,
      })
    }
  })

  // Check 2: Debt buckets in zakat
  buckets.forEach(b => {
    if (b.debt?.id) {
      warnings.push({
        id: `debt-bucket-${b.id}`,
        type: 'DEBT_IN_ZAKAT',
        severity: 'error',
        title: 'Debt Bucket in Zakat Calculations',
        description: `Debt bucket "${b.label || b.id.slice(0, 8)}" should be excluded from zakat`,
        bucketId: b.id,
      })
    }
  })

  // Check 3: ROSCA funded Sukuk missing savingsHaulStartDate
  sukukInvestments.forEach(inv => {
    const sukukFull = investments.find(i => i.id === inv.id)
    if (!sukukFull) return
    
    const isRoscaFunded = sukukFull.bucketAllocations?.some(a => {
      const label = a.cashBucket?.label || ''
      return label.startsWith('Savings Receipt •') || label.startsWith('Circlys Reward Receipt •')
    })

    if (isRoscaFunded) {
      try {
        const meta = sukukFull.metadata ? JSON.parse(sukukFull.metadata as string) : {}
        if (!meta?.savingsHaulStartDate) {
          warnings.push({
            id: `missing-savings-haul-${inv.id}`,
            type: 'MISSING_SAVINGS_HAUL',
            severity: 'warning',
            title: 'ROSCA Funded Sukuk Missing Hawl Date',
            description: `Sukuk "${inv.name}" is ROSCA-funded but missing savingsHaulStartDate in metadata`,
            investmentId: inv.id,
          })
        }
      } catch {}
    }
  })

  // Check 4: Contribution buckets not excluded
  buckets.forEach(b => {
    const label = b.label || ''
    if (label.startsWith('Circlys •') && !label.includes('Receipt')) {
      warnings.push({
        id: `contribution-not-excluded-${b.id}`,
        type: 'CONTRIBUTION_NOT_EXCLUDED',
        severity: 'error',
        title: 'Contribution Bucket Not Excluded',
        description: `Monthly contribution bucket "${b.label}" should be excluded from zakat`,
        bucketId: b.id,
      })
    }
  })

  const systemHealth: 'ALL_CLEAR' | 'WARNINGS' = warnings.length === 0 ? 'ALL_CLEAR' : 'WARNINGS'

  // Build timeline items
  const timelineItems = buckets.map(b => {
    if (!b.haulStartDate) return null

    const haulStart = new Date(b.haulStartDate)
    const haulEnd = new Date(haulStart)
    haulEnd.setDate(haulEnd.getDate() + 354)

    const zakatPaid = (b.movements || []).filter(m => m.type === 'ZAKAT_PAID')
    const balance = Math.max(0, Number(b.balance) || 0)
    const zakatDue = balance * 0.025
    const isPaid = zakatPaid.length > 0

    const status: 'paid' | 'due' | 'upcoming' = 
      isPaid ? 'paid' : 
      haulEnd <= now ? 'due' : 
      'upcoming'

    return {
      id: b.id,
      source: b.label || 'General Cash',
      haulStart: haulStart.toISOString().split('T')[0],
      haulEnd: haulEnd.toISOString().split('T')[0],
      status,
      zakatAmount: zakatDue,
      nextDueDate: haulEnd > now ? haulEnd.toISOString().split('T')[0] : null,
    }
  }).filter(Boolean) as any[]

  // Build investment breakdown
  const investmentBreakdown: InvestmentBreakdownItem[] = sukukInvestments.map(inv => {
    const sukukFull = investments.find(i => i.id === inv.id)
    const fundingSources = (sukukFull?.bucketAllocations || []).map(alloc => ({
      bucketLabel: alloc.cashBucket?.label || 'Unknown',
      amount: Number(alloc.principalAllocated) || 0,
      haulDate: alloc.cashBucket?.haulStartDate?.toISOString().split('T')[0] || '—',
    }))

    const principalZakat = Math.max(0, Number(inv.principalAmount) || 0) * 0.025
    const profitZakat = Math.max(0, Number(inv.receivableAmount) || 0) * 0.025
    const isMatured = inv.maturityDate && new Date(inv.maturityDate) <= now

    return {
      id: inv.id,
      name: inv.name,
      totalPrincipal: Math.max(0, Number(inv.principalAmount) || 0),
      fundingSources,
      zakatRows: [
        {
          type: 'principal' as const,
          label: 'Principal Zakat',
          amount: principalZakat,
          status: isMatured ? 'due' : 'upcoming',
        },
        {
          type: 'profit' as const,
          label: 'Profit Zakat',
          amount: profitZakat,
          status: 'due' as const,
        },
      ],
      totalZakat: principalZakat + profitZakat,
    }
  })

  return (
    <ZakatAuditClient
      totalWealth={totalWealth}
      totalDue={totalDue}
      totalPaidThisYear={totalPaidThisYear}
      remainingToPay={remainingToPay}
      nextDueDate={nextDueDate}
      systemHealth={systemHealth}
      warningCount={warnings.length}
      warnings={warnings}
      timelineItems={timelineItems}
      investments={investmentBreakdown}
      displayCurrency={displayCurrency}
      exportData={{
        rows: buckets.map(b => ({
          id: b.id,
          label: b.label,
          balance: Number(b.balance) || 0,
          zakatDue: (Number(b.balance) || 0) * 0.025,
          isPaid: (b.movements || []).some(m => m.type === 'ZAKAT_PAID'),
          haulStartDate: b.haulStartDate?.toISOString().split('T')[0] || '',
          haulCompleteDate: b.haulStartDate
            ? new Date(new Date(b.haulStartDate).getTime() + 354 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
            : '',
          source: b.label || 'General',
          rowKind: 'IDLE' as const,
        })),
        buckets,
        investments,
      }}
    />
  )
}
