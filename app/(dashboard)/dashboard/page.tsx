import { getCurrentUser } from '@/lib/auth'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { prisma } from '@/lib/db'
import { DEMO_INVESTMENT_NAMES } from '@/lib/demo'
import { YearFilter } from '@/components/dashboard/YearFilter'
import { ReportButton } from '@/components/dashboard/ReportButton'
import { DashboardCharts } from '@/components/dashboard/DashboardCharts'
import { PremiumStatsGrid } from '@/components/dashboard/PremiumStatsGrid'
import { AnimatedCard } from '@/components/ui/AnimatedCard'
import { TradingChartOverlay } from '@/components/dashboard/TradingChartOverlay'
import { CASH_BALANCE_KEY, getBucketCashBalance } from '@/lib/cashBalance'

export const dynamic = 'force-dynamic'

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: { year?: string }
}) {
  const user = await getCurrentUser()
  
  if (!user) {
    return null
  }

  const yearParam = searchParams?.year
  const parsedYear = yearParam ? Number(yearParam) : NaN
  const selectedYear = Number.isFinite(parsedYear) ? parsedYear : new Date().getFullYear()
  const yearStart = new Date(selectedYear, 0, 1)
  const yearEnd = new Date(selectedYear + 1, 0, 1)

  const getOutstandingDebtsAt = async (atExclusive: Date) => {
    if (user.role !== 'OWNER') return 0
    const debts = await prisma.debt.findMany({
      where: {
        isArchived: false,
        borrowedAt: { lt: atExclusive },
      },
      include: {
        payments: {
          where: { paidAt: { lt: atExclusive } },
          select: { amount: true },
        },
      },
    })

    return debts.reduce((sum: number, d: any) => {
      const borrowed = Number(d.amount) || 0
      const paid = Array.isArray(d.payments)
        ? d.payments.reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0)
        : 0
      const outstanding = Math.max(0, borrowed - paid)
      return sum + outstanding
    }, 0)
  }

  const debtsAtStart = await getOutstandingDebtsAt(yearStart)
  const debtsAtEnd = await getOutstandingDebtsAt(yearEnd)

  const dashboardDebug = process.env.DASHBOARD_DEBUG === '1'

  const cashAccount = await prisma.account.findFirst({ where: { type: 'CASH', isActive: true } })

  const ownerCashSetting =
    user.role === 'OWNER'
      ? await prisma.systemSetting.findUnique({ where: { key: CASH_BALANCE_KEY } })
      : null
  const ownerCashSettingValue = Number(ownerCashSetting?.value || 0)

  const ownerTxScope = user.personId
    ? ({ OR: [{ personId: null }, { personId: user.personId }] } as any)
    : ({ personId: null } as any)

  const ownerBucketCash = user.role === 'OWNER'
    ? await getBucketCashBalance(prisma, null)
    : 0

  const allCashTxSum =
    user.role === 'OWNER' && cashAccount
      ? (
          await prisma.transaction.aggregate({
            where: { accountId: cashAccount.id, ...ownerTxScope },
            _sum: { amount: true },
          })
        )._sum.amount || 0
      : 0

  const cashOffset =
    user.role === 'OWNER'
      ? ownerBucketCash - (Number.isFinite(allCashTxSum) ? allCashTxSum : 0)
      : 0

  const cashAt = async (atExclusive: Date) => {
    if (user.role !== 'OWNER' || !cashAccount) return 0
    const sum = (
      await prisma.transaction.aggregate({
        where: { accountId: cashAccount.id, date: { lt: atExclusive }, ...ownerTxScope },
        _sum: { amount: true },
      })
    )._sum.amount || 0
    return cashOffset + (Number.isFinite(sum) ? sum : 0)
  }

  const cashAtStart = await cashAt(yearStart)
  const cashAtEnd = await cashAt(yearEnd)
  let cashBalance = user.role === 'OWNER' ? ownerBucketCash : cashAtEnd
  let cashSettingDelta = user.role === 'OWNER' && Number.isFinite(ownerCashSettingValue)
    ? ownerCashSettingValue - ownerBucketCash
    : 0

  if (user.role === 'PARTNER' && user.personId) {
    const bucketSum = await getBucketCashBalance(prisma, user.personId)
    cashBalance = Number.isFinite(bucketSum) ? bucketSum : 0
    cashSettingDelta = 0
  }

  if (dashboardDebug && user.role === 'OWNER') {
    console.log('[DASHBOARD_DEBUG] year', selectedYear)
    console.log('[DASHBOARD_DEBUG] debtsAtStart', debtsAtStart)
    console.log('[DASHBOARD_DEBUG] debtsAtEnd', debtsAtEnd)
    console.log('[DASHBOARD_DEBUG] cashAtStart', cashAtStart)
    console.log('[DASHBOARD_DEBUG] cashAtEnd', cashAtEnd)
    console.log('[DASHBOARD_DEBUG] cashBalance', cashBalance)
    console.log('[DASHBOARD_DEBUG] cashSettingDelta', cashSettingDelta)
  }

  let totalInvested = 0
  let totalValue = 0
  let totalProfit = 0
  let activeInvestments = 0

  let investments: any[] = []
  let ownedInvestments: any[] = []

  // Per-type breakdown
  type TypeBreakdown = { type: string; invested: number; value: number; count: number }
  let typeBreakdowns: TypeBreakdown[] = []

  // ROSCA / Circlys debt tracking
  let roscaDebt = 0

  let sukukInvested = 0
  let sukukValue = 0
  let sukukReceivable = 0
  let sipValue = 0
  let circlysOngoingSaved = 0
  let cryptoValue = 0

  const toDate = (value?: string | Date | null) => {
    if (!value) return null
    if (value instanceof Date) return value
    if (typeof value === 'string') {
      const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
      if (match) {
        const [, year, month, day] = match
        return new Date(Number(year), Number(month) - 1, Number(day))
      }
    }
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return null
    return date
  }

  const getPeriodMonths = (start?: string | Date | null, end?: string | Date | null) => {
    const startDate = toDate(start)
    const endDate = toDate(end)
    if (!startDate || !endDate) return 0
    const months = (endDate.getFullYear() - startDate.getFullYear()) * 12
      + (endDate.getMonth() - startDate.getMonth())
      + (endDate.getDate() - startDate.getDate()) / 30
    return Math.max(0, months)
  }

  const round2 = (value: number) => {
    const n = Number(value)
    if (!Number.isFinite(n)) return 0
    return Math.round(n * 100) / 100
  }

  const parseMetadata = (value: unknown) => {
    if (!value) return null
    if (typeof value === 'object') return value as any
    if (typeof value !== 'string') return null
    try {
      return JSON.parse(value)
    } catch {
      return null
    }
  }

  const getSukukNetProfit = (inv: any) => {
    const investment = Number.isFinite(inv.principalAmount) ? inv.principalAmount : 0
    const apr = Number.isFinite(inv.interestRate) ? inv.interestRate : 0
    const fees = Number.isFinite(inv.fees) ? inv.fees : 0
    const periodMonths = getPeriodMonths(inv.startDate, inv.maturityDate)
    const periodYears = periodMonths ? periodMonths / 12 : 0
    const grossProfit = investment > 0 && apr > 0 && periodYears > 0
      ? investment * (apr / 100) * periodYears
      : 0

    const manualReceivable = Number.isFinite(inv.receivableAmount) ? inv.receivableAmount : null
    if (manualReceivable !== null && manualReceivable > 0) return manualReceivable
    return Math.max(0, grossProfit - fees)
  }

  const getPartnerSukukMetrics = (inv: any, participation: any, asOf: Date) => {
    const principal = Number.isFinite(participation?.investedAmount) ? Number(participation.investedAmount) : 0
    const apr = Number.isFinite(inv?.interestRate) ? Number(inv.interestRate) : 0
    const fullFees = Number.isFinite(inv?.fees) ? Number(inv.fees) : 0
    const startBasis = participation?.acquiredAt ?? inv?.startDate
    const totalMonthsFull = getPeriodMonths(inv?.startDate, inv?.maturityDate)
    const monthsHeld = getPeriodMonths(startBasis, inv?.maturityDate)
    const timeRatio = totalMonthsFull > 0 ? Math.min(1, Math.max(0, monthsHeld / totalMonthsFull)) : 1

    const feesHeld = (principal > 0 && Number.isFinite(inv?.principalAmount) && Number(inv.principalAmount) > 0)
      ? (fullFees * Math.min(1, principal / Number(inv.principalAmount))) * timeRatio
      : 0

    const periodYears = monthsHeld ? monthsHeld / 12 : 0
    const grossProfit = principal > 0 && apr > 0 && periodYears > 0
      ? principal * (apr / 100) * periodYears
      : 0

    const manualReceivableFull = Number.isFinite(inv?.receivableAmount) ? Number(inv.receivableAmount) : null
    const manualReceivable = manualReceivableFull !== null && manualReceivableFull > 0
      ? manualReceivableFull * timeRatio
      : null

    const txs = Array.isArray(inv?.transactions) ? inv.transactions : []
    const commissionFromParticipant = Number.isFinite(participation?.commissionFees)
      ? Number(participation.commissionFees)
      : 0
    const commissionFromTx = txs
      .filter((tx: any) => tx?.type === 'BUY_FROM_PARTNER' && participation?.personId && tx.personId === participation.personId)
      .reduce((sum: number, tx: any) => {
        const meta = parseMetadata(tx.metadata)
        const commission = Number(meta?.commissionAmount ?? 0)
        return sum + (Number.isFinite(commission) ? Math.max(0, commission) : 0)
      }, 0)
    const commissionPaid = commissionFromParticipant > 0 ? commissionFromParticipant : commissionFromTx

    const netProfitTotal = manualReceivable !== null
      ? Math.max(0, manualReceivable - commissionPaid)
      : Math.max(0, grossProfit - feesHeld - commissionPaid)

    const start = toDate(startBasis)
    const maturity = toDate(inv?.maturityDate)
    const startTime = start?.getTime() || 0
    const maturityTime = maturity?.getTime() || 0
    const totalMs = maturityTime > startTime ? maturityTime - startTime : 0
    const atMs = asOf.getTime()
    const elapsedMs = totalMs > 0
      ? Math.min(Math.max(atMs - startTime, 0), totalMs)
      : (atMs > startTime ? 1 : 0)

    const accruedProfit = totalMs > 0
      ? netProfitTotal * (elapsedMs / totalMs)
      : (atMs > startTime ? netProfitTotal : 0)

    const withdrawnProfit = txs
      .filter((tx: any) => tx?.type === 'WITHDRAW_PROFIT' && participation?.personId && tx.personId === participation.personId)
      .filter((tx: any) => {
        const d = tx?.date instanceof Date ? tx.date : new Date(tx?.date)
        return !Number.isNaN(d.getTime()) && d.getTime() <= atMs
      })
      .reduce((sum: number, tx: any) => sum + Math.abs(Number(tx?.amount) || 0), 0)

    const withdrawnPrincipal = txs
      .filter((tx: any) => tx?.type === 'WITHDRAW_PRINCIPAL' && participation?.personId && tx.personId === participation.personId)
      .filter((tx: any) => {
        const d = tx?.date instanceof Date ? tx.date : new Date(tx?.date)
        return !Number.isNaN(d.getTime()) && d.getTime() <= atMs
      })
      .reduce((sum: number, tx: any) => sum + Math.abs(Number(tx?.amount) || 0), 0)

    const principalOutstanding = Math.max(0, principal - withdrawnPrincipal)
    const receivable = Math.max(0, accruedProfit - withdrawnProfit)
    const value = principalOutstanding + receivable

    return {
      principal,
      value,
      received: withdrawnProfit,
      receivable,
      profitAccrued: accruedProfit,
      feesHeld,
      commissionPaid,
    }
  }

  const getSukukValueAt = (inv: any, at: Date) => {
    const principal = Number.isFinite(inv.principalAmount) ? Number(inv.principalAmount) : 0
    if (principal <= 0) return 0

    const start = toDate(inv.startDate)
    const maturity = toDate(inv.maturityDate)
    const startTime = start?.getTime() || 0
    const maturityTime = maturity?.getTime() || 0

    const totalProfit = getSukukNetProfit(inv)

    const totalMs = maturityTime > startTime ? maturityTime - startTime : 0
    const atMs = at.getTime()
    const elapsedMs = totalMs > 0
      ? Math.min(Math.max(atMs - startTime, 0), totalMs)
      : (atMs > startTime ? 1 : 0)

    const accruedProfit = totalMs > 0
      ? totalProfit * (elapsedMs / totalMs)
      : (atMs > startTime ? totalProfit : 0)

    const txs = Array.isArray(inv.transactions) ? inv.transactions : []
    const upTo = (type: string) =>
      txs
        .filter((tx: any) => {
          if (tx?.type !== type) return false
          const d = tx?.date instanceof Date ? tx.date : new Date(tx?.date)
          return !Number.isNaN(d.getTime()) && d.getTime() <= atMs
        })
        .reduce((s: number, tx: any) => s + Math.abs(Number(tx?.amount) || 0), 0)

    const withdrawnProfit = upTo('WITHDRAW_PROFIT')
    const withdrawnPrincipal = upTo('WITHDRAW_PRINCIPAL')

    const principalOutstanding = Math.max(0, principal - withdrawnPrincipal)
    const profitOutstanding = Math.max(0, accruedProfit - withdrawnProfit)

    return principalOutstanding + profitOutstanding
  }

  const getValueFromHistoryAt = (inv: any, at: Date) => {
    const metadata = (() => {
      try {
        return JSON.parse(inv.metadata || '{}')
      } catch {
        return {}
      }
    })()

    const history = Array.isArray(metadata.history) ? metadata.history : []
    const points = history
      .filter((h: any) => typeof h?.action === 'string' && h.action === 'VALUE_UPDATE')
      .map((h: any) => ({ at: new Date(h.at), value: Number(h.currentValue) }))
      .filter((p: any) => !Number.isNaN(p.at.getTime()) && Number.isFinite(p.value))
      .sort((a: any, b: any) => a.at.getTime() - b.at.getTime())

    const t = at.getTime()
    for (let i = points.length - 1; i >= 0; i--) {
      if (points[i].at.getTime() <= t) return points[i].value
    }

    const fallback = Number(inv.currentValue)
    return Number.isFinite(fallback) ? fallback : 0
  }

  const isActiveAt = (inv: any, at: Date) => {
    const start = toDate(inv.startDate)
    const maturity = toDate(inv.maturityDate)
    if (!start) return false
    if (start.getTime() >= at.getTime()) return false
    if (!maturity) return true
    return maturity.getTime() >= at.getTime()
  }

  if (user.role === 'OWNER') {
    investments = await prisma.investment.findMany({
      where: {
        account: { isActive: true, type: { not: 'CASH' } },
        name: { notIn: DEMO_INVESTMENT_NAMES },
      },
      select: {
        id: true,
        name: true,
        principalAmount: true,
        currentValue: true,
        realizedProfit: true,
        unrealizedProfit: true,
        startDate: true,
        maturityDate: true,
        interestRate: true,
        fees: true,
        receivableAmount: true,
        metadata: true,
        account: { select: { type: true } },
        dealParticipants: {
          select: {
            personId: true,
            investedAmount: true,
            currentValue: true,
            profit: true,
          },
        },
        transactions: {
          where: {
            type: {
              in: [
                'WITHDRAW_PROFIT',
                'WITHDRAW_PRINCIPAL',
                'SELL_PROFIT_ACCRUED',
                'PARTNER_COMMISSION',
                'SELL_TO_PARTNER',
                'BUY_FROM_PARTNER',
              ],
            },
            OR: [{ personId: user.personId }, { personId: null }],
          },
          select: {
            type: true,
            date: true,
            amount: true,
            personId: true,
            metadata: true,
          },
          orderBy: { date: 'asc' },
        },
      },
    })

    const ownerPersonId = user.personId || null
    const getOwnerPosition = (inv: any) => {
      if (!ownerPersonId) return null
      const dps = Array.isArray(inv.dealParticipants) ? inv.dealParticipants : []
      return dps.find((p: any) => p?.personId === ownerPersonId) || null
    }

    const getOwnerSukukPrincipal = (inv: any) => {
      const ownerPosition = getOwnerPosition(inv)
      if (ownerPosition) {
        const ownerPrincipal = Number(ownerPosition.investedAmount)
        return Number.isFinite(ownerPrincipal) ? Math.max(0, ownerPrincipal) : 0
      }

      // Legacy deals may not have participants; in that case fallback to investment principal.
      const participants = Array.isArray(inv.dealParticipants) ? inv.dealParticipants : []
      if (participants.length === 0) {
        const principal = Number(inv.principalAmount)
        return Number.isFinite(principal) ? Math.max(0, principal) : 0
      }

      // Partner-only / transferred deals should not count in owner principal metrics.
      return 0
    }

    const hasOwnerSellTx = (inv: any) => {
      if (!ownerPersonId) return false
      const txs = Array.isArray(inv.transactions) ? inv.transactions : []
      return txs.some((tx: any) => tx?.type === 'SELL_TO_PARTNER' && tx.personId === ownerPersonId)
    }

    const isSoldSukukForOwner = (inv: any) => {
      if (inv?.account?.type !== 'SUKUK') return false
      const participants = Array.isArray(inv.dealParticipants) ? inv.dealParticipants : []
      if (participants.length === 0) return false
      if (!hasOwnerSellTx(inv)) return false
      const ownerPosition = getOwnerPosition(inv)
      return !ownerPosition || Number(ownerPosition.investedAmount || 0) <= 0
    }

    const getOwnerSoldSettlement = (inv: any) => {
      if (!isSoldSukukForOwner(inv)) return { target: 0, received: 0, pending: 0 }

      const txs = Array.isArray(inv.transactions) ? inv.transactions : []
      const sells = txs
        .filter((tx: any) => tx?.type === 'SELL_TO_PARTNER' && (!ownerPersonId || tx.personId === ownerPersonId))
        .map((tx: any) => {
          const d = tx?.date instanceof Date ? tx.date : new Date(tx?.date)
          return { tx, d: Number.isNaN(d.getTime()) ? null : d, meta: parseMetadata(tx?.metadata) }
        })
        .filter((x: any) => x.d)
        .sort((a: any, b: any) => (b.d as Date).getTime() - (a.d as Date).getTime())

      const latestSell = sells[0]
      if (!latestSell) return { target: 0, received: 0, pending: 0 }

      const target = round2(Math.max(0, Number(latestSell.meta?.accruedProfitAtSale ?? latestSell.meta?.investorProfit ?? 0)))
      if (target <= 0) return { target: 0, received: 0, pending: 0 }

      const soldAt = latestSell.d as Date
      const receivedRaw = txs.reduce((sum: number, tx: any) => {
        if (ownerPersonId && tx?.personId !== ownerPersonId && tx?.personId != null) return sum

        const d = tx?.date instanceof Date ? tx.date : new Date(tx?.date)
        if (Number.isNaN(d.getTime()) || d.getTime() < soldAt.getTime()) return sum

        if (tx.type === 'SELL_PROFIT_ACCRUED') {
          const amount = Number(tx.amount)
          return sum + (Number.isFinite(amount) ? Math.max(0, amount) : 0)
        }

        if (tx.type === 'WITHDRAW_PROFIT') {
          const meta = parseMetadata(tx.metadata)
          if (meta?.source !== 'SOLD_DEAL_RECEIPT') return sum
          const amount = Number(tx.amount)
          return sum + (Number.isFinite(amount) ? Math.max(0, amount) : 0)
        }

        return sum
      }, 0)

      const received = round2(Math.min(target, Math.max(0, receivedRaw)))
      const pending = round2(Math.max(0, target - received))
      return { target, received, pending }
    }

    const owned = investments.filter((inv: any) => {
      // Exclude CASH and CIRCLYS from the main owned bucket
      if (inv.account?.type === 'CASH') return false
      if (inv.account?.type === 'CIRCLYS') return false
      return true
    })

    const ownerScoped = owned.filter((inv: any) => {
      if (inv.account?.type !== 'SUKUK') return true
      return getOwnerSukukPrincipal(inv) > 0 || hasOwnerSellTx(inv)
    })

    ownedInvestments = ownerScoped

    const activeSukuk = ownerScoped
      .filter((inv) => inv.account.type === 'SUKUK')
      .filter((inv) => getOwnerSukukPrincipal(inv) > 0)

    // Total Invested = principal in active Sukuk deals only
    totalInvested = activeSukuk.reduce((sum, inv) => sum + getOwnerSukukPrincipal(inv), 0)

    // Active Deals and Sukuk Total use active Sukuk principal only
    activeInvestments = activeSukuk.length
    sukukInvested = activeSukuk.reduce((sum, inv) => sum + getOwnerSukukPrincipal(inv), 0)

    totalValue = ownerScoped.reduce(
      (sum, inv) => {
        const principal = inv.account.type === 'SUKUK'
          ? getOwnerSukukPrincipal(inv)
          : inv.principalAmount
        return sum + (inv.account.type === 'SUKUK' ? principal : inv.currentValue)
      },
      0
    )
    // Profit from non-Sukuk owned investments (SIP currently excluded intentionally)
    const nonSukukOwnedProfit = ownerScoped.reduce(
      (sum, inv) => {
        const accountType = inv.account.type
        const pos = getOwnerPosition(inv)
        
        // Include profit from: CRYPTO, MALAA
        if (['CRYPTO', 'MALAA'].includes(accountType)) {
          if (pos) return sum + (Number(pos.profit) || 0)
          return sum + (Number(inv.realizedProfit) || 0) + (Number(inv.unrealizedProfit) || 0)
        }
        
        return sum
      },
      0
    )
    
    // Add CIRCLYS (Circles) rewards separately since they're excluded from owned.
    // Reward source of truth is current value minus principal (matches Savings page).
    const circlysProfit = investments
      .filter((inv: any) => inv.account?.type === 'CIRCLYS')
      .reduce((sum, inv) => {
        const pos = getOwnerPosition(inv)
        const principal = pos
          ? (Number(pos.investedAmount) || 0)
          : (Number(inv.principalAmount) || 0)
        const value = pos
          ? (Number(pos.currentValue) || 0)
          : (Number(inv.currentValue) || 0)

        if (Number.isFinite(value) && Number.isFinite(principal) && value > 0 && principal > 0) {
          return sum + Math.max(0, value - principal)
        }

        if (pos) return sum + Math.max(0, Number(pos.profit) || 0)
        return sum + Math.max(0, Number(inv.realizedProfit) || 0) + Math.max(0, Number(inv.unrealizedProfit) || 0)
      }, 0)
    
    const now = new Date()
    sukukReceivable = ownerScoped
      .filter((inv) => inv.account.type === 'SUKUK')
      .reduce((sum, inv) => {
        const principal = getOwnerSukukPrincipal(inv)
        
        // Skip sold deals where owner no longer has ownership (principal = 0)
        if (principal <= 0) return sum
        
        const v = getSukukValueAt(inv, now)
        
        // Calculate total accrued profit
        const accruedProfit = Math.max(0, v - principal)
        
        // Subtract already withdrawn profit
        const txs = Array.isArray(inv.transactions) ? inv.transactions : []
        const receivedFromTx = txs
          .filter((tx: any) => tx?.type === 'WITHDRAW_PROFIT')
          .filter((tx: any) => {
            if (ownerPersonId && tx?.personId !== ownerPersonId && tx?.personId != null) return false
            const d = tx?.date instanceof Date ? tx.date : new Date(tx?.date)
            return !Number.isNaN(d.getTime()) && d.getTime() <= now.getTime()
          })
          .reduce((s: number, tx: any) => s + Math.max(0, Number(tx?.amount) || 0), 0)

        const totalReceivedRaw = Number(inv.totalReceived)
        const withdrawnProfit = Number.isFinite(totalReceivedRaw)
          ? Math.max(Math.max(0, totalReceivedRaw), receivedFromTx)
          : receivedFromTx
        
        // Receivable = accrued profit - withdrawn profit
        const receivable = Math.max(0, accruedProfit - withdrawnProfit)
        return sum + receivable
      }, 0)

    const sukukReceivedProfit = ownerScoped
      .filter((inv) => inv.account.type === 'SUKUK')
      .reduce((sum, inv) => {
        if (isSoldSukukForOwner(inv)) {
          const settlement = getOwnerSoldSettlement(inv)
          return sum + settlement.received
        }

        const txs = Array.isArray(inv.transactions) ? inv.transactions : []
        const received = txs
          .filter((tx: any) => tx?.type === 'WITHDRAW_PROFIT')
          .filter((tx: any) => {
            if (ownerPersonId && tx?.personId !== ownerPersonId && tx?.personId != null) return false
            const d = tx?.date instanceof Date ? tx.date : new Date(tx?.date)
            return !Number.isNaN(d.getTime()) && d.getTime() <= now.getTime()
          })
          .reduce((s: number, tx: any) => s + Math.max(0, Number(tx?.amount) || 0), 0)
        return sum + received
      }, 0)

    const commissionSourceSukuk = owned
      .filter((inv) => inv.account.type === 'SUKUK')

    const sukukCommissionFromTx = commissionSourceSukuk
      .filter((inv) => inv.account.type === 'SUKUK')
      .reduce((sum, inv) => {
        const txs = Array.isArray(inv.transactions) ? inv.transactions : []
        const commission = txs
          .filter((tx: any) => tx?.type === 'PARTNER_COMMISSION')
          .filter((tx: any) => {
            if (ownerPersonId && tx?.personId !== ownerPersonId && tx?.personId != null) return false
            const d = tx?.date instanceof Date ? tx.date : new Date(tx?.date)
            return !Number.isNaN(d.getTime()) && d.getTime() <= now.getTime()
          })
          .reduce((s: number, tx: any) => s + Math.max(0, Number(tx?.amount) || 0), 0)
        return sum + commission
      }, 0)

    const sukukCommissionFromSellMeta = commissionSourceSukuk
      .filter((inv) => inv.account.type === 'SUKUK')
      .reduce((sum, inv) => {
        const txs = Array.isArray(inv.transactions) ? inv.transactions : []
        const sells = txs
          .filter((tx: any) => tx?.type === 'SELL_TO_PARTNER' && (!ownerPersonId || tx.personId === ownerPersonId))
          .map((tx: any) => {
            const d = tx?.date instanceof Date ? tx.date : new Date(tx?.date)
            return { d: Number.isNaN(d.getTime()) ? null : d, meta: parseMetadata(tx?.metadata) }
          })
          .filter((x: any) => x.d)
          .sort((a: any, b: any) => (b.d as Date).getTime() - (a.d as Date).getTime())

        const latestSell = sells[0]
        if (!latestSell) return sum

        const commission = Number(latestSell.meta?.commissionAmount ?? latestSell.meta?.commission ?? 0)
        return sum + (Number.isFinite(commission) ? Math.max(0, commission) : 0)
      }, 0)

    const sukukCommissionEarned = round2(Math.max(sukukCommissionFromTx, sukukCommissionFromSellMeta))

    // Total Profit = receivable + received + commission (plus non-Sukuk/Circlys profit)
    totalProfit = nonSukukOwnedProfit + circlysProfit + sukukReceivable + sukukReceivedProfit + sukukCommissionEarned

    sukukValue = sukukInvested + sukukReceivable
    totalValue += sukukReceivable
    sipValue = ownerScoped
      .filter((inv) => inv.account.type === 'SIP')
      .reduce((sum, inv) => sum + inv.currentValue, 0)

    cryptoValue = ownerScoped
      .filter((inv) => inv.account.type === 'CRYPTO')
      .reduce((sum, inv) => sum + inv.currentValue, 0)

    // Calculate Circles ongoing: total contributed in active ongoing Circles
    circlysOngoingSaved = investments
      .filter((inv: any) => inv.account?.type === 'CIRCLYS')
      .reduce((sum, inv) => {
        try {
          const meta = inv.metadata ? JSON.parse(inv.metadata as string) : {}
          const monthlyContribution = Number(meta.monthlyContribution) || 0
          const totalMonths = Number(meta.totalMonths) || 0
          const totalRequired = monthlyContribution * totalMonths
          const totalPaid = Number(meta.totalPaid) || 0
          
          // Only count active ongoing Circles (not fully paid)
          if (totalRequired > totalPaid) {
            return sum + totalPaid
          }
          return sum
        } catch {
          return sum
        }
      }, 0)

    // Build per-type breakdown
    const typeMap = new Map<string, { invested: number; value: number; count: number }>()
    for (const inv of ownerScoped) {
      const t = inv.account.type
      const existing = typeMap.get(t) || { invested: 0, value: 0, count: 0 }
      const invested = t === 'SUKUK'
        ? getOwnerSukukPrincipal(inv)
        : (Number(inv.principalAmount) || 0)
      existing.invested += invested
      if (t === 'SUKUK') {
        const principal = getOwnerSukukPrincipal(inv)
        const v = getSukukValueAt(inv, new Date())
        existing.value += principal > 0 ? Math.max(0, Math.min(v, principal + Math.max(0, v - principal))) : 0
      } else {
        existing.value += inv.currentValue
      }
      existing.count += 1
      typeMap.set(t, existing)
    }
    typeBreakdowns = Array.from(typeMap.entries())
      .map(([type, data]) => ({ type, ...data }))
      .sort((a, b) => b.value - a.value)

    // Calculate ROSCA / Circlys remaining payback debt
    // For ROSCA plans: if totalPaid < (monthlyAmount * durationMonths), the remainder is debt
    const roscaInvestments = owned.filter(inv => inv.account.type === 'CIRCLYS')
    for (const inv of roscaInvestments) {
      try {
        const meta = inv.metadata ? JSON.parse(inv.metadata as string) : {}
        const monthlyContribution = Number(meta.monthlyContribution) || 0
        const totalMonths = Number(meta.totalMonths) || 0
        const totalPaid = Number(meta.totalPaid) || 0
        const totalRequired = monthlyContribution * totalMonths
        if (totalRequired > totalPaid) {
          roscaDebt += (totalRequired - totalPaid)
        }
      } catch {
        // skip invalid metadata
      }
    }
  } else if (user.role === 'PARTNER' && user.personId) {
    const participants = await prisma.dealParticipant.findMany({
      where: {
        personId: user.personId,
        investment: {
          name: { notIn: DEMO_INVESTMENT_NAMES },
        },
      },
      include: {
        investment: {
          include: {
            account: { select: { type: true } },
            transactions: {
              where: {
                type: { in: ['WITHDRAW_PROFIT', 'WITHDRAW_PRINCIPAL', 'BUY_FROM_PARTNER', 'SELL_PROFIT_ACCRUED', 'PARTNER_COMMISSION'] },
                OR: [{ personId: user.personId }, { personId: null }],
              },
              select: { type: true, date: true, amount: true, personId: true, metadata: true },
              orderBy: { date: 'asc' },
            },
          },
        },
      },
    })

    const now = new Date()

    totalInvested = participants.reduce((sum: number, p: any) => sum + (Number(p.investedAmount) || 0), 0)
    totalValue = participants.reduce((sum: number, p: any) => {
      const t = p.investment.account.type
      if (t === 'SUKUK') {
        const m = getPartnerSukukMetrics(p.investment, p, now)
        return sum + m.value
      }
      return sum + (Number(p.currentValue) || 0)
    }, 0)

    // For partners, totalProfit = accrued profit-to-date (not just stored p.profit)
    totalProfit = participants.reduce((sum: number, p: any) => {
      const t = p.investment.account.type
      if (t === 'SUKUK') {
        const m = getPartnerSukukMetrics(p.investment, p, now)
        return sum + m.profitAccrued
      }
      return sum + (Number(p.profit) || 0)
    }, 0)
    activeInvestments = participants.length

    const typeMap = new Map<string, { invested: number; value: number; count: number }>()
    for (const p of participants) {
      const t = p.investment.account.type
      const existing = typeMap.get(t) || { invested: 0, value: 0, count: 0 }
      const invested = Number(p.investedAmount) || 0
      existing.invested += invested
      if (t === 'SUKUK') {
        const m = getPartnerSukukMetrics(p.investment, p, now)
        existing.value += m.value
      } else {
        existing.value += Number(p.currentValue) || 0
      }
      existing.count += 1
      typeMap.set(t, existing)
    }
    typeBreakdowns = Array.from(typeMap.entries())
      .map(([type, data]) => ({ type, ...data }))
      .sort((a, b) => b.value - a.value)

    ownedInvestments = []
  }

  const yearlyValueChange = (() => {
    if (user.role !== 'OWNER') return { start: 0, end: 0, change: 0, pct: 0 }
    const startAt = yearStart
    const endAt = new Date(yearEnd.getTime() - 1)

    const base = Array.isArray(ownedInvestments) ? ownedInvestments : []
    const investmentsAtStart = base.filter((inv: any) => isActiveAt(inv, startAt))
    const investmentsAtEnd = base.filter((inv: any) => isActiveAt(inv, endAt))

    const valueAt = (inv: any, at: Date) => {
      const t = inv.account?.type
      if (t === 'SUKUK') {
        return getSukukValueAt(inv, at)
      }

      return getValueFromHistoryAt(inv, at)
    }

    const startValue = investmentsAtStart.reduce((s: number, inv: any) => s + valueAt(inv, startAt), 0)
    const endValue = investmentsAtEnd.reduce((s: number, inv: any) => s + valueAt(inv, endAt), 0)
    const startAssets = cashAtStart + startValue
    const endAssets = cashAtEnd + endValue
    const startNetWorth = startAssets - debtsAtStart
    const endNetWorth = endAssets - debtsAtEnd
    const change = endNetWorth - startNetWorth
    const pct = startNetWorth > 0 ? (change / startNetWorth) * 100 : 0

    if (dashboardDebug) {
      console.log('[DASHBOARD_DEBUG] investmentsValueAtStart', startValue)
      console.log('[DASHBOARD_DEBUG] investmentsValueAtEnd', endValue)
      console.log('[DASHBOARD_DEBUG] startAssets', startAssets)
      console.log('[DASHBOARD_DEBUG] endAssets', endAssets)
      console.log('[DASHBOARD_DEBUG] startNetWorth', startNetWorth)
      console.log('[DASHBOARD_DEBUG] endNetWorth', endNetWorth)
      console.log('[DASHBOARD_DEBUG] netWorthChange', change)
      console.log('[DASHBOARD_DEBUG] netWorthChangePct', pct)
    }
    return { start: startNetWorth, end: endNetWorth, change, pct }
  })()

  const displayedValue = cashBalance + totalValue
  const yearlyProfitValue = await (async () => {
    if (user.role === 'OWNER') {
      if (!cashAccount) return 0
      const txs = await prisma.transaction.findMany({
        where: {
          accountId: cashAccount.id,
          ...ownerTxScope,
          date: { gte: yearStart, lt: yearEnd },
          type: {
            in: ['WITHDRAW_PROFIT', 'SELL_PROFIT_ACCRUED', 'PARTNER_COMMISSION'],
          },
          OR: [
            { investment: { name: { notIn: DEMO_INVESTMENT_NAMES } } },
            { investmentId: null },
          ],
        } as any,
        select: { amount: true, type: true, personId: true, description: true, date: true },
        orderBy: { date: 'asc' },
      })

      const sum = txs.reduce((s: number, t: any) => {
        const n = Number(t?.amount)
        if (!Number.isFinite(n) || n <= 0) return s
        return s + n
      }, 0)

      if (dashboardDebug) {
        const byType = txs.reduce((m: Record<string, number>, t: any) => {
          const n = Number(t?.amount)
          if (!Number.isFinite(n) || n <= 0) return m
          const k = String(t?.type || 'UNKNOWN')
          m[k] = (m[k] || 0) + n
          return m
        }, {})

        console.log('[DASHBOARD_DEBUG] yearlyReturnTxCount', txs.length)
        console.log('[DASHBOARD_DEBUG] yearlyReturnByType', byType)
        console.log('[DASHBOARD_DEBUG] yearlyReturnSum', sum)
        console.log(
          '[DASHBOARD_DEBUG] yearlyReturnTxs',
          txs.map((t: any) => ({
            date: t?.date instanceof Date ? t.date.toISOString().slice(0, 10) : String(t?.date),
            type: t?.type,
            amount: t?.amount,
            personId: t?.personId,
            description: t?.description,
          }))
        )
      }

      return Math.max(0, sum)
    }

    if (user.role !== 'PARTNER' || !user.personId) return yearlyValueChange.change
    const txSum = await prisma.transaction.aggregate({
      where: {
        personId: user.personId,
        date: { gte: yearStart, lt: yearEnd },
        type: { in: ['WITHDRAW_PROFIT'] },
        OR: [
          { investment: { name: { notIn: DEMO_INVESTMENT_NAMES } } },
          { investmentId: null },
        ],
      },
      _sum: { amount: true },
    })
    return Math.max(0, Math.abs(Number(txSum._sum.amount || 0)))
  })()

  const yearlyReturnPercentage = user.role === 'PARTNER'
    ? (totalInvested > 0 ? (yearlyProfitValue / totalInvested) * 100 : 0)
    : (totalInvested > 0 ? (yearlyProfitValue / totalInvested) * 100 : 0)
  const netWorth = user.role === 'OWNER'
    ? displayedValue - roscaDebt - debtsAtEnd
    : displayedValue - roscaDebt

  const monthlyLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

  const monthlyCashflow = await (async () => {
    if (!cashAccount) {
      return monthlyLabels.map((l) => ({ label: l, value: 0 }))
    }

    if (user.role === 'PARTNER' && !user.personId) {
      return monthlyLabels.map((l) => ({ label: l, value: 0 }))
    }

    const scope = user.role === 'OWNER'
      ? ownerTxScope
      : ({ personId: user.personId } as any)

    const txs = await prisma.transaction.findMany({
      where: { accountId: cashAccount.id, date: { gte: yearStart, lt: yearEnd }, ...scope },
      select: { date: true, amount: true },
    })

    const byMonth = new Array(12).fill(0)
    for (const tx of txs) {
      const d = tx.date instanceof Date ? tx.date : new Date(tx.date)
      const m = d.getMonth()
      if (m >= 0 && m < 12) byMonth[m] += Number(tx.amount) || 0
    }

    return monthlyLabels.map((label, i) => ({ label, value: byMonth[i] }))
  })()

  const monthlyPortfolioValue = await (async () => {
    if (user.role !== 'OWNER') {
      return monthlyLabels.map((l) => ({ label: l, value: displayedValue }))
    }

    const points: { label: string; value: number }[] = []
    for (let m = 0; m < 12; m++) {
      const monthEndExclusive = new Date(selectedYear, m + 1, 1)
      const at = new Date(monthEndExclusive.getTime() - 1)

      const monthCash = await cashAt(monthEndExclusive)
      const monthInvestments = (ownedInvestments || []).filter((inv: any) => isActiveAt(inv, at))
      const monthValue = monthInvestments.reduce((s: number, inv: any) => {
        const t = inv.account?.type
        if (t === 'SUKUK') {
          return s + getSukukValueAt(inv, at)
        }

        return s + getValueFromHistoryAt(inv, at)
      }, 0)

      points.push({ label: monthlyLabels[m], value: monthCash + monthValue })
    }

    return points
  })()

  const liquiditySharePct = displayedValue > 0
    ? Math.min(100, Math.max(0, (cashBalance / displayedValue) * 100))
    : 0

  const avgMonthlyCashflow = monthlyCashflow.length > 0
    ? monthlyCashflow.reduce((sum, point) => sum + (Number(point.value) || 0), 0) / monthlyCashflow.length
    : 0

  const avgMonthlyOutflow = (() => {
    const negatives = monthlyCashflow
      .map((point) => Number(point.value) || 0)
      .filter((value) => value < 0)
      .map((value) => Math.abs(value))
    if (negatives.length === 0) return 0
    return negatives.reduce((sum, value) => sum + value, 0) / negatives.length
  })()

  const cashRunwayMonths = avgMonthlyOutflow > 0
    ? cashBalance / avgMonthlyOutflow
    : null

  const totalTypeValue = typeBreakdowns.reduce((sum, item) => sum + (Number(item.value) || 0), 0)

  const topTypeConcentrationPct = (() => {
    if (!Array.isArray(typeBreakdowns) || typeBreakdowns.length === 0) return 0
    if (totalTypeValue <= 0) return 0
    const top = Math.max(...typeBreakdowns.map((item) => Number(item.value) || 0), 0)
    return (top / totalTypeValue) * 100
  })()

  const activity = await (async () => {
    const take = 12
    if (user.role === 'OWNER') {
      const txs = await prisma.transaction.findMany({
        where: {
          ...ownerTxScope,
          date: { lt: yearEnd },
          OR: [
            { investment: { name: { notIn: DEMO_INVESTMENT_NAMES } } },
            { investmentId: null },
          ],
        },
        orderBy: { date: 'desc' },
        take,
        select: {
          id: true,
          date: true,
          type: true,
          amount: true,
          description: true,
          investment: { select: { name: true } },
          account: { select: { type: true } },
        },
      })

      return txs.map((t: any) => ({
        id: t.id,
        date: t.date.toISOString(),
        type: t.type,
        amount: Number(t.amount) || 0,
        description: t.description ?? null,
        investmentName: t.investment?.name ?? null,
        accountType: t.account?.type ?? null,
      }))
    }

    if (user.role === 'PARTNER' && user.personId) {
      const txs = await prisma.transaction.findMany({
        where: {
          personId: user.personId,
          date: { lt: yearEnd },
          OR: [
            { investment: { name: { notIn: DEMO_INVESTMENT_NAMES } } },
            { investmentId: null },
          ],
        },
        orderBy: { date: 'desc' },
        take,
        select: {
          id: true,
          date: true,
          type: true,
          amount: true,
          description: true,
          investment: { select: { name: true } },
          account: { select: { type: true } },
        },
      })

      return txs.map((t: any) => ({
        id: t.id,
        date: t.date.toISOString(),
        type: t.type,
        amount: Number(t.amount) || 0,
        description: t.description ?? null,
        investmentName: t.investment?.name ?? null,
        accountType: t.account?.type ?? null,
      }))
    }

    return [] as any[]
  })()

  const portfolioSparkline = monthlyPortfolioValue.map(m => m.value)
  const cashSparkline = monthlyCashflow.map(m => Math.abs(m.value))
  const profitTrend = totalInvested > 0 ? (totalProfit / totalInvested) * 100 : 0
  const portfolioTrend = user.role === 'OWNER' ? yearlyValueChange.pct : yearlyReturnPercentage

  return (
    <div className="space-y-6 animate-fade-in">
      <TradingChartOverlay />
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-800/80 to-slate-900/80 backdrop-blur-sm rounded-xl shadow-md p-6 text-white border border-slate-700/50">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Welcome back, {user.name}</h1>
            <p className="text-sm text-slate-400 mt-1">Portfolio overview for {selectedYear}</p>
          </div>
          <div className="flex items-center gap-3">
            <ReportButton selectedYear={selectedYear} />
            <YearFilter selectedYear={selectedYear} />
          </div>
        </div>
      </div>

      {/* Premium Stats Grid */}
      <PremiumStatsGrid
        portfolioValue={displayedValue}
        cashBalance={cashBalance}
        cashSettingDelta={cashSettingDelta}
        totalInvested={totalInvested}
        totalProfit={totalProfit}
        portfolioTrend={portfolioTrend}
        profitTrend={profitTrend}
        portfolioSparkline={portfolioSparkline}
        cashSparkline={cashSparkline}
        role={user.role as 'OWNER' | 'PARTNER'}
      />

      <div className={`grid gap-3 ${user.role === 'OWNER' ? 'grid-cols-2 lg:grid-cols-5' : 'grid-cols-2 lg:grid-cols-3'}`}>
        <AnimatedCard index={2}>
          <div className="p-5">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Liquidity Share</p>
            <div className="text-2xl font-bold text-cyan-400 mt-2 tabular-nums">{liquiditySharePct.toFixed(1)}%</div>
            <p className="text-xs text-slate-500 mt-1">Cash / Total Portfolio</p>
          </div>
        </AnimatedCard>

        <AnimatedCard index={3}>
          <div className="p-5">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Avg Monthly Cashflow</p>
            <div className={`text-2xl font-bold mt-2 tabular-nums ${avgMonthlyCashflow >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              SAR {round2(Math.abs(avgMonthlyCashflow)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-slate-500 mt-1">{avgMonthlyCashflow >= 0 ? 'Net inflow trend' : 'Net outflow trend'}</p>
          </div>
        </AnimatedCard>

        <AnimatedCard index={4}>
          <div className="p-5">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Cash Runway</p>
            <div className="text-2xl font-bold text-indigo-400 mt-2 tabular-nums">
              {cashRunwayMonths === null ? 'Stable' : `${round2(cashRunwayMonths).toFixed(1)}m`}
            </div>
            <p className="text-xs text-slate-500 mt-1">Based on average monthly outflow</p>
          </div>
        </AnimatedCard>

        {user.role === 'OWNER' && (
          <AnimatedCard index={5}>
            <div className="p-5">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Cash Sync Health</p>
              <div className={`text-2xl font-bold mt-2 tabular-nums ${Math.abs(cashSettingDelta) > 0.01 ? 'text-amber-400' : 'text-emerald-400'}`}>
                {Math.abs(cashSettingDelta) > 0.01
                  ? `${cashSettingDelta > 0 ? '+' : ''}${round2(cashSettingDelta).toFixed(2)}`
                  : 'Synced'}
              </div>
              <p className="text-xs text-slate-500 mt-1">Setting vs bucket balance drift</p>
            </div>
          </AnimatedCard>
        )}

        {user.role === 'OWNER' && (
          <AnimatedCard index={6}>
            <div className="p-5">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Top Allocation Concentration</p>
              <div className={`text-2xl font-bold mt-2 tabular-nums ${topTypeConcentrationPct > 60 ? 'text-amber-400' : 'text-emerald-400'}`}>
                {topTypeConcentrationPct.toFixed(1)}%
              </div>
              <p className="text-xs text-slate-500 mt-1">Largest asset class share</p>
            </div>
          </AnimatedCard>
        )}
      </div>


      {user.role === 'PARTNER' && user.personId && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 items-start auto-rows-min">
          <AnimatedCard index={0}>
            <div className="p-6">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Profit (Accrued)</p>
              <div className="text-2xl font-bold text-emerald-400 mt-2 tabular-nums">
                SAR {round2(totalProfit).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <p className="text-xs text-slate-500 mt-1">Across your deals</p>
            </div>
          </AnimatedCard>
          <AnimatedCard index={1}>
            <div className="p-6">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Receivable</p>
              <div className="text-2xl font-bold text-sky-400 mt-2 tabular-nums">
                SAR {round2(Math.max(0, totalValue - totalInvested)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <p className="text-xs text-slate-500 mt-1">Accrued - received</p>
            </div>
          </AnimatedCard>
          <AnimatedCard index={2}>
            <div className="p-6">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Received (This Year)</p>
              <div className="text-2xl font-bold text-purple-400 mt-2 tabular-nums">
                SAR {round2(yearlyProfitValue).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <p className="text-xs text-slate-500 mt-1">Withdrawals / realized</p>
            </div>
          </AnimatedCard>
          <AnimatedCard index={3}>
            <div className="p-6">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Yearly Return %</p>
              <div className={`text-2xl font-bold mt-2 tabular-nums ${yearlyReturnPercentage >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {yearlyReturnPercentage >= 0 ? '+' : ''}{Math.abs(yearlyReturnPercentage).toFixed(2)}%
              </div>
              <p className="text-xs text-slate-500 mt-1">Based on invested</p>
            </div>
          </AnimatedCard>
        </div>
      )}

      {/* Second Row: Deals + Debt + Net Worth */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 items-start auto-rows-min">
        <AnimatedCard index={4}>
          <div className="p-6">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Active Deals</p>
            <div className="text-2xl font-bold text-amber-400 mt-2">{activeInvestments}</div>
            <p className="text-xs text-slate-500 mt-1">Across all types</p>
          </div>
        </AnimatedCard>

        {user.role === 'OWNER' && roscaDebt > 0 && (
          <AnimatedCard index={5}>
            <div className="p-6">
              <p className="text-xs font-medium text-red-400 uppercase tracking-wider">ROSCA Remaining</p>
              <div className="text-2xl font-bold text-red-500 mt-2 tabular-nums">
                SAR {roscaDebt.toLocaleString()}
              </div>
              <p className="text-xs text-red-400 mt-1">Unpaid commitments</p>
            </div>
          </AnimatedCard>
        )}

        <AnimatedCard index={6}>
          <div className="p-6">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Net Worth</p>
            <div className={`text-2xl font-bold mt-2 tabular-nums ${netWorth >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              SAR {netWorth.toLocaleString()}
            </div>
            <p className="text-xs text-slate-500 mt-1">Portfolio − Debt</p>
          </div>
        </AnimatedCard>
      </div>

      {/* Third Row: Key Totals */}
      {user.role === 'OWNER' && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 items-start auto-rows-min">
          <AnimatedCard index={7}>
            <div className="p-6">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Sukuk Total</p>
              <div className="text-2xl font-bold text-indigo-400 mt-2 tabular-nums">
                SAR {sukukInvested.toLocaleString()}
              </div>
              <p className="text-xs text-slate-500 mt-1">Invested SAR {sukukInvested.toLocaleString()}</p>
            </div>
          </AnimatedCard>

          <AnimatedCard index={8}>
            <div className="p-6">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Circlys Ongoing</p>
              <div className="text-2xl font-bold text-pink-400 mt-2 tabular-nums">
                SAR {circlysOngoingSaved.toLocaleString()}
              </div>
              <p className="text-xs text-slate-500 mt-1">Saved (not received)</p>
            </div>
          </AnimatedCard>

          <AnimatedCard index={9}>
            <div className="p-6">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">SIP Total</p>
              <div className="text-2xl font-bold text-teal-400 mt-2 tabular-nums">
                SAR {sipValue.toLocaleString()}
              </div>
              <p className="text-xs text-slate-500 mt-1">Current value</p>
            </div>
          </AnimatedCard>

          <AnimatedCard index={10}>
            <div className="p-6">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Crypto Total</p>
              <div className="text-2xl font-bold text-orange-400 mt-2 tabular-nums">
                SAR {cryptoValue.toLocaleString()}
              </div>
              <p className="text-xs text-slate-500 mt-1">Current value</p>
            </div>
          </AnimatedCard>
        </div>
      )}

      {/* Per-Type Breakdown */}
      {user.role === 'OWNER' && (
        <DashboardCharts
          selectedYear={selectedYear}
          monthlyCashflow={monthlyCashflow}
          monthlyPortfolioValue={monthlyPortfolioValue}
          typeBreakdowns={typeBreakdowns}
        />
      )}

      {activity.length > 0 && (
        <Card className="border border-slate-700/40 bg-slate-900/40">
          <CardHeader>
            <CardTitle className="text-sm font-bold text-slate-200">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {activity.slice(0, 8).map((entry: any) => {
                const amount = Number(entry?.amount || 0)
                const isIn = amount >= 0
                const d = new Date(entry?.date)
                const dateLabel = Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-CA')
                return (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between rounded-lg border border-slate-700/40 bg-slate-800/30 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] rounded-full bg-slate-700/70 px-2 py-0.5 text-slate-300 uppercase tracking-wider">
                          {String(entry.type || 'TX').replace(/_/g, ' ')}
                        </span>
                        <span className="text-[11px] text-slate-400">{dateLabel}</span>
                      </div>
                      <p className="mt-1 truncate text-xs text-slate-300">
                        {entry.investmentName || entry.description || 'Cash transaction'}
                      </p>
                    </div>
                    <div className={`ml-3 shrink-0 text-sm font-semibold tabular-nums ${isIn ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {isIn ? '+' : '-'}SAR {Math.abs(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Per-Type Breakdown */}
      {typeBreakdowns.length > 0 && (
        <Card className="border border-slate-700/40 bg-slate-900/40">
          <CardHeader>
            <CardTitle className="text-sm font-bold text-slate-200">Balance by Investment Type</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {typeBreakdowns.map((tb) => {
                const returnPct = tb.invested > 0 ? ((tb.value - tb.invested) / tb.invested * 100) : 0
                const sharePct = totalTypeValue > 0 ? (tb.value / totalTypeValue) * 100 : 0
                return (
                  <div key={tb.type} className="rounded-lg border border-slate-700/40 bg-slate-800/30 p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold text-slate-100">{tb.type}</span>
                        <span className="text-[11px] text-slate-400">{tb.count} deal{tb.count !== 1 ? 's' : ''}</span>
                      </div>
                      <div className="text-[11px] text-slate-400 tabular-nums">{sharePct.toFixed(1)}% share</div>
                    </div>

                    <div className="mt-2 h-1.5 w-full rounded-full bg-slate-700/60">
                      <div
                        className="h-1.5 rounded-full bg-gradient-to-r from-cyan-400 to-sky-500 transition-all duration-700"
                        style={{ width: `${Math.max(2, Math.min(100, sharePct))}%` }}
                      />
                    </div>

                    <div className="mt-3 flex items-center gap-6">
                      <div className="text-right">
                        <div className="text-xs text-slate-400">Invested</div>
                        <div className="text-sm font-medium text-slate-200 tabular-nums">SAR {tb.invested.toLocaleString()}</div>
                      </div>
                      <div className="text-right min-w-[60px]">
                        <div className="text-xs text-slate-400">Value</div>
                        <div className="text-sm font-bold text-slate-100 tabular-nums">SAR {tb.value.toLocaleString()}</div>
                      </div>
                      <div className="text-right min-w-[60px]">
                        <div className="text-xs text-slate-400">Return</div>
                        <div className={`text-sm font-semibold tabular-nums ${returnPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {returnPct >= 0 ? '+' : ''}{returnPct.toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
