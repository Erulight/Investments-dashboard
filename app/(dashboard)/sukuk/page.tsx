import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { SukukList } from '@/components/sukuk/SukukList'
import { requireModuleAccess } from '@/lib/rbac'
import { SukukStatsHeader } from '@/components/sukuk/SukukStatsHeader'
import {
  DISPLAY_CURRENCY_KEY,
  convertCurrencyAmount,
  formatCurrencyAmount,
  getCurrencyPrefix,
  normalizeDisplayCurrency,
} from '@/lib/currency'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function InvestmentsPage() {
  await requireModuleAccess('sukuk')
  const user = await getCurrentUser()
  
  if (!user) {
    redirect('/login')
  }

  const displayCurrencySetting = await prisma.systemSetting.findUnique({
    where: { key: DISPLAY_CURRENCY_KEY },
  })
  const displayCurrency = normalizeDisplayCurrency(displayCurrencySetting?.value)
  const currencySymbol = getCurrencyPrefix(displayCurrency)
  const toDisplayAmount = (value: number) => convertCurrencyAmount(value, 'SAR', displayCurrency)
  const money = (value: number) => formatCurrencyAmount(value, displayCurrency, 'SAR')

  let investments: any[] = []

  if (user.role === 'OWNER') {
    investments = await prisma.investment.findMany({
      where: {
        account: {
          type: 'SUKUK',
          isActive: true,
        },
      },
      include: {
        account: true,
        dealParticipants: {
          include: { person: true },
        },
        transactions: {
          where: {
            type: {
              in: [
                'WITHDRAW_PROFIT',
                'WITHDRAW_PRINCIPAL',
                'SELL_TO_PARTNER',
                'SELL_PROFIT_ACCRUED',
                'BUY_FROM_PARTNER',
                'PARTNER_COMMISSION',
              ],
            },
          },
          orderBy: { date: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    const ownerPersonId = user.personId || null
    investments = await Promise.all(
      investments.map(async (inv: any) => {
        const participants = Array.isArray(inv?.dealParticipants) ? inv.dealParticipants : []
        const partnerPersonIds = participants
          .map((p: any) => (typeof p?.personId === 'string' ? p.personId : null))
          .filter((pid: string | null): pid is string => Boolean(pid) && pid !== ownerPersonId)

        let partnerClosed = false
        if (partnerPersonIds.length > 0) {
          const movement = await prisma.cashBucketMovement.findFirst({
            where: {
              investmentId: inv.id,
              type: 'WITHDRAW_PRINCIPAL',
              cashBucket: { personId: { in: partnerPersonIds } },
            } as any,
            select: { id: true },
          })
          partnerClosed = Boolean(movement)
        }

        return { ...inv, partnerClosed }
      })
    )
  } else if (user.role === 'PARTNER' && user.personId) {
    const participants = await prisma.dealParticipant.findMany({
      where: {
        personId: user.personId,
        investment: {
          account: {
            type: 'SUKUK',
            isActive: true,
          },
        },
      },
      include: {
        investment: {
          include: {
            account: true,
            transactions: {
              where: {
                type: {
                  in: [
                    'WITHDRAW_PROFIT',
                    'WITHDRAW_PRINCIPAL',
                    'SELL_TO_PARTNER',
                    'SELL_PROFIT_ACCRUED',
                    'BUY_FROM_PARTNER',
                    'PARTNER_COMMISSION',
                  ],
                },
              },
              orderBy: { date: 'asc' },
            },
          },
        },
      },
    })
    
    investments = participants.map((p: any) => ({
      ...p.investment,
      myParticipation: {
        id: p.id,
        investedAmount: p.investedAmount,
        currentValue: p.currentValue,
        profit: p.profit,
        acquiredAt: p.acquiredAt,
        commissionFees: p.commissionFees,
      },
    }))
  }

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

  const isViewerTransaction = (tx: any) => {
    if (user.role === 'OWNER') {
      if (tx?.personId == null) return true
      return user.personId ? tx.personId === user.personId : false
    }
    if (user.personId) return tx?.personId === user.personId
    return true
  }

  const getViewerPrincipal = (inv: any) => {
    const participationPrincipalRaw = Number(inv?.myParticipation?.investedAmount)
    if (Number.isFinite(participationPrincipalRaw)) return participationPrincipalRaw
    const principalRaw = Number(inv?.principalAmount)
    return Number.isFinite(principalRaw) ? principalRaw : 0
  }

  const getPrincipalOutstanding = (inv: any) => {
    // NOTE: inv.principalAmount is already reduced by the API when WITHDRAW_PRINCIPAL happens
    // (see app/api/sukuk/[id]/withdraw/route.ts line 205-207)
    // So we just return the current principalAmount without subtracting withdrawals again
    return getViewerPrincipal(inv)
  }

  const getViewerReceived = (inv: any) => {
    const transactions = Array.isArray(inv.transactions) ? inv.transactions : []
    const profitWithdrawals = transactions.filter((tx: any) => tx.type === 'WITHDRAW_PROFIT')

    if (user.role === 'OWNER') {
      const totalReceived = Number(inv.totalReceived)
      if (Number.isFinite(totalReceived)) return totalReceived

      return profitWithdrawals.reduce((sum: number, tx: any) => {
        const ownerTx = user.personId
          ? (tx.personId == null || tx.personId === user.personId)
          : tx.personId == null
        if (!ownerTx) return sum
        const amount = Number(tx.amount)
        return sum + (Number.isFinite(amount) ? amount : 0)
      }, 0)
    }

    if (user.personId) {
      const withdrawn = profitWithdrawals.reduce((sum: number, tx: any) => {
        if (tx.personId !== user.personId) return sum
        const amount = Number(tx.amount)
        return sum + (Number.isFinite(amount) ? amount : 0)
      }, 0)

      return withdrawn
    }

    const totalReceived = Number(inv.totalReceived)
    return Number.isFinite(totalReceived)
      ? totalReceived
      : profitWithdrawals.reduce((sum: number, tx: any) => {
          const amount = Number(tx.amount)
          return sum + (Number.isFinite(amount) ? amount : 0)
        }, 0)
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

  const getPartnerCommissionPaid = (inv: any) => {
    if (user.role !== 'PARTNER' || !user.personId) return 0
    const transactions = Array.isArray(inv.transactions) ? inv.transactions : []
    
    const participationCommissionRaw = Number(inv?.myParticipation?.commissionFees)
    const fromParticipation = Number.isFinite(participationCommissionRaw)
      ? Math.max(0, participationCommissionRaw)
      : 0

    // If participation commission exists, use it (user edited value takes priority)
    if (fromParticipation > 0) {
      return round2(fromParticipation)
    }

    const fromBuyTx = transactions
      .filter((tx: any) => tx.type === 'BUY_FROM_PARTNER' && tx.personId === user.personId)
      .reduce((sum: number, tx: any) => {
        const meta = parseMetadata(tx.metadata)
        const commission = Number(meta?.commissionAmount ?? 0)
        return sum + (Number.isFinite(commission) ? Math.max(0, commission) : 0)
      }, 0)

    const invMeta = parseMetadata(inv?.metadata)
    const planCommissionRaw = Number(invMeta?.partnerCommissionPlan?.amount ?? 0)
    const fromPlan = Number.isFinite(planCommissionRaw)
      ? Math.max(0, planCommissionRaw)
      : 0

    return round2(Math.max(fromBuyTx, fromPlan))
  }

  const getPartnerCreateCommissionPlan = (inv: any) => {
    const meta = parseMetadata(inv?.metadata)
    const amount = Number(meta?.partnerCommissionPlan?.amount ?? 0)
    return Number.isFinite(amount) ? round2(Math.max(0, amount)) : 0
  }

  const getOwnerRealizedProfitFromSales = (inv: any) => {
    if (user.role !== 'OWNER' || !user.personId) return 0
    const transactions = Array.isArray(inv.transactions) ? inv.transactions : []
    const profit = transactions
      .filter((tx: any) => tx.type === 'SELL_PROFIT_ACCRUED' && tx.personId === user.personId)
      .reduce((sum: number, tx: any) => {
        const amount = Number(tx.amount)
        return sum + (Number.isFinite(amount) ? amount : 0)
      }, 0)
    return round2(Math.max(0, profit))
  }

  const getOwnerRealizedFromSellMeta = (inv: any) => {
    if (user.role !== 'OWNER' || !user.personId) return { profit: 0, commission: 0 }
    const transactions = Array.isArray(inv.transactions) ? inv.transactions : []

    const sells = transactions
      .filter((tx: any) => tx.type === 'SELL_TO_PARTNER' && tx.personId === user.personId)
      .map((tx: any) => ({ tx, d: toDate(tx?.date), meta: parseMetadata(tx?.metadata) }))
      .filter((x: any) => x.d)

    const ownerBuysAfter = transactions
      .filter((tx: any) => tx.type === 'BUY_FROM_PARTNER' && tx.personId === user.personId)
      .map((tx: any) => toDate(tx?.date))
      .filter((d: any) => d)

    const hasBuyAfter = (sellDate: Date) => ownerBuysAfter.some((bd: Date) => (bd as any).getTime() >= (sellDate as any).getTime())

    return sells.reduce(
      (acc: { profit: number; commission: number }, s: any) => {
        // If owner later bought back (a BUY_FROM_PARTNER exists after this sell), exclude this sell from realized totals
        if (hasBuyAfter(s.d as Date)) return acc

        const profit = Number(s.meta?.accruedProfitAtSale ?? 0)
        const commission = Number(s.meta?.commissionAmount ?? 0)
        return {
          profit: acc.profit + (Number.isFinite(profit) ? round2(Math.max(0, profit)) : 0),
          commission: acc.commission + (Number.isFinite(commission) ? round2(Math.max(0, commission)) : 0),
        }
      },
      { profit: 0, commission: 0 }
    )
  }

  const isSoldDealForOwner = (inv: any) => {
    if (user.role !== 'OWNER' || !user.personId) return false
    const participants = Array.isArray(inv.dealParticipants) ? inv.dealParticipants : []
    if (participants.length === 0) return false
    const ownerParticipation = participants.find((p: any) => p?.personId === user.personId)
    return !ownerParticipation || Number(ownerParticipation.investedAmount || 0) <= 0
  }

  const getOwnerSoldSettlement = (inv: any) => {
    if (user.role !== 'OWNER' || !user.personId) {
      return { target: 0, received: 0, pending: 0 }
    }

    const target = round2(Math.max(0, getOwnerRealizedFromSellMeta(inv).profit))
    if (target <= 0) return { target: 0, received: 0, pending: 0 }

    const transactions = Array.isArray(inv.transactions) ? inv.transactions : []
    const receivedRaw = transactions.reduce((sum: number, tx: any) => {
      if (tx?.personId !== user.personId) return sum

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

  const getNetProfit = (inv: any) => {
    // For sold deals (owner perspective), use realized sale profit metadata.
    if (user.role === 'OWNER' && user.personId) {
      const transactions = Array.isArray(inv.transactions) ? inv.transactions : []
      const sellTx = transactions.find((tx: any) => tx.type === 'SELL_TO_PARTNER' && tx.personId === user.personId)
      if (sellTx) {
        const saleMeta = parseMetadata(sellTx.metadata)
        if (saleMeta && Number.isFinite(saleMeta.accruedProfitAtSale ?? saleMeta.investorProfit)) {
          return round2(Math.max(0, Number(saleMeta.accruedProfitAtSale ?? saleMeta.investorProfit)))
        }
      }
    }

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
      const commissionFees = user.role === 'PARTNER'
        ? (Number.isFinite(inv.myParticipation?.commissionFees)
            ? Number(inv.myParticipation.commissionFees)
            : getPartnerCommissionPaid(inv))
        : (Number.isFinite(inv.myParticipation?.commissionFees)
            ? Number(inv.myParticipation.commissionFees)
            : 0)
      return round2(Math.max(0, manualReceivable - commissionFees))
    }
    const commissionFees = user.role === 'PARTNER'
      ? (Number.isFinite(inv.myParticipation?.commissionFees)
          ? Number(inv.myParticipation.commissionFees)
          : getPartnerCommissionPaid(inv))
      : (Number.isFinite(inv.myParticipation?.commissionFees)
          ? Number(inv.myParticipation.commissionFees)
          : 0)
    const timeRatio = inv.myParticipation && totalMonthsFull > 0
      ? Math.min(1, Math.max(0, periodMonths / totalMonthsFull))
      : 1
    const proratedFees = inv.myParticipation
      ? (fees * participationRatio) * timeRatio
      : fees
    return round2(Math.max(0, grossProfit - proratedFees - commissionFees))
  }

  const isActiveDeal = (inv: any) => {
    if (isSoldDealForOwner(inv)) return false
    const principalOutstanding = getPrincipalOutstanding(inv)
    const netProfit = getNetProfit(inv)
    const totalReceived = getViewerReceived(inv)
    const receivable = netProfit - totalReceived
    return principalOutstanding > 0.01 || receivable > 0.01
  }

  const displayedInvestments = (() => {
    if (user.role !== 'OWNER' || !user.personId) return investments
    return investments.filter((inv: any) => {
      const participants = Array.isArray(inv.dealParticipants) ? inv.dealParticipants : []
      if (participants.length === 0) return true
      return participants.some((p: any) => p.personId === user.personId)
    })
  })()

  const activeInvestments = displayedInvestments.filter(isActiveDeal)

  const totalInvested = activeInvestments.reduce((sum, inv) => {
    const principal = getPrincipalOutstanding(inv)
    return sum + (Number.isFinite(principal) ? principal : 0)
  }, 0)

  const totalNetProfit = (() => {
    // Owner: include realized profit + commission from sold deals even after ownership is removed
    if (user.role === 'OWNER' && user.personId) {
      const activeProfit = displayedInvestments
        .filter((inv: any) => !isSoldDealForOwner(inv))
        .reduce((sum, inv) => sum + getNetProfit(inv), 0)

      // Include deals where owner had participation OR has sell transactions
      // (e.g., Safaqa: owner had 0 principal but sold to partner and earned profit)
      const ownerInvestments = investments.filter((inv: any) => {
        const participants = Array.isArray(inv.dealParticipants) ? inv.dealParticipants : []
        if (participants.length === 0) return true
        
        const ownerParticipation = participants.find((p: any) => p?.personId === user.personId)
        if (!ownerParticipation) return false
        
        // Include if owner has current/historical principal > 0
        const invested = Number(ownerParticipation.investedAmount || 0)
        if (invested > 0) return true
        
        // OR include if owner has sell transactions (earned profit before selling to partner)
        const transactions = Array.isArray(inv.transactions) ? inv.transactions : []
        const hasOwnerSell = transactions.some((tx: any) => 
          tx.type === 'SELL_TO_PARTNER' && tx.personId === user.personId
        )
        return hasOwnerSell
      })
      const soldTarget = ownerInvestments.reduce((sum, inv) => sum + getOwnerSoldSettlement(inv).target, 0)
      return round2(activeProfit + soldTarget)
    }

    // Partner: Total profit = receivable (future) + received (withdrawn)
    const receivable = displayedInvestments.reduce((sum, inv) => sum + getNetProfit(inv), 0)
    const received = displayedInvestments.reduce((sum, inv) => sum + getViewerReceived(inv), 0)
    return round2(receivable + received)
  })()

  const totalWithdrawn = (() => {
    const activeReceived = displayedInvestments
      .filter((inv: any) => !(user.role === 'OWNER' && isSoldDealForOwner(inv)))
      .reduce((sum, inv) => sum + getViewerReceived(inv), 0)

    if (user.role !== 'OWNER' || !user.personId) return round2(activeReceived)

    // Include deals where owner had participation OR has sell transactions
    const ownerInvestments = investments.filter((inv: any) => {
      const participants = Array.isArray(inv.dealParticipants) ? inv.dealParticipants : []
      if (participants.length === 0) return true
      
      const ownerParticipation = participants.find((p: any) => p?.personId === user.personId)
      if (!ownerParticipation) return false
      
      // Include if owner has current/historical principal > 0
      const invested = Number(ownerParticipation.investedAmount || 0)
      if (invested > 0) return true
      
      // OR include if owner has sell transactions (received profit before selling to partner)
      const transactions = Array.isArray(inv.transactions) ? inv.transactions : []
      const hasOwnerSell = transactions.some((tx: any) => 
        tx.type === 'SELL_TO_PARTNER' && tx.personId === user.personId
      )
      return hasOwnerSell
    })
    const soldReceived = ownerInvestments.reduce((sum, inv) => sum + getOwnerSoldSettlement(inv).received, 0)
    return round2(activeReceived + soldReceived)
  })()

  const totalCommissionEarned = (() => {
    if (user.role !== 'OWNER' || !user.personId) return 0

    const byDealCommission = investments.reduce((sum, inv) => {
      const transactions = Array.isArray(inv.transactions) ? inv.transactions : []
      const txSellCommission = transactions
        .filter((tx: any) => tx.type === 'PARTNER_COMMISSION' && tx.personId === user.personId)
        .filter((tx: any) => {
          const meta = parseMetadata(tx.metadata)
          return meta?.source !== 'PARTNER_CREATE_COMMISSION_PAYOUT'
        })
        .reduce((acc: number, tx: any) => {
          const amount = Number(tx.amount)
          return acc + (Number.isFinite(amount) ? amount : 0)
        }, 0)

      const txCreateCommission = transactions
        .filter((tx: any) => tx.type === 'PARTNER_COMMISSION' && tx.personId === user.personId)
        .filter((tx: any) => {
          const meta = parseMetadata(tx.metadata)
          return meta?.source === 'PARTNER_CREATE_COMMISSION_PAYOUT'
        })
        .reduce((acc: number, tx: any) => {
          const amount = Number(tx.amount)
          return acc + (Number.isFinite(amount) ? amount : 0)
        }, 0)

      const metaSellCommission = getOwnerRealizedFromSellMeta(inv).commission
      const metaCreateCommission = getPartnerCreateCommissionPlan(inv)

      const sellEffective = Math.max(Math.max(0, txSellCommission), Math.max(0, metaSellCommission))
      const createEffective = Math.max(Math.max(0, txCreateCommission), Math.max(0, metaCreateCommission))

      return sum + sellEffective + createEffective
    }, 0)

    return round2(byDealCommission)
  })()

  const totalCommissionPaid = (() => {
    if (user.role !== 'PARTNER' || !user.personId) return 0
    return round2(investments.reduce((sum, inv) => sum + getPartnerCommissionPaid(inv), 0))
  })()

  const totalPendingFromSoldDeals = (() => {
    if (user.role !== 'OWNER' || !user.personId) return 0
    // Only count deals where owner has/had ACTUAL participation (exclude partner-only deals)
    const ownerInvestments = investments.filter((inv: any) => {
      const participants = Array.isArray(inv.dealParticipants) ? inv.dealParticipants : []
      // If no participants, it's a legacy owner-only deal
      if (participants.length === 0) return true
      // Must exist AND have positive invested amount
      const ownerParticipation = participants.find((p: any) => p?.personId === user.personId)
      if (!ownerParticipation) return false
      const invested = Number(ownerParticipation.investedAmount || 0)
      return invested > 0
    })
    return round2(ownerInvestments.reduce((sum, inv) => sum + getOwnerSoldSettlement(inv).pending, 0))
  })()

  const totalReceivable = (() => {
    if (user.role === 'OWNER' && user.personId) {
      const activeNet = displayedInvestments
        .filter((inv: any) => !isSoldDealForOwner(inv))
        .reduce((sum, inv) => sum + getNetProfit(inv), 0)

      const activeReceived = displayedInvestments
        .filter((inv: any) => !isSoldDealForOwner(inv))
        .reduce((sum, inv) => sum + getViewerReceived(inv), 0)

      return round2(Math.max(0, activeNet - activeReceived))
    }

    return round2(Math.max(0, totalNetProfit - totalWithdrawn))
  })()

  const totalValue = totalInvested
  const totalReturn = totalNetProfit
  const returnPercentage = totalInvested > 0 ? ((totalReturn / totalInvested) * 100) : 0
  const activeDealsCount = activeInvestments.length

  const totalFeesPaid = round2(displayedInvestments.reduce((sum, inv) => {
    const principal = inv.myParticipation?.investedAmount ?? inv.principalAmount
    const investment = Number.isFinite(principal) ? principal : 0
    const ratio = inv.principalAmount > 0 && investment > 0 ? Math.min(1, investment / inv.principalAmount) : 0
    const fees = Number.isFinite(inv.fees) ? inv.fees : 0
    const startBasis = inv.myParticipation?.acquiredAt ?? inv.startDate
    const monthsHeld = getPeriodMonths(startBasis, inv.maturityDate)
    const totalMonthsFull = getPeriodMonths(inv.startDate, inv.maturityDate)
    const timeRatio = inv.myParticipation && totalMonthsFull > 0
      ? Math.min(1, Math.max(0, monthsHeld / totalMonthsFull))
      : 1
    return sum + (inv.myParticipation ? (fees * ratio) * timeRatio : fees)
  }, 0))

  const maturityDayStats = (() => {
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const withDays = activeInvestments
      .map((inv) => {
        const maturity = toDate(inv.maturityDate)
        if (!maturity) return null
        const mStart = new Date(maturity.getFullYear(), maturity.getMonth(), maturity.getDate())
        const diffMs = mStart.getTime() - todayStart.getTime()
        const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
        return Number.isFinite(days) ? days : null
      })
      .filter((v): v is number => v !== null)

    const upcoming = withDays.filter((days) => days >= 0)
    const overdue = withDays.filter((days) => days < 0).map((days) => Math.abs(days))

    return {
      avgUpcomingDays: upcoming.length > 0
        ? upcoming.reduce((sum, v) => sum + v, 0) / upcoming.length
        : null,
      nearMaturityDealsCount: upcoming.filter((days) => days <= 30).length,
      overdueDealsCount: overdue.length,
      avgOverdueDays: overdue.length > 0
        ? overdue.reduce((sum, v) => sum + v, 0) / overdue.length
        : null,
    }
  })()

  const avgDaysToMaturity = maturityDayStats.avgUpcomingDays
  const nearMaturityDealsCount = maturityDayStats.nearMaturityDealsCount
  const overdueDealsCount = maturityDayStats.overdueDealsCount
  const avgOverdueDays = maturityDayStats.avgOverdueDays

  const realizedCoveragePct = totalReturn > 0
    ? Math.min(100, Math.max(0, (totalWithdrawn / totalReturn) * 100))
    : 0

  const platformTotals: Array<[string, number]> = Array.from(
    activeInvestments
      .reduce((map: Map<string, number>, inv: any) => {
        const platform = inv.account?.name || 'Unknown'
        const principal = getPrincipalOutstanding(inv)
        const invested = Number.isFinite(principal) ? principal : 0
        map.set(platform, (map.get(platform) ?? 0) + invested)
        return map
      }, new Map<string, number>())
      .entries()
  ).sort((a, b) => b[1] - a[1])
  const displayPlatformTotals: Array<[string, number]> = platformTotals
    .map(([platform, value]) => [platform, toDisplayAmount(value)] as [string, number])
    .sort((a, b) => b[1] - a[1])

  const getMonthKey = (value?: string | Date | null) => {
    const date = toDate(value)
    if (!date) return null
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    return `${y}-${m}`
  }

  const monthKeyToLabel = (key: string) => {
    const match = key.match(/^(\d{4})-(\d{2})$/)
    if (!match) return key
    const [, y, m] = match
    return `${m}/${y}`
  }

  const getMonthlySeries = (sourceInvestments: any[]) => {
    const buckets = new Map<string, { received: number; realizedProfit: number }>()

    for (const inv of sourceInvestments) {
      const transactions = Array.isArray(inv.transactions) ? inv.transactions : []
      for (const tx of transactions) {
        const key = getMonthKey(tx.date)
        if (!key) continue

        const type = String(tx.type || '')
        const amountRaw = Number(tx.amount)
        const amount = Number.isFinite(amountRaw) ? amountRaw : 0

        const viewerOk = isViewerTransaction(tx)
        if (!viewerOk) continue

        const current = buckets.get(key) ?? { received: 0, realizedProfit: 0 }

        if (type === 'WITHDRAW_PROFIT') {
          current.received += Math.max(0, amount)
          current.realizedProfit += Math.max(0, amount)
        }

        if (type === 'SELL_PROFIT_ACCRUED' || type === 'PARTNER_COMMISSION') {
          current.received += Math.max(0, amount)
          current.realizedProfit += Math.max(0, amount)
        }

        buckets.set(key, current)
      }
    }

    const keys = Array.from(buckets.keys()).sort()
    return keys.map((k) => ({
      key: k,
      label: monthKeyToLabel(k),
      received: buckets.get(k)?.received ?? 0,
      realizedProfit: buckets.get(k)?.realizedProfit ?? 0,
    }))
  }

  const analyticsSource = user.role === 'OWNER' ? investments : displayedInvestments
  const monthlySeries = getMonthlySeries(analyticsSource)

  const renderSparkline = (points: number[]) => {
    const width = 560
    const height = 120
    if (points.length === 0) return null

    const max = Math.max(...points, 0)
    const min = Math.min(...points, 0)
    const range = Math.max(1e-6, max - min)
    const stepX = points.length > 1 ? width / (points.length - 1) : width

    const path = points
      .map((v, i) => {
        const x = i * stepX
        const y = height - ((v - min) / range) * height
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
      })
      .join(' ')

    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-28">
        <path d={path} fill="none" stroke="#0f172a" strokeWidth="2" />
      </svg>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <SukukStatsHeader
        role={user.role}
        currency={currencySymbol}
        totalValue={toDisplayAmount(totalValue)}
        totalReturn={toDisplayAmount(totalReturn)}
        returnPercentage={returnPercentage}
        activeDealsCount={activeDealsCount}
        totalWithdrawn={toDisplayAmount(totalWithdrawn)}
        totalFeesPaid={toDisplayAmount(totalFeesPaid)}
        totalReceivable={toDisplayAmount(totalReceivable)}
        totalCommissionEarned={toDisplayAmount(totalCommissionEarned)}
        totalCommissionPaid={toDisplayAmount(totalCommissionPaid)}
        totalPendingFromSoldDeals={toDisplayAmount(totalPendingFromSoldDeals)}
        avgDaysToMaturity={avgDaysToMaturity}
        nearMaturityDealsCount={nearMaturityDealsCount}
        overdueDealsCount={overdueDealsCount}
        avgOverdueDays={avgOverdueDays}
        realizedCoveragePct={realizedCoveragePct}
        platformTotals={displayPlatformTotals}
      />

      {/* Investments List */}
      <Card>
        <CardContent>
          <SukukList
            initialSukuk={investments}
            userRole={user.role}
            ownerPersonId={user.role === 'OWNER' ? (user.personId || null) : null}
            viewerPersonId={user.personId || null}
          />
        </CardContent>
      </Card>

      {/* Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-bold text-gray-800">Analytics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-lg border border-gray-100 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-gray-700 dark:text-slate-200">Monthly Received</p>
                  <p className="text-[11px] text-gray-500">Last {monthlySeries.length} months</p>
                </div>
                <div className="mt-2">
                  {renderSparkline(monthlySeries.map((x) => toDisplayAmount(x.received)))}
                </div>
              </div>

              <div className="rounded-lg border border-gray-100 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-gray-700 dark:text-slate-200">Monthly Realized Profit</p>
                  <p className="text-[11px] text-gray-500">Withdrawals + Sold profit + Commission</p>
                </div>
                <div className="mt-2">
                  {renderSparkline(monthlySeries.map((x) => toDisplayAmount(x.realizedProfit)))}
                </div>
              </div>
            </div>

            {monthlySeries.length > 0 && (
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-[11px] text-gray-500">Best Month (Received)</p>
                  {(() => {
                    const best = monthlySeries.reduce((a, b) => (b.received > a.received ? b : a), monthlySeries[0])
                    return (
                      <p className="text-sm font-bold text-gray-900 tabular-nums">
                        {best.label} • {money(best.received)}
                      </p>
                    )
                  })()}
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-[11px] text-gray-500">Best Month (Profit)</p>
                  {(() => {
                    const best = monthlySeries.reduce(
                      (a, b) => (b.realizedProfit > a.realizedProfit ? b : a),
                      monthlySeries[0]
                    )
                    return (
                      <p className="text-sm font-bold text-gray-900 tabular-nums">
                        {best.label} • {money(best.realizedProfit)}
                      </p>
                    )
                  })()}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-bold text-gray-800">Platform Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {platformTotals.length === 0 ? (
              <p className="text-xs text-gray-500">No data</p>
            ) : (
              <div className="space-y-2">
                {(() => {
                  const max = Math.max(...displayPlatformTotals.map((x) => x[1]), 1)
                  return displayPlatformTotals.slice(0, 8).map(([platform, value]) => {
                    const pct = Math.max(0, Math.min(100, (value / max) * 100))
                    return (
                      <div key={platform} className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-xs text-gray-700 dark:text-slate-200">{platform}</span>
                          <span className="text-xs font-semibold tabular-nums text-gray-900">
                            {money(value)}
                          </span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-2">
                          <div
                            className="bg-slate-800 h-2 rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    )
                  })
                })()}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Performance Overview for Owner */}
      {user.role === 'OWNER' && investments.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-bold text-gray-800">Portfolio Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {activeInvestments.slice(0, 5).map((inv: any) => {
                  const principal = inv.principalAmount
                  const percentage = totalInvested > 0 ? (principal / totalInvested * 100) : 0
                  return (
                    <div key={inv.id}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-gray-600 truncate pr-2">{inv.name}</span>
                        <span className="text-xs font-semibold text-gray-800 tabular-nums">{percentage.toFixed(1)}%</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-1.5">
                        <div 
                          className="bg-slate-700 h-1.5 rounded-full transition-all duration-500"
                          style={{ width: `${percentage}%` }}
                        ></div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-bold text-gray-800">Quick Stats</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <span className="text-xs text-gray-500">Avg. Deal Size</span>
                  <span className="text-sm font-bold text-gray-900">
                    {money(totalInvested / Math.max(1, activeDealsCount))}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <span className="text-xs text-gray-500">Active Deals</span>
                  <span className="text-sm font-bold text-gray-900">{activeDealsCount}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <span className="text-xs text-gray-500">Total Withdrawn</span>
                  <span className="text-sm font-bold text-gray-900">
                    {money(totalWithdrawn)}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <span className="text-xs text-gray-500">Receivable</span>
                  <span className="text-sm font-bold text-gray-900">
                    {money(totalReceivable)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
