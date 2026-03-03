import { getCurrentUser } from '@/lib/auth'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { prisma } from '@/lib/db'
import { DEMO_INVESTMENT_NAMES } from '@/lib/demo'
import { YearFilter } from '@/components/dashboard/YearFilter'
import { CashBalanceCard } from '@/components/dashboard/CashBalanceCard'
import { ReportButton } from '@/components/dashboard/ReportButton'
import { DashboardCharts } from '@/components/dashboard/DashboardCharts'
import { AnalyticsGrid } from '@/components/dashboard/AnalyticsGrid'

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

  const cashAccount =
    user.role === 'OWNER'
      ? await prisma.account.findFirst({ where: { type: 'CASH', isActive: true } })
      : null

  const cashSetting =
    user.role === 'OWNER'
      ? await prisma.systemSetting.findUnique({ where: { key: 'CASH_BALANCE' } })
      : null

  const currentCash = user.role === 'OWNER' ? Number(cashSetting?.value || 0) : 0

  const allCashTxSum =
    user.role === 'OWNER' && cashAccount
      ? (
          await prisma.transaction.aggregate({
            where: { accountId: cashAccount.id },
            _sum: { amount: true },
          })
        )._sum.amount || 0
      : 0

  const cashOffset =
    user.role === 'OWNER' && Number.isFinite(currentCash)
      ? currentCash - (Number.isFinite(allCashTxSum) ? allCashTxSum : 0)
      : 0

  const cashAt = async (atExclusive: Date) => {
    if (user.role !== 'OWNER' || !cashAccount) return 0
    const sum = (
      await prisma.transaction.aggregate({
        where: { accountId: cashAccount.id, date: { lt: atExclusive } },
        _sum: { amount: true },
      })
    )._sum.amount || 0
    return cashOffset + (Number.isFinite(sum) ? sum : 0)
  }

  const cashAtStart = await cashAt(yearStart)
  const cashAtEnd = await cashAt(yearEnd)
  const cashBalance = cashAtEnd

  let totalInvested = 0
  let totalValue = 0
  let totalProfit = 0
  let activeInvestments = 0

  let investments: any[] = []
  let ownedInvestments: any[] = []

  const investmentDateFilter = {
    startDate: { lt: yearEnd },
    OR: [{ maturityDate: null }, { maturityDate: { gte: yearStart } }],
  }

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
        account: { isActive: true },
        name: { notIn: DEMO_INVESTMENT_NAMES },
        ...investmentDateFilter,
      },
      include: {
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
            type: { in: ['WITHDRAW_PROFIT', 'WITHDRAW_PRINCIPAL'] },
          },
          select: {
            type: true,
            date: true,
            amount: true,
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

    const owned = investments.filter((inv: any) => {
      const dps = Array.isArray(inv.dealParticipants) ? inv.dealParticipants : []
      if (dps.length === 0) return true
      return Boolean(getOwnerPosition(inv))
    })

    ownedInvestments = owned

    totalInvested = owned.reduce((sum, inv) => {
      const pos = getOwnerPosition(inv)
      return sum + (pos ? Number(pos.investedAmount) || 0 : inv.principalAmount)
    }, 0)

    totalValue = owned.reduce(
      (sum, inv) => {
        const pos = getOwnerPosition(inv)
        const principal = pos ? Number(pos.investedAmount) || 0 : inv.principalAmount
        return sum + (inv.account.type === 'SUKUK' ? principal : inv.currentValue)
      },
      0
    )
    totalProfit = owned.reduce(
      (sum, inv) => {
        const pos = getOwnerPosition(inv)
        if (pos) return sum + (Number(pos.profit) || 0)
        return sum + inv.realizedProfit + inv.unrealizedProfit
      },
      0
    )
    activeInvestments = owned.length

    sukukInvested = owned
      .filter((inv) => inv.account.type === 'SUKUK')
      .reduce((sum, inv) => {
        const pos = getOwnerPosition(inv)
        return sum + (pos ? Number(pos.investedAmount) || 0 : inv.principalAmount)
      }, 0)

    const now = new Date()
    sukukReceivable = owned
      .filter((inv) => inv.account.type === 'SUKUK')
      .reduce((sum, inv) => {
        const pos = getOwnerPosition(inv)
        const v = getSukukValueAt(inv, now)
        const principal = pos
          ? (Number(pos.investedAmount) || 0)
          : (Number.isFinite(inv.principalAmount) ? Number(inv.principalAmount) : 0)
        const receivable = Math.max(0, v - principal)
        return sum + receivable
      }, 0)

    sukukValue = sukukInvested + sukukReceivable
    totalValue += sukukReceivable
    sipValue = owned
      .filter((inv) => inv.account.type === 'SIP')
      .reduce((sum, inv) => sum + inv.currentValue, 0)

    circlysOngoingSaved = owned
      .filter((inv) => inv.account.type === 'CIRCLYS')
      .filter((inv) => {
        try {
          const meta = inv.metadata ? JSON.parse(inv.metadata as string) : {}
          return !meta?.received?.date
        } catch {
          return true
        }
      })
      .reduce((sum, inv) => sum + inv.principalAmount, 0)

    // Build per-type breakdown
    const typeMap = new Map<string, { invested: number; value: number; count: number }>()
    for (const inv of owned) {
      const t = inv.account.type
      const existing = typeMap.get(t) || { invested: 0, value: 0, count: 0 }
      const pos = getOwnerPosition(inv)
      existing.invested += pos ? (Number(pos.investedAmount) || 0) : inv.principalAmount
      if (t === 'SUKUK') {
        const v = getSukukValueAt(inv, new Date())
        existing.value += v
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
        const monthlyAmount = Number(meta.monthlyAmount) || 0
        const durationMonths = Number(meta.durationMonths) || 0
        const totalPaid = Number(meta.totalPaid) || 0
        const totalRequired = monthlyAmount * durationMonths
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
          ...investmentDateFilter,
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

    totalInvested = participants.reduce((sum, p) => sum + (Number(p.investedAmount) || 0), 0)
    totalValue = participants.reduce((sum, p) => {
      const t = p.investment.account.type
      if (t === 'SUKUK') {
        const m = getPartnerSukukMetrics(p.investment, p, now)
        return sum + m.value
      }
      return sum + (Number(p.currentValue) || 0)
    }, 0)

    // For partners, totalProfit = accrued profit-to-date (not just stored p.profit)
    totalProfit = participants.reduce((sum, p) => {
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
    return { start: startNetWorth, end: endNetWorth, change, pct }
  })()

  const displayedValue = user.role === 'OWNER' ? cashBalance + totalValue : totalValue
  const yearlyProfitValue = await (async () => {
    if (user.role === 'OWNER') {
      if (!cashAccount) return 0
      const ownerPersonId = user.personId || null
      const txs = await prisma.transaction.findMany({
        where: {
          accountId: cashAccount.id,
          date: { gte: yearStart, lt: yearEnd },
          type: {
            in: ['WITHDRAW_PROFIT', 'SELL_PROFIT_ACCRUED', 'PARTNER_COMMISSION'],
          },
          AND: [
            {
              OR: [
                { investment: { name: { notIn: DEMO_INVESTMENT_NAMES } } },
                { investmentId: null },
              ],
            },
          ],
        } as any,
        select: { amount: true, type: true, personId: true },
      })

      const sum = txs.reduce((s: number, t: any) => {
        const n = Number(t?.amount)
        if (!Number.isFinite(n) || n <= 0) return s

        // Partner commission is owner income even if personId is set on the transaction.
        if (t?.type === 'PARTNER_COMMISSION') return s + n

        const pid = typeof t?.personId === 'string' ? t.personId : null
        const isOwnerScoped = pid === null || (ownerPersonId ? pid === ownerPersonId : false)
        if (!isOwnerScoped) return s

        return s + n
      }, 0)
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
    if (user.role !== 'OWNER' || !cashAccount) {
      return monthlyLabels.map((l) => ({ label: l, value: 0 }))
    }

    const txs = await prisma.transaction.findMany({
      where: { accountId: cashAccount.id, date: { gte: yearStart, lt: yearEnd } },
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
      return monthlyLabels.map((l) => ({ label: l, value: 0 }))
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

  const activity = await (async () => {
    const take = 12
    if (user.role === 'OWNER') {
      const txs = await prisma.transaction.findMany({
        where: {
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

      return txs.map((t) => ({
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

      return txs.map((t) => ({
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

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-xl shadow-md p-6 text-white">
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

      {/* Top Stats Row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 items-start auto-rows-min">
        {(user.role === 'OWNER' || user.role === 'PARTNER') && (
          <CashBalanceCard initialCash={user.role === 'OWNER' && Number.isFinite(cashBalance) ? cashBalance : 0} />
        )}
        <Card className="p-4">
          <CardContent>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Total Invested</p>
            <div className="text-xl font-bold text-gray-900 mt-1 tabular-nums">
              SAR {totalInvested.toLocaleString()}
            </div>
            <p className="text-[11px] text-gray-400 mt-0.5">Principal</p>
          </CardContent>
        </Card>
        <Card className="p-4">
          <CardContent>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              {user.role === 'OWNER' ? 'Portfolio Value' : 'Investment Value'}
            </p>
            <div className="text-xl font-bold text-gray-900 mt-1 tabular-nums">
              SAR {displayedValue.toLocaleString()}
            </div>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {user.role === 'OWNER' ? 'Cash + Investments' : 'Your share'}
            </p>
          </CardContent>
        </Card>
        <Card className="p-4">
          <CardContent>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Yearly Return</p>
            <div className={`text-xl font-bold mt-1 tabular-nums ${yearlyProfitValue >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              SAR {yearlyProfitValue.toLocaleString()}
            </div>
            <p className={`text-[11px] mt-0.5 font-semibold ${yearlyReturnPercentage >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {yearlyReturnPercentage >= 0 ? '↑' : '↓'} {Math.abs(yearlyReturnPercentage).toFixed(2)}%
            </p>
          </CardContent>
        </Card>
      </div>

      <AnalyticsGrid
        selectedYear={selectedYear}
        totalInvested={totalInvested}
        portfolioValue={displayedValue}
        yearlyReturnValue={yearlyProfitValue}
        monthlyCashflow={monthlyCashflow}
        monthlyPortfolioValue={monthlyPortfolioValue}
        typeBreakdowns={typeBreakdowns}
        activity={activity}
      />

      {user.role === 'PARTNER' && user.personId && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 items-start auto-rows-min">
          <Card className="p-4">
            <CardContent>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Profit (Accrued)</p>
              <div className="text-xl font-bold text-gray-900 mt-1 tabular-nums">
                SAR {round2(totalProfit).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <p className="text-[11px] text-gray-400 mt-0.5">Across your deals</p>
            </CardContent>
          </Card>
          <Card className="p-4">
            <CardContent>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Receivable</p>
              <div className="text-xl font-bold text-gray-900 mt-1 tabular-nums">
                SAR {round2(Math.max(0, totalValue - totalInvested)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <p className="text-[11px] text-gray-400 mt-0.5">Accrued - received</p>
            </CardContent>
          </Card>
          <Card className="p-4">
            <CardContent>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Received (This Year)</p>
              <div className="text-xl font-bold text-gray-900 mt-1 tabular-nums">
                SAR {round2(yearlyProfitValue).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <p className="text-[11px] text-gray-400 mt-0.5">Withdrawals / realized</p>
            </CardContent>
          </Card>
          <Card className="p-4">
            <CardContent>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Yearly Return %</p>
              <div className={`text-xl font-bold mt-1 tabular-nums ${yearlyReturnPercentage >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {yearlyReturnPercentage >= 0 ? '+' : ''}{Math.abs(yearlyReturnPercentage).toFixed(2)}%
              </div>
              <p className="text-[11px] text-gray-400 mt-0.5">Based on invested</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Second Row: Deals + Debt + Net Worth */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 items-start auto-rows-min">
        <Card className="p-4">
          <CardContent>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Active Deals</p>
            <div className="text-xl font-bold text-gray-900 mt-1">{activeInvestments}</div>
            <p className="text-[11px] text-gray-400 mt-0.5">Across all types</p>
          </CardContent>
        </Card>

        {user.role === 'OWNER' && roscaDebt > 0 && (
          <Card className="p-4">
            <CardContent>
              <p className="text-xs font-medium text-red-500 uppercase tracking-wider">ROSCA Remaining</p>
              <div className="text-xl font-bold text-red-600 mt-1 tabular-nums">
                SAR {roscaDebt.toLocaleString()}
              </div>
              <p className="text-[11px] text-red-400 mt-0.5">Unpaid commitments</p>
            </CardContent>
          </Card>
        )}

        {user.role === 'OWNER' && (
          <Card className="p-4">
            <CardContent>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Net Worth</p>
              <div className={`text-xl font-bold mt-1 tabular-nums ${netWorth >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                SAR {netWorth.toLocaleString()}
              </div>
              <p className="text-[11px] text-gray-400 mt-0.5">Portfolio − Debt</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Third Row: Key Totals */}
      {user.role === 'OWNER' && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 items-start auto-rows-min">
          <Card className="p-4">
            <CardContent>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Sukuk Total</p>
              <div className="text-xl font-bold text-gray-900 mt-1 tabular-nums">
                SAR {sukukValue.toLocaleString()}
              </div>
              <p className="text-[11px] text-gray-400 mt-0.5 tabular-nums">
                Invested SAR {sukukInvested.toLocaleString()}
              </p>
            </CardContent>
          </Card>

          <Card className="p-4">
            <CardContent>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Circlys Ongoing</p>
              <div className="text-xl font-bold text-gray-900 mt-1 tabular-nums">
                SAR {circlysOngoingSaved.toLocaleString()}
              </div>
              <p className="text-[11px] text-gray-400 mt-0.5">Saved (not received)</p>
            </CardContent>
          </Card>

          <Card className="p-4">
            <CardContent>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">SIP Total</p>
              <div className="text-xl font-bold text-gray-900 mt-1 tabular-nums">
                SAR {sipValue.toLocaleString()}
              </div>
              <p className="text-[11px] text-gray-400 mt-0.5">Current value</p>
            </CardContent>
          </Card>
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

      {/* Per-Type Breakdown */}
      {typeBreakdowns.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-bold text-gray-800">Balance by Investment Type</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {typeBreakdowns.map((tb) => {
                const returnPct = tb.invested > 0 ? ((tb.value - tb.invested) / tb.invested * 100) : 0
                return (
                  <div key={tb.type} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-gray-900">{tb.type}</span>
                      <span className="text-[11px] text-gray-400">{tb.count} deal{tb.count !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <div className="text-xs text-gray-400">Invested</div>
                        <div className="text-sm font-medium text-gray-700 tabular-nums">SAR {tb.invested.toLocaleString()}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-gray-400">Value</div>
                        <div className="text-sm font-bold text-gray-900 tabular-nums">SAR {tb.value.toLocaleString()}</div>
                      </div>
                      <div className="text-right min-w-[60px]">
                        <div className="text-xs text-gray-400">Return</div>
                        <div className={`text-sm font-semibold tabular-nums ${returnPct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
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
