import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { prisma } from '@/lib/db'
import { DEMO_INVESTMENT_NAMES } from '@/lib/demo'
import { YearFilter } from '@/components/dashboard/YearFilter'
import { ReportButton } from '@/components/dashboard/ReportButton'
import { DashboardCharts } from '@/components/dashboard/DashboardCharts'
import { PremiumStatsGrid } from '@/components/dashboard/PremiumStatsGrid'
import { ReceivableByYearCard } from '@/components/dashboard/ReceivableByYearCard'
import { AnimatedCard } from '@/components/ui/AnimatedCard'
import { TradingChartOverlay } from '@/components/dashboard/TradingChartOverlay'
import { CASH_BALANCE_KEY, getBucketCashBalance } from '@/lib/cashBalance'
import { formatDisplayDate } from '@/lib/date'
import {
  DISPLAY_CURRENCY_KEY,
  convertCurrencyAmount,
  formatCurrencyAmount,
  getCurrencyPrefix,
  normalizeDisplayCurrency,
} from '@/lib/currency'
import { PageTransition } from '@/components/animations/PageTransition'
import { AnimatedList, AnimatedListItem } from '@/components/animations/AnimatedList'
import { AnimatedStatCard } from '@/components/animations/AnimatedCard'
import { DashboardStatsClient } from '@/components/dashboard/DashboardStatsClient'
import { LiveMarketTicker } from '@/components/dashboard/LiveMarketTicker'

export const dynamic = 'force-dynamic'

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: { year?: string }
}) {
  const user = await getCurrentUser()
  
  if (!user) {
    redirect('/login')
  }

  const yearParam = searchParams?.year
  const currentYear = new Date().getFullYear()
  const isAllYears = !yearParam || yearParam === 'all'
  const parsedYear = yearParam && yearParam !== 'all' ? Number(yearParam) : NaN
  const selectedYear = Number.isFinite(parsedYear) ? parsedYear : currentYear
  const yearStart = isAllYears ? new Date(2020, 0, 1) : new Date(selectedYear, 0, 1)
  const yearEnd = isAllYears ? new Date(currentYear + 1, 0, 1) : new Date(selectedYear + 1, 0, 1)
  const isCurrentYear = selectedYear === currentYear
  const displayYear = isAllYears ? 'all' : selectedYear

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
  const displayCurrencySetting = await prisma.systemSetting.findUnique({
    where: { key: DISPLAY_CURRENCY_KEY },
  })
  const displayCurrency = normalizeDisplayCurrency(displayCurrencySetting?.value)
  const currencyPrefix = getCurrencyPrefix(displayCurrency)
  const toDisplayAmount = (value: number) => convertCurrencyAmount(value, 'SAR', displayCurrency)
  const money = (value: number) => formatCurrencyAmount(value, displayCurrency, 'SAR')

  const ownerTxScope = user.personId
    ? ({ OR: [{ personId: null }, { personId: user.personId }] } as any)
    : ({ personId: null } as any)

  // For historical years, calculate cash balance at end of year; for current year, use live balance
  const cashBalanceDate = isCurrentYear || isAllYears ? new Date() : yearEnd
  
  const ownerBucketCash = user.role === 'OWNER'
    ? await getBucketCashBalance(prisma, null)
    : 0

  const allCashTxSum =
    user.role === 'OWNER' && cashAccount
      ? (
          await prisma.transaction.aggregate({
            where: { 
              accountId: cashAccount.id, 
              ...ownerTxScope,
              date: { lt: cashBalanceDate }
            },
            _sum: { amount: true },
          })
        )?._sum?.amount || 0
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
  let receivableByYear: Array<{ year: number; amount: number }> = []

  // Per-type breakdown
  type TypeBreakdown = { type: string; invested: number; value: number; count: number }
  let typeBreakdowns: TypeBreakdown[] = []

  // ROSCA / Circlys debt tracking
  let roscaDebt = 0
  let roscaPlans: Array<{ name: string; remaining: number; paid: number; total: number }> = []
  let ongoingPlans: Array<{ name: string; saved: number; toReceive: number; isCompleted: boolean }> = []

  let sukukInvested = 0
  let sukukValue = 0
  let sukukReceivable = 0
  let sipValue = 0
  let circlysOngoingSaved = 0
  let cryptoValue = 0
  let malaaValue = 0
  
  // Profit breakdown components
  let malaaProfit = 0
  let cryptoProfit = 0
  let sipProfit = 0
  let otherProfit = 0
  let circlysProfit = 0
  let sukukReceivedProfit = 0
  let sukukCommissionEarned = 0

  // Owner Sukuk principal lookup for portfolio chart (populated inside owner block)
  const ownerSukukPrincipalById = new Map<string, number>()

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

  const toFiniteNumber = (value: unknown, fallback = 0) => {
    const n = Number(value)
    return Number.isFinite(n) ? n : fallback
  }

  const getAccountType = (entity: any) => {
    const t = entity?.account?.type
    return typeof t === 'string' && t.length > 0 ? t : null
  }

  const parseMetadata = (value: unknown) => {
    if (!value) return {}
    if (typeof value === 'object') return value as any
    if (typeof value !== 'string') return {}
    try {
      return JSON.parse(value)
    } catch {
      return {}
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

  const getSukukValueAt = (inv: any, at: Date, ownerPrincipalOverride?: number) => {
    const principal = ownerPrincipalOverride !== undefined
      ? (Number.isFinite(ownerPrincipalOverride) ? Math.max(0, ownerPrincipalOverride) : 0)
      : (Number.isFinite(inv.principalAmount) ? Number(inv.principalAmount) : 0)
    if (principal <= 0) return 0

    const start = toDate(inv.startDate)
    const maturity = toDate(inv.maturityDate)
    const startTime = start?.getTime() || 0
    const maturityTime = maturity?.getTime() || 0

    const fullPrincipal = Math.max(0, toFiniteNumber(inv.principalAmount))
    const ownershipRatio = fullPrincipal > 0 ? Math.min(1, Math.max(0, principal / fullPrincipal)) : (ownerPrincipalOverride !== undefined ? 0 : 1)
    const totalProfit = getSukukNetProfit(inv) * ownershipRatio

    const totalMs = maturityTime > startTime ? maturityTime - startTime : 0
    const atMs = at.getTime()
    const elapsedMs = totalMs > 0
      ? Math.min(Math.max(atMs - startTime, 0), totalMs)
      : (atMs > startTime ? 1 : 0)

    const accruedProfit = totalMs > 0
      ? totalProfit * (elapsedMs / totalMs)
      : (atMs > startTime ? totalProfit : 0)

    const txs = Array.isArray(inv.transactions) ? inv.transactions : []
    const ownerPid = user.role === 'OWNER' ? (user.personId || null) : null
    const upTo = (type: string) =>
      txs
        .filter((tx: any) => {
          if (tx?.type !== type) return false
          if (ownerPid && tx?.personId !== ownerPid && tx?.personId != null) return false
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
    const metadata = parseMetadata(inv.metadata)

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
        totalReceived: true,
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

    const getOwnerPrincipalShare = (inv: any) => {
      const accountType = getAccountType(inv)
      if (!accountType) return 0
      if (accountType === 'SUKUK') return getOwnerSukukPrincipal(inv)

      const ownerPosition = getOwnerPosition(inv)
      if (ownerPosition) {
        return Math.max(0, toFiniteNumber(ownerPosition.investedAmount))
      }

      const participants = Array.isArray(inv?.dealParticipants) ? inv.dealParticipants : []
      if (participants.length > 0) return 0

      return Math.max(0, toFiniteNumber(inv?.principalAmount))
    }

    const getOwnerSukukMetrics = (inv: any, asOf: Date) => {
      const principal = getOwnerSukukPrincipal(inv)
      if (principal <= 0) {
        return {
          principal: 0,
          principalOutstanding: 0,
          receivable: 0,
          received: 0,
          value: 0,
          accruedProfit: 0,
        }
      }

      const totalPrincipal = Math.max(0, toFiniteNumber(inv?.principalAmount))
      const ownershipRatio = totalPrincipal > 0 ? Math.min(1, Math.max(0, principal / totalPrincipal)) : 0

      const totalProfitFull = getSukukNetProfit(inv)
      const totalProfit = Math.max(0, totalProfitFull * ownershipRatio)

      const start = toDate(inv?.startDate)
      const maturity = toDate(inv?.maturityDate)
      const startTime = start?.getTime() || 0
      const maturityTime = maturity?.getTime() || 0
      const totalMs = maturityTime > startTime ? maturityTime - startTime : 0
      const atMs = asOf.getTime()
      const elapsedMs = totalMs > 0
        ? Math.min(Math.max(atMs - startTime, 0), totalMs)
        : (atMs > startTime ? 1 : 0)
      const accruedProfit = totalMs > 0
        ? totalProfit * (elapsedMs / totalMs)
        : (atMs > startTime ? totalProfit : 0)

      // NOTE: inv.principalAmount and ownerPosition.investedAmount are already reduced by the API
      // when WITHDRAW_PRINCIPAL happens (see app/api/sukuk/[id]/withdraw/route.ts line 205-207)
      // So we just use the principal value directly without subtracting withdrawals again
      const principalOutstanding = Math.max(0, principal)
      
      const txs = Array.isArray(inv?.transactions) ? inv.transactions : []

      const receivedFromProfitTx = txs
        .filter((tx: any) => tx?.type === 'WITHDRAW_PROFIT')
        .filter((tx: any) => {
          if (ownerPersonId && tx?.personId !== ownerPersonId && tx?.personId != null) return false
          const d = tx?.date instanceof Date ? tx.date : new Date(tx?.date)
          return !Number.isNaN(d.getTime()) && d.getTime() <= atMs
        })
        .reduce((sum: number, tx: any) => sum + Math.max(0, Math.abs(toFiniteNumber(tx?.amount))), 0)

      const receivedFromLegacyPrincipalTx = txs
        .filter((tx: any) => tx?.type === 'WITHDRAW_PRINCIPAL')
        .filter((tx: any) => {
          if (ownerPersonId && tx?.personId !== ownerPersonId && tx?.personId != null) return false
          const d = tx?.date instanceof Date ? tx.date : new Date(tx?.date)
          return !Number.isNaN(d.getTime()) && d.getTime() <= atMs
        })
        .reduce((sum: number, tx: any) => {
          const meta = parseMetadata(tx?.metadata)
          if (meta?.source !== 'PROFIT') return sum
          return sum + Math.max(0, Math.abs(toFiniteNumber(tx?.amount)))
        }, 0)

      const totalReceivedShare = Math.max(0, toFiniteNumber(inv?.totalReceived) * ownershipRatio)
      const received = Math.max(receivedFromProfitTx, totalReceivedShare) + receivedFromLegacyPrincipalTx
      const receivable = Math.max(0, accruedProfit - received)
      const value = principalOutstanding + receivable

      return {
        principal,
        principalOutstanding,
        receivable,
        received,
        value,
        accruedProfit,
      }
    }

    const isActiveSukukDeal = (inv: any, asOf: Date, metrics: ReturnType<typeof getOwnerSukukMetrics>) => {
      // Match sukuk page logic: include if principal OR receivable > 0.01
      const principalOutstanding = metrics.principalOutstanding
      const receivable = metrics.receivable
      return principalOutstanding > 0.01 || receivable > 0.01
    }

    const hasOwnerSellTx = (inv: any) => {
      if (!ownerPersonId) return false
      const txs = Array.isArray(inv.transactions) ? inv.transactions : []
      return txs.some((tx: any) => tx?.type === 'SELL_TO_PARTNER' && tx.personId === ownerPersonId)
    }

    const hasOwnerReceivedProfit = (inv: any) => {
      const txs = Array.isArray(inv.transactions) ? inv.transactions : []
      // Check for any profit receipt transactions (WITHDRAW_PROFIT or totalReceived > 0)
      const hasWithdrawProfit = txs.some((tx: any) => {
        if (tx?.type !== 'WITHDRAW_PROFIT') return false
        if (ownerPersonId && tx?.personId !== ownerPersonId && tx?.personId != null) return false
        return Math.abs(Number(tx?.amount) || 0) > 0
      })
      if (hasWithdrawProfit) return true
      // Also check if investment has totalReceived > 0 (matured deals)
      const totalReceived = Number(inv.totalReceived)
      return Number.isFinite(totalReceived) && totalReceived > 0
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
          // Legacy guard: older records may not always carry SOLD_DEAL_RECEIPT source.
          // For sold deals, treat missing source (or PROFIT source) as received settlement profit.
          const source = typeof meta?.source === 'string' ? meta.source : ''
          if (source && source !== 'SOLD_DEAL_RECEIPT' && source !== 'PROFIT') return sum
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
      const accountType = getAccountType(inv)
      if (!accountType) return false
      if (accountType === 'CASH') return false
      if (accountType === 'CIRCLYS') return false
      return true
    })

    const ownerScoped = owned.filter((inv: any) => {
      const accountType = getAccountType(inv)
      if (!accountType) return false
      if (accountType !== 'SUKUK') return true
      return getOwnerSukukPrincipal(inv) > 0 || hasOwnerSellTx(inv) || hasOwnerReceivedProfit(inv)
    })

    ownedInvestments = ownerScoped

    const now = new Date()
    const ownerSukuk = ownerScoped.filter((inv: any) => getAccountType(inv) === 'SUKUK')
    const ownerSukukMetricsById = new Map<string, ReturnType<typeof getOwnerSukukMetrics>>()
    for (const inv of ownerSukuk) {
      const metrics = getOwnerSukukMetrics(inv, now)
      ownerSukukMetricsById.set(inv.id, metrics)
      ownerSukukPrincipalById.set(inv.id, metrics.principal)
    }

    const activeSukuk = ownerSukuk.filter((inv: any) => {
      const metrics = ownerSukukMetricsById.get(inv.id)
      if (!metrics) return false
      return isActiveSukukDeal(inv, now, metrics)
    })

    const activeNonSukuk = ownerScoped.filter((inv: any) => {
      const accountType = getAccountType(inv)
      if (!accountType || accountType === 'SUKUK') return false

      const maturity = toDate(inv?.maturityDate)
      if (maturity && maturity.getTime() < now.getTime()) return false

      const ownerPrincipal = getOwnerPrincipalShare(inv)
      const currentValue = Math.max(0, toFiniteNumber(inv?.currentValue))
      return ownerPrincipal > 0 || currentValue > 0
    })

    activeInvestments = activeSukuk.length + activeNonSukuk.length
    sukukInvested = activeSukuk.reduce((sum, inv) => {
      const metrics = ownerSukukMetricsById.get(inv.id)
      return sum + (metrics ? metrics.principalOutstanding : 0)
    }, 0)

    const nonSukukValue = ownerScoped.reduce((sum, inv) => {
      const accountType = getAccountType(inv)
      if (!accountType || accountType === 'SUKUK') return sum

      const currentValue = Math.max(0, toFiniteNumber(inv?.currentValue))
      const ownerPrincipal = getOwnerPrincipalShare(inv)
      const totalPrincipal = Math.max(0, toFiniteNumber(inv?.principalAmount))

      if (ownerPrincipal > 0 && totalPrincipal > 0 && ownerPrincipal < totalPrincipal) {
        return sum + currentValue * (ownerPrincipal / totalPrincipal)
      }

      if (ownerPrincipal <= 0 && Array.isArray(inv?.dealParticipants) && inv.dealParticipants.length > 0) {
        return sum
      }

      return sum + currentValue
    }, 0)

    const sukukPrincipalValue = ownerSukuk.reduce((sum, inv) => {
      const metrics = ownerSukukMetricsById.get(inv.id)
      return sum + (metrics ? metrics.principalOutstanding : 0)
    }, 0)
    totalValue = nonSukukValue + sukukPrincipalValue

    // Calculate Malaa value first (SIP is consolidated into Malaa)
    malaaValue = ownerScoped
      .filter((inv) => getAccountType(inv) === 'MALAA' || getAccountType(inv) === 'SIP')
      .reduce((sum, inv) => sum + Math.max(0, toFiniteNumber(inv.currentValue)), 0)

    // Break down profit by investment type for detailed tracking
    // Note: SIP is consolidated into Malaa per user clarification
    // Malaa profit = current value - total invested
    const malaaInvested = ownerScoped.reduce((sum, inv) => {
      const accountType = getAccountType(inv)
      if (accountType !== 'MALAA' && accountType !== 'SIP') return sum
      const pos = getOwnerPosition(inv)
      if (pos) return sum + toFiniteNumber(pos.investedAmount)
      return sum + toFiniteNumber(inv.principalAmount)
    }, 0)
    
    malaaProfit = round2(Math.max(0, malaaValue - malaaInvested))

    cryptoProfit = ownerScoped.reduce((sum, inv) => {
      const accountType = getAccountType(inv)
      if (accountType !== 'CRYPTO') return sum
      const pos = getOwnerPosition(inv)
      if (pos) return sum + toFiniteNumber(pos.profit)
      return sum + toFiniteNumber(inv.realizedProfit) + toFiniteNumber(inv.unrealizedProfit)
    }, 0)

    sipProfit = 0 // Consolidated into Malaa

    otherProfit = ownerScoped.reduce((sum, inv) => {
      const accountType = getAccountType(inv)
      if (!accountType || accountType === 'SUKUK' || accountType === 'MALAA' || accountType === 'SIP' || accountType === 'CRYPTO') return sum
      const pos = getOwnerPosition(inv)
      if (pos) return sum + toFiniteNumber(pos.profit)
      return sum + toFiniteNumber(inv.realizedProfit) + toFiniteNumber(inv.unrealizedProfit)
    }, 0)

    const nonSukukOwnedProfit = malaaProfit + cryptoProfit + sipProfit + otherProfit

    // Add CIRCLYS rewards separately (excluded from ownerScoped).
    circlysProfit = investments
      .filter((inv: any) => getAccountType(inv) === 'CIRCLYS')
      .reduce((sum, inv) => {
        const pos = getOwnerPosition(inv)
        const principal = pos
          ? toFiniteNumber(pos.investedAmount)
          : toFiniteNumber(inv.principalAmount)
        const value = pos
          ? toFiniteNumber(pos.currentValue)
          : toFiniteNumber(inv.currentValue)

        if (value > 0 && principal > 0) {
          return sum + Math.max(0, value - principal)
        }

        if (pos) return sum + Math.max(0, toFiniteNumber(pos.profit))
        return sum + Math.max(0, toFiniteNumber(inv.realizedProfit)) + Math.max(0, toFiniteNumber(inv.unrealizedProfit))
      }, 0)

    // Helper: Get net profit for Sukuk (matches Sukuk page getNetProfit)
    const getSukukNetProfitForDashboard = (inv: any) => {
      const principal = inv.myParticipation?.investedAmount ?? inv.principalAmount
      const investment = Number.isFinite(principal) ? principal : 0
      const apr = Number.isFinite(inv.interestRate) ? inv.interestRate : 0
      const fees = Number.isFinite(inv.fees) ? inv.fees : 0
      const participationRatio = inv.principalAmount > 0 && investment > 0
        ? Math.min(1, investment / inv.principalAmount)
        : 0
      const startBasis = inv.myParticipation?.acquiredAt ?? inv.startDate
      const totalMonthsFull = getPeriodMonths(inv.startDate, inv.maturityDate)
      const periodMonths = getPeriodMonths(startBasis, inv.maturityDate)
      const periodYears = periodMonths ? periodMonths / 12 : 0
      const grossProfit = investment > 0 && apr > 0 && periodYears > 0
        ? investment * (apr / 100) * periodYears
        : 0

      const manualReceivableFull = Number.isFinite(inv.receivableAmount) ? inv.receivableAmount : null
      const manualReceivable = manualReceivableFull !== null && manualReceivableFull > 0
        ? (inv.myParticipation
            ? (manualReceivableFull * participationRatio) * (totalMonthsFull > 0 ? Math.min(1, Math.max(0, periodMonths / totalMonthsFull)) : 1)
            : manualReceivableFull)
        : null
      if (manualReceivable !== null) {
        return round2(Math.max(0, manualReceivable))
      }
      const timeRatio = inv.myParticipation && totalMonthsFull > 0
        ? Math.min(1, Math.max(0, periodMonths / totalMonthsFull))
        : 1
      const proratedFees = inv.myParticipation
        ? (fees * participationRatio) * timeRatio
        : fees
      return round2(Math.max(0, grossProfit - proratedFees))
    }

    // Helper: Get received profit for Sukuk (matches Sukuk page getViewerReceived)
    const getSukukReceivedForDashboard = (inv: any) => {
      const totalReceivedRaw = Number(inv.totalReceived)
      if (Number.isFinite(totalReceivedRaw)) return totalReceivedRaw
      
      const txs = Array.isArray(inv.transactions) ? inv.transactions : []
      return txs
        .filter((tx: any) => tx?.type === 'WITHDRAW_PROFIT')
        .filter((tx: any) => {
          if (!ownerPersonId) return tx?.personId == null
          return tx?.personId == null || tx?.personId === ownerPersonId
        })
        .reduce((s: number, tx: any) => {
          const amount = Number(tx?.amount)
          return s + (Number.isFinite(amount) ? amount : 0)
        }, 0)
    }

    // RECEIVABLE & RECEIVED: Match Sukuk page logic exactly
    const activeNetProfit = ownerSukuk
      .filter((inv: any) => !isSoldSukukForOwner(inv))
      .reduce((sum, inv) => sum + getSukukNetProfitForDashboard(inv), 0)
    
    const activeReceivedFromInv = ownerSukuk
      .filter((inv: any) => !isSoldSukukForOwner(inv))
      .reduce((sum, inv) => sum + getSukukReceivedForDashboard(inv), 0)
    
    const soldReceived = ownerSukuk.reduce((sum, inv) => {
      const settlement = getOwnerSoldSettlement(inv)
      return sum + Math.max(0, settlement.received)
    }, 0)
    
    sukukReceivedProfit = round2(activeReceivedFromInv + soldReceived)
    sukukReceivable = round2(Math.max(0, activeNetProfit - activeReceivedFromInv))

    const commissionSourceSukuk = owned
      .filter((inv) => getAccountType(inv) === 'SUKUK')

    // COMMISSION: Match Sukuk page logic exactly
    sukukCommissionEarned = commissionSourceSukuk.reduce((sum, inv) => {
      const txs = Array.isArray(inv.transactions) ? inv.transactions : []
      
      // Sell commission from transactions
      const txSellCommission = txs
        .filter((tx: any) => tx?.type === 'PARTNER_COMMISSION' && (!ownerPersonId || tx.personId === ownerPersonId))
        .filter((tx: any) => {
          const meta = parseMetadata(tx?.metadata)
          return meta?.source !== 'PARTNER_CREATE_COMMISSION_PAYOUT'
        })
        .reduce((acc: number, tx: any) => {
          const amount = Number(tx?.amount)
          return acc + (Number.isFinite(amount) ? amount : 0)
        }, 0)

      // Create commission from transactions
      const txCreateCommission = txs
        .filter((tx: any) => tx?.type === 'PARTNER_COMMISSION' && (!ownerPersonId || tx.personId === ownerPersonId))
        .filter((tx: any) => {
          const meta = parseMetadata(tx?.metadata)
          return meta?.source === 'PARTNER_CREATE_COMMISSION_PAYOUT'
        })
        .reduce((acc: number, tx: any) => {
          const amount = Number(tx?.amount)
          return acc + (Number.isFinite(amount) ? amount : 0)
        }, 0)

      // Commission from sell metadata
      const sells = txs
        .filter((tx: any) => tx?.type === 'SELL_TO_PARTNER' && (!ownerPersonId || tx.personId === ownerPersonId))
        .map((tx: any) => {
          const d = tx?.date instanceof Date ? tx.date : new Date(tx?.date)
          return { d: Number.isNaN(d.getTime()) ? null : d, meta: parseMetadata(tx?.metadata) }
        })
        .filter((x: any) => x.d)
        .sort((a: any, b: any) => (b.d as Date).getTime() - (a.d as Date).getTime())
      
      const metaSellCommission = sells.length > 0
        ? Math.max(0, Number(sells[0].meta?.commissionAmount ?? 0))
        : 0

      // Create commission from metadata
      const invMeta = parseMetadata(inv?.metadata)
      const metaCreateCommission = Math.max(0, Number(invMeta?.partnerCommissionPlan?.amount ?? 0))

      const sellEffective = Math.max(Math.max(0, txSellCommission), Math.max(0, metaSellCommission))
      const createEffective = Math.max(Math.max(0, txCreateCommission), Math.max(0, metaCreateCommission))

      return sum + sellEffective + createEffective
    }, 0)
    sukukCommissionEarned = round2(sukukCommissionEarned)

    // Total Profit = all components combined
    totalProfit = malaaProfit + cryptoProfit + sipProfit + otherProfit + circlysProfit + sukukReceivable + sukukReceivedProfit + sukukCommissionEarned

    // Sukuk Total: Match Sukuk page - all active deals value (principal outstanding + receivable)
    sukukValue = ownerSukuk
      .filter((inv: any) => !isSoldSukukForOwner(inv))
      .reduce((sum, inv) => {
        const metrics = ownerSukukMetricsById.get(inv.id)
        return sum + (metrics ? metrics.value : 0)
      }, 0)
    totalValue += sukukReceivable
    
    sipValue = 0 // Consolidated into Malaa (value already calculated earlier)

    cryptoValue = ownerScoped
      .filter((inv) => getAccountType(inv) === 'CRYPTO')
      .reduce((sum, inv) => sum + Math.max(0, toFiniteNumber(inv.currentValue)), 0)

    // Calculate Circles ongoing: total contributed in active ongoing Circles
    circlysOngoingSaved = investments
      .filter((inv: any) => getAccountType(inv) === 'CIRCLYS')
      .reduce((sum, inv) => {
        const meta = parseMetadata(inv.metadata)
        const monthlyContribution = toFiniteNumber(meta?.monthlyContribution)
        const totalMonths = toFiniteNumber(meta?.totalMonths)
        const totalRequired = monthlyContribution * totalMonths
        const totalPaid = Math.max(0, toFiniteNumber(meta?.totalPaid))

        // Only count active ongoing Circles (not fully paid).
        if (totalRequired > totalPaid) {
          return sum + totalPaid
        }
        return sum
      }, 0)
    
    // Add Circlys ongoing to total portfolio value
    totalValue += circlysOngoingSaved

    const activeNonSukukInvested = activeNonSukuk.reduce((sum: number, inv: any) => {
      const accountType = getAccountType(inv)
      if (!accountType || accountType === 'SUKUK') return sum
      return sum + getOwnerPrincipalShare(inv)
    }, 0)
    const debtInvested = Math.max(0, toFiniteNumber(debtsAtEnd))
    totalInvested = sukukInvested + activeNonSukukInvested + circlysOngoingSaved + debtInvested

    // Build per-type breakdown
    const typeMap = new Map<string, { invested: number; value: number; count: number }>()
    for (const inv of ownerScoped) {
      const t = getAccountType(inv)
      if (!t) continue
      const existing = typeMap.get(t) || { invested: 0, value: 0, count: 0 }
      const invested = t === 'SUKUK'
        ? (ownerSukukMetricsById.get(inv.id)?.principalOutstanding || 0)
        : getOwnerPrincipalShare(inv)
      existing.invested += invested
      if (t === 'SUKUK') {
        const metrics = ownerSukukMetricsById.get(inv.id)
        existing.value += (metrics ? (metrics.principalOutstanding + metrics.receivable) : 0)
      } else {
        const currentValue = Math.max(0, toFiniteNumber(inv.currentValue))
        const ownerPrincipal = getOwnerPrincipalShare(inv)
        const totalPrincipal = Math.max(0, toFiniteNumber(inv.principalAmount))
        const value = ownerPrincipal > 0 && totalPrincipal > 0 && ownerPrincipal < totalPrincipal
          ? currentValue * (ownerPrincipal / totalPrincipal)
          : currentValue
        existing.value += value
      }
      existing.count += 1
      typeMap.set(t, existing)
    }
    typeBreakdowns = Array.from(typeMap.entries())
      .map(([type, data]) => ({ type, ...data }))
      .sort((a, b) => b.value - a.value)

    // Group receivables by maturity year instead of point-in-time snapshots
    const receivableMap = new Map<number, { amount: number; deals: Array<{ name: string; maturityDate: Date; receivable: number; id: string }> }>()
    const activeSukukForReceivable = ownerScoped.filter((inv: any) => {
      if (getAccountType(inv) !== 'SUKUK') return false
      const metrics = ownerSukukMetricsById.get(inv.id)
      if (!metrics) return false
      // Include if has outstanding receivable OR principal (deal not yet matured)
      return metrics.receivable > 0.01 || metrics.principalOutstanding > 0.01
    })

    for (const inv of activeSukukForReceivable) {
      const maturity = toDate(inv.maturityDate)
      if (!maturity) continue
      const maturityYear = maturity.getFullYear()
      const metrics = ownerSukukMetricsById.get(inv.id)
      if (!metrics) continue
      
      // Calculate expected receivable at maturity (not current accrued)
      const receivableAtMaturity = metrics.accruedProfit > 0
        ? Math.max(0, metrics.accruedProfit - metrics.received)
        : metrics.receivable
      
      if (receivableAtMaturity < 0.01) continue
      
      const existing = receivableMap.get(maturityYear) || { amount: 0, deals: [] }
      existing.amount += receivableAtMaturity
      existing.deals.push({
        id: inv.id,
        name: inv.name || 'Unnamed',
        maturityDate: maturity,
        receivable: round2(receivableAtMaturity),
      })
      receivableMap.set(maturityYear, existing)
    }

    receivableByYear = Array.from(receivableMap.entries())
      .map(([year, data]) => ({ year, amount: round2(data.amount), deals: data.deals }))
      .filter((x) => x.amount > 0)
      .sort((a, b) => a.year - b.year)

    // Calculate ROSCA / Circlys remaining payback debt.
    const roscaInvestments = investments.filter((inv: any) => getAccountType(inv) === 'CIRCLYS')
    
    for (const inv of roscaInvestments) {
      const meta = parseMetadata(inv.metadata)
      const monthlyContribution = Math.max(0, toFiniteNumber(meta?.monthlyContribution))
      const totalMonths = Math.max(0, toFiniteNumber(meta?.totalMonths))
      const monthsPaid = Math.max(0, toFiniteNumber(meta?.monthsPaid))
      const totalPaid = Math.max(0, toFiniteNumber(meta?.totalPaid))
      const totalRequired = monthlyContribution * totalMonths
      const remaining = Math.max(0, totalRequired - totalPaid)
      const hasReceived = Boolean(meta?.received?.date)
      
      if (remaining > 0) {
        roscaDebt += remaining
        roscaPlans.push({
          name: inv.name || 'Unnamed Plan',
          remaining: round2(remaining),
          paid: round2(totalPaid),
          total: round2(totalRequired),
        })
      }
      
      // For ongoing plans (not yet received)
      if (!hasReceived && monthsPaid > 0) {
        ongoingPlans.push({
          name: inv.name || 'Unnamed Plan',
          saved: round2(totalPaid),
          toReceive: round2(totalRequired),
          isCompleted: monthsPaid >= totalMonths,
        })
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

    totalInvested = participants.reduce((sum: number, p: any) => {
      const investment = p?.investment
      const accountType = getAccountType(investment)
      if (!accountType) return sum
      return sum + Math.max(0, toFiniteNumber(p?.investedAmount))
    }, 0)

    totalValue = participants.reduce((sum: number, p: any) => {
      const investment = p?.investment
      const accountType = getAccountType(investment)
      if (!accountType) return sum
      if (accountType === 'SUKUK') {
        const m = getPartnerSukukMetrics(investment, p, now)
        return sum + Math.max(0, toFiniteNumber(m.value))
      }
      return sum + Math.max(0, toFiniteNumber(p?.currentValue))
    }, 0)

    // For partners, calculate profit breakdown
    const partnerSukuk = participants.filter((p: any) => getAccountType(p?.investment) === 'SUKUK')
    
    // Sukuk receivable and received
    sukukReceivable = partnerSukuk.reduce((sum: number, p: any) => {
      const m = getPartnerSukukMetrics(p?.investment, p, now)
      return sum + Math.max(0, toFiniteNumber(m.receivable))
    }, 0)
    
    sukukReceivedProfit = partnerSukuk.reduce((sum: number, p: any) => {
      const m = getPartnerSukukMetrics(p?.investment, p, now)
      return sum + Math.max(0, toFiniteNumber(m.received))
    }, 0)
    
    // Commission paid by partners (use metrics to get accurate commission)
    sukukCommissionEarned = partnerSukuk.reduce((sum: number, p: any) => {
      const m = getPartnerSukukMetrics(p?.investment, p, now)
      return sum + Math.max(0, toFiniteNumber(m.commissionPaid))
    }, 0)
    
    // Other profit sources
    malaaProfit = participants
      .filter((p: any) => getAccountType(p?.investment) === 'MALAA')
      .reduce((sum: number, p: any) => sum + toFiniteNumber(p?.profit), 0)
    
    cryptoProfit = participants
      .filter((p: any) => getAccountType(p?.investment) === 'CRYPTO')
      .reduce((sum: number, p: any) => sum + toFiniteNumber(p?.profit), 0)
    
    sipProfit = participants
      .filter((p: any) => getAccountType(p?.investment) === 'SIP')
      .reduce((sum: number, p: any) => sum + toFiniteNumber(p?.profit), 0)
    
    circlysProfit = participants
      .filter((p: any) => getAccountType(p?.investment) === 'CIRCLYS')
      .reduce((sum: number, p: any) => sum + toFiniteNumber(p?.profit), 0)
    
    otherProfit = participants
      .filter((p: any) => {
        const t = getAccountType(p?.investment)
        return t && !['SUKUK', 'MALAA', 'CRYPTO', 'SIP', 'CIRCLYS'].includes(t)
      })
      .reduce((sum: number, p: any) => sum + toFiniteNumber(p?.profit), 0)
    
    // Total profit
    totalProfit = malaaProfit + cryptoProfit + sipProfit + otherProfit + circlysProfit + sukukReceivable + sukukReceivedProfit

    activeInvestments = participants.filter((p: any) => {
      const investment = p?.investment
      const accountType = getAccountType(investment)
      if (!accountType) return false
      const maturity = toDate(investment?.maturityDate)
      const invested = Math.max(0, toFiniteNumber(p?.investedAmount))
      if (accountType === 'SUKUK') {
        const m = getPartnerSukukMetrics(investment, p, now)
        const principalOutstanding = Math.max(0, toFiniteNumber(m.value) - Math.max(0, toFiniteNumber(m.receivable)))
        if (maturity && maturity.getTime() < now.getTime()) return false
        return principalOutstanding > 0 || Math.max(0, toFiniteNumber(m.receivable)) > 0
      }
      if (maturity && maturity.getTime() < now.getTime()) return false
      return invested > 0 || Math.max(0, toFiniteNumber(p?.currentValue)) > 0
    }).length

    const typeMap = new Map<string, { invested: number; value: number; count: number }>()
    for (const p of participants) {
      const t = getAccountType(p?.investment)
      if (!t) continue
      const existing = typeMap.get(t) || { invested: 0, value: 0, count: 0 }
      const invested = Math.max(0, toFiniteNumber(p?.investedAmount))
      existing.invested += invested
      if (t === 'SUKUK') {
        const m = getPartnerSukukMetrics(p?.investment, p, now)
        existing.value += Math.max(0, toFiniteNumber(m.value))
      } else {
        existing.value += Math.max(0, toFiniteNumber(p?.currentValue))
      }
      existing.count += 1
      typeMap.set(t, existing)
    }
    typeBreakdowns = Array.from(typeMap.entries())
      .map(([type, data]) => ({ type, ...data }))
      .sort((a, b) => b.value - a.value)

    ownedInvestments = []
  }

  cashBalance = toFiniteNumber(cashBalance)
  cashSettingDelta = toFiniteNumber(cashSettingDelta)
  totalInvested = Math.max(0, toFiniteNumber(totalInvested))
  totalValue = Math.max(0, toFiniteNumber(totalValue))
  totalProfit = toFiniteNumber(totalProfit)
  activeInvestments = Math.max(0, Math.floor(toFiniteNumber(activeInvestments)))
  sukukInvested = Math.max(0, toFiniteNumber(sukukInvested))
  sukukValue = Math.max(0, toFiniteNumber(sukukValue))
  sukukReceivable = Math.max(0, toFiniteNumber(sukukReceivable))
  sipValue = Math.max(0, toFiniteNumber(sipValue))
  circlysOngoingSaved = Math.max(0, toFiniteNumber(circlysOngoingSaved))
  cryptoValue = Math.max(0, toFiniteNumber(cryptoValue))
  roscaDebt = Math.max(0, toFiniteNumber(roscaDebt))

  const yearlyValueChange = (() => {
    if (user.role !== 'OWNER') return { start: 0, end: 0, change: 0, pct: 0 }
    const startAt = yearStart
    const endAt = new Date(yearEnd.getTime() - 1)

    const base = Array.isArray(ownedInvestments) ? ownedInvestments : []
    const investmentsAtStart = base.filter((inv: any) => isActiveAt(inv, startAt))
    const investmentsAtEnd = base.filter((inv: any) => isActiveAt(inv, endAt))

    const valueAt = (inv: any, at: Date) => {
      const t = getAccountType(inv)
      if (!t) return 0
      if (t === 'SUKUK') {
        const ownerPrincipal = ownerSukukPrincipalById.get(inv.id)
        return getSukukValueAt(inv, at, ownerPrincipal)
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
    const rawPct = startNetWorth > 0 ? (change / startNetWorth) * 100 : 0
    const pct = Number.isFinite(rawPct) ? rawPct : 0

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

  const displayedValue = toFiniteNumber(cashBalance + totalValue)
  const yearlyProfitValue = await (async () => {
    if (user.role === 'OWNER') {
      if (!cashAccount) return 0
      const txs = await prisma.transaction.findMany({
        where: {
          accountId: cashAccount.id,
          date: { gte: yearStart, lt: yearEnd },
          type: {
            in: ['WITHDRAW_PROFIT', 'SELL_PROFIT_ACCRUED', 'PARTNER_COMMISSION'],
          },
          AND: [
            ownerTxScope,
            {
              OR: [
                { investment: { name: { notIn: DEMO_INVESTMENT_NAMES } } },
                { investmentId: null },
              ],
            },
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

  const yearlyReturnPercentage = (() => {
    const raw = totalInvested > 0 ? (yearlyProfitValue / totalInvested) * 100 : 0
    return Number.isFinite(raw) ? raw : 0
  })()
  const netWorth = toFiniteNumber(
    user.role === 'OWNER'
      ? displayedValue - roscaDebt - debtsAtEnd
      : displayedValue - roscaDebt
  )

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
        const t = getAccountType(inv)
        if (t === 'SUKUK') {
          const ownerPrincipal = ownerSukukPrincipalById.get(inv.id)
          return s + getSukukValueAt(inv, at, ownerPrincipal)
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
    ? Math.min(cashBalance / avgMonthlyOutflow, 999)
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
          date: { lt: yearEnd },
          AND: [
            ownerTxScope,
            {
              OR: [
                { investment: { name: { notIn: DEMO_INVESTMENT_NAMES } } },
                { investmentId: null },
              ],
            },
          ],
        } as any,
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

  const portfolioSparkline = monthlyPortfolioValue.map(m => toDisplayAmount(m.value))
  const cashSparkline = monthlyCashflow.map(m => toDisplayAmount(Math.abs(m.value)))
  const profitTrend = totalInvested > 0 ? (totalProfit / totalInvested) * 100 : 0
  const portfolioTrend = user.role === 'OWNER' ? yearlyValueChange.pct : yearlyReturnPercentage

  return (
    <PageTransition className="space-y-4">
      <TradingChartOverlay />
      {/* Header */}
      <AnimatedStatCard index={0} className="bg-gradient-to-r from-slate-800/80 to-slate-900/80 backdrop-blur-sm rounded-xl shadow-md p-6 text-white border border-slate-700/50">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Welcome back, {user.name}</h1>
            <p className="text-sm text-slate-400 mt-1">
              Portfolio overview {isAllYears ? 'for all years' : `for ${selectedYear}`}
              {!isCurrentYear && !isAllYears && ' (end of year snapshot)'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <ReportButton selectedYear={selectedYear} />
            <YearFilter selectedYear={displayYear} />
          </div>
        </div>
      </AnimatedStatCard>

      {/* Live Market Ticker */}
      <LiveMarketTicker />

      {/* Premium Stats Grid */}
      <PremiumStatsGrid
        portfolioValue={toDisplayAmount(displayedValue)}
        cashBalance={toDisplayAmount(cashBalance)}
        cashSettingDelta={toDisplayAmount(cashSettingDelta)}
        totalInvested={toDisplayAmount(totalInvested)}
        totalProfit={toDisplayAmount(totalProfit)}
        portfolioTrend={portfolioTrend}
        profitTrend={profitTrend}
        portfolioSparkline={portfolioSparkline}
        cashSparkline={cashSparkline}
        role={user.role as 'OWNER' | 'PARTNER'}
        profitBreakdown={{
          sukukReceivable: toDisplayAmount(sukukReceivable),
          sukukReceived: toDisplayAmount(sukukReceivedProfit),
          commission: toDisplayAmount(sukukCommissionEarned),
          savingsRewards: toDisplayAmount(circlysProfit),
          malaaProfit: toDisplayAmount(malaaProfit),
          cryptoProfit: toDisplayAmount(cryptoProfit),
          sipProfit: toDisplayAmount(sipProfit),
          otherProfit: toDisplayAmount(otherProfit),
        }}
        portfolioBreakdown={{
          cash: toDisplayAmount(cashBalance),
          sukuk: toDisplayAmount(sukukInvested + sukukReceivable),
          malaa: toDisplayAmount(malaaValue),
          crypto: toDisplayAmount(cryptoValue),
          circlys: toDisplayAmount(circlysOngoingSaved),
          other: toDisplayAmount(Math.max(0, displayedValue - cashBalance - (sukukInvested + sukukReceivable) - malaaValue - cryptoValue - circlysOngoingSaved)),
        }}
        cashBreakdown={{
          available: toDisplayAmount(cashBalance),
          setting: toDisplayAmount(cashSettingDelta),
        }}
        investedBreakdown={{
          sukuk: toDisplayAmount(sukukInvested),
          malaa: toDisplayAmount(malaaValue),
          crypto: toDisplayAmount(cryptoValue),
          circlys: toDisplayAmount(circlysOngoingSaved),
          other: toDisplayAmount(Math.max(0, totalInvested - sukukInvested - malaaValue - cryptoValue - circlysOngoingSaved)),
        }}
        currencyPrefix={currencyPrefix}
      />

      <DashboardStatsClient
        liquiditySharePct={liquiditySharePct}
        cashBalance={cashBalance}
        displayedValue={displayedValue}
        avgMonthlyCashflow={avgMonthlyCashflow}
        monthlyCashflowData={monthlyCashflow.map((point: any) => ({
          month: point.month,
          value: Number(point.value) || 0,
        }))}
        cashRunwayMonths={cashRunwayMonths}
        avgMonthlyOutflow={avgMonthlyOutflow}
        cashSettingDelta={cashSettingDelta}
        topTypeConcentrationPct={topTypeConcentrationPct}
        typeBreakdowns={typeBreakdowns.map((item: any) => ({
          type: item.type,
          value: Number(item.value) || 0,
        }))}
        activeInvestmentsCount={activeInvestments}
        roscaDebt={roscaDebt}
        roscaPlans={roscaPlans || []}
        ongoingPlans={ongoingPlans || []}
        netWorth={displayedValue - roscaDebt}
        totalInvested={totalInvested}
        totalValue={displayedValue}
        sukukValue={sukukValue}
        sukukInvested={sukukInvested}
        sukukReceivable={sukukReceivable}
        malaaValue={malaaValue}
        cryptoValue={cryptoValue}
        circlysOngoingSaved={circlysOngoingSaved}
        sipValue={sipValue}
        currencyPrefix={currencyPrefix}
        role={user.role as 'OWNER' | 'PARTNER'}
      />


      {user.role === 'PARTNER' && user.personId && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 items-start auto-rows-min">
          <AnimatedCard index={0}>
            <div className="p-6">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Profit (Accrued)</p>
              <div className="text-2xl font-bold text-emerald-400 mt-2 tabular-nums">
                {money(round2(totalProfit))}
              </div>
              <p className="text-xs text-slate-500 mt-1">Across your deals</p>
            </div>
          </AnimatedCard>
          <AnimatedCard index={1}>
            <div className="p-6">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Receivable</p>
              <div className="text-2xl font-bold text-sky-400 mt-2 tabular-nums">
                {money(round2(Math.max(0, totalValue - totalInvested)))}
              </div>
              <p className="text-xs text-slate-500 mt-1">Accrued - received</p>
            </div>
          </AnimatedCard>
          <AnimatedCard index={2}>
            <div className="p-6">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Received (This Year)</p>
              <div className="text-2xl font-bold text-purple-400 mt-2 tabular-nums">
                {money(round2(yearlyProfitValue))}
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

      {/* Per-Type Breakdown */}
      {user.role === 'OWNER' && (
        <ReceivableByYearCard
          data={receivableByYear.map((point) => ({
            ...point,
            amount: toDisplayAmount(point.amount),
          }))}
          currencyPrefix={currencyPrefix}
        />
      )}

      {user.role === 'OWNER' && (
        <DashboardCharts
          selectedYear={selectedYear}
          monthlyCashflow={monthlyCashflow}
          monthlyPortfolioValue={monthlyPortfolioValue}
          typeBreakdowns={typeBreakdowns}
        />
      )}

      {activity.length > 0 && (
        <AnimatedStatCard index={11} className="border border-slate-700/40 bg-slate-900/40 rounded-xl shadow-md overflow-hidden">
          <CardHeader>
            <CardTitle className="text-sm font-bold text-slate-200">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <AnimatedList className="space-y-2">
              {activity.slice(0, 8).map((entry: any, idx: number) => {
                const amount = Number(entry?.amount || 0)
                const isIn = amount >= 0
                const dateLabel = formatDisplayDate(entry?.date, '—')
                return (
                  <AnimatedListItem
                    key={entry.id}
                    index={idx}
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
                      {isIn ? '+' : '-'}{money(Math.abs(amount))}
                    </div>
                  </AnimatedListItem>
                )
              })}
            </AnimatedList>
          </CardContent>
        </AnimatedStatCard>
      )}

      {/* Per-Type Breakdown */}
      {typeBreakdowns.length > 0 && (
        <AnimatedStatCard index={12} className="border border-slate-700/40 bg-slate-900/40 rounded-xl shadow-md overflow-hidden">
          <CardHeader>
            <CardTitle className="text-sm font-bold text-slate-200">Balance by Investment Type</CardTitle>
          </CardHeader>
          <CardContent>
            <AnimatedList className="space-y-2">
              {typeBreakdowns.map((tb, idx) => {
                const returnPct = tb.invested > 0 ? ((tb.value - tb.invested) / tb.invested * 100) : 0
                const sharePct = totalTypeValue > 0 ? (tb.value / totalTypeValue) * 100 : 0
                return (
                  <AnimatedListItem key={tb.type} index={idx} className="rounded-lg border border-slate-700/40 bg-slate-800/30 p-3">
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
                        <div className="text-sm font-medium text-slate-200 tabular-nums">{money(tb.invested)}</div>
                      </div>
                      <div className="text-right min-w-[60px]">
                        <div className="text-xs text-slate-400">Value</div>
                        <div className="text-sm font-bold text-slate-100 tabular-nums">{money(tb.value)}</div>
                      </div>
                      <div className="text-right min-w-[60px]">
                        <div className="text-xs text-slate-400">Return</div>
                        <div className={`text-sm font-semibold tabular-nums ${returnPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {returnPct >= 0 ? '+' : ''}{returnPct.toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  </AnimatedListItem>
                )
              })}
            </AnimatedList>
          </CardContent>
        </AnimatedStatCard>
      )}
    </PageTransition>
  )
}
