import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { requireModuleAccess } from '@/lib/rbac'
import { ZakatPageClient } from '@/components/zakat/ZakatPageClient'
import { recomputeCashSetting } from '@/lib/cashBalance'
import { DISPLAY_CURRENCY_KEY, formatCurrencyAmount, normalizeDisplayCurrency } from '@/lib/currency'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

const NISAB_KEY = 'NISAB_VALUE'
const REWARD_EPSILON = 0.01

type BucketRow = {
  id: string
  bucketId: string
  periodIndex: number
  label?: string | null
  currency: string
  balance: number
  haulStartDate: string
  lastZakatPaidDate?: string | null
  haulCompleteDate: string
  idleBase: number
  receiptsTotal: number
  zakatDue: number
   isPaid: boolean
  haulCompleted: boolean
  source: string
  sourceGroup: string
  sourceType: string
  rowKind?: 'PROFIT' | 'COMMISSION' | 'IDLE' | 'PRINCIPAL' | 'RECEIPT' | 'REWARD'
  why?: string | null
  lastPayment: null | {
    id: string
    date: string
    amount: number
  }
  dueReceipts: Array<{
    date: string
    amount: number
    type: string
    investmentName?: string | null
  }>
}

const addDays = (date: Date, days: number) => {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

const addMonths = (date: Date, months: number) => {
  const next = new Date(date)
  next.setMonth(next.getMonth() + months)
  return next
}

const diffDaysFloor = (start: Date, end: Date) => {
  const startTime = start.getTime()
  const endTime = end.getTime()
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return 0
  const diffMs = endTime - startTime
  if (diffMs <= 0) return 0
  return Math.floor(diffMs / (1000 * 60 * 60 * 24))
}

const getLastCompletedHawlAnchor = (initialAnchor: Date, referenceDate: Date) => {
  const start = new Date(initialAnchor.getFullYear(), initialAnchor.getMonth(), initialAnchor.getDate())
  const ref = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate())
  const elapsed = diffDaysFloor(start, ref)
  if (elapsed < 354) return start
  const completedCycles = Math.floor(elapsed / 354)
  return addDays(start, completedCycles * 354)
}

const receiptTypes = new Set([
  'WITHDRAW_PROFIT',
  'WITHDRAW_PRINCIPAL',
  'ROLLBACK_PRINCIPAL',
  'SELL_RECEIPT',
])

const hawlOutflowTypes = new Set([
  'CASH_OUT',
  'INVEST_OUT',
  'DEBT_OUT',
])

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

const toNonNegativeNumber = (value: unknown) => {
  const num = Number(value)
  if (!Number.isFinite(num)) return 0
  return Math.max(0, num)
}

const getExpectedSavingsRewardTotal = (metadata: any, paymentEntries: any[]) => {
  const normalizedEntries = (Array.isArray(paymentEntries) ? paymentEntries : [])
  const rewardFromPayments = normalizedEntries
    .reduce((sum: number, p: any) => sum + toNonNegativeNumber(p?.reward), 0)
  const rewardFromMeta = toNonNegativeNumber(metadata?.totalRewardPaid)
  const rewardFromLegacyConfig = toNonNegativeNumber(metadata?.totalReward)

  const rewardAmountPerMonth = toNonNegativeNumber(metadata?.rewardAmount)
  const monthlyContribution = toNonNegativeNumber(metadata?.monthlyContribution)
  const rewardProgram = String(metadata?.rewardProgram || '')
  const rewardPerMonth = rewardAmountPerMonth > 0
    ? rewardProgram === 'PERCENTAGE'
      ? monthlyContribution * (rewardAmountPerMonth / 100)
      : rewardAmountPerMonth
    : 0

  const receiptMonth = Math.max(0, Math.floor(toNonNegativeNumber(metadata?.receiptMonth)))
  const paidMonthsFromEntries = normalizedEntries
    .filter((p: any) => typeof p?.bucketId === 'string' && p.bucketId.length > 0)
    .length
  const paidMonthsFromMeta = Math.max(0, Math.floor(toNonNegativeNumber(metadata?.monthsPaid)))
  const scheduledRewardMonths = Math.max(paidMonthsFromEntries, paidMonthsFromMeta, receiptMonth)
  const rewardFromSchedule = rewardPerMonth * scheduledRewardMonths
  const normalizedLegacyReward = toNonNegativeNumber(rewardFromLegacyConfig)
  const rewardFromLegacyCapped = rewardPerMonth > 0 && rewardFromSchedule > 0
    ? Math.min(normalizedLegacyReward, Math.max(0, rewardFromSchedule))
    : normalizedLegacyReward

  return Math.max(
    rewardFromPayments,
    rewardFromMeta,
    rewardFromLegacyCapped,
    Number.isFinite(rewardFromSchedule) ? Math.max(0, rewardFromSchedule) : 0,
  )
}

const getPartnerSukukValueAt = (inv: any, participation: any, asOf: Date) => {
  const principal = Number.isFinite(participation?.investedAmount) ? Number(participation.investedAmount) : 0
  if (principal <= 0) return 0

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
  return principalOutstanding + receivable
}

export default async function ZakatPage() {
  await requireModuleAccess('zakat')
  const user = await getCurrentUser()
  if (!user) {
    redirect('/login')
  }
  const displayCurrencySetting = await prisma.systemSetting.findUnique({
    where: { key: DISPLAY_CURRENCY_KEY },
  })
  const displayCurrency = normalizeDisplayCurrency(displayCurrencySetting?.value)
  const money = (value: number) => formatCurrencyAmount(value, displayCurrency, 'SAR')

  const canAccess = user.role === 'OWNER' || user.role === 'PARTNER'
  if (!canAccess) {
    return (
      <div className="space-y-6">
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-xl shadow-md p-6 text-white">
          <h1 className="text-2xl font-bold">Zakat Dashboard</h1>
          <p className="text-sm text-slate-400 mt-1">You do not have access to Zakat.</p>
        </div>
      </div>
    )
  }

  if (user.role === 'PARTNER' && !user.personId) {
    return (
      <div className="space-y-6">
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-xl shadow-md p-6 text-white">
          <h1 className="text-2xl font-bold">Zakat Dashboard</h1>
          <p className="text-sm text-slate-400 mt-1">Partner is missing a person profile.</p>
        </div>
      </div>
    )
  }

  const nisabSetting = await prisma.systemSetting.findUnique({ where: { key: NISAB_KEY } })
  const nisabRaw = nisabSetting ? Number(nisabSetting.value) : null
  const nisabValue = nisabRaw !== null && Number.isFinite(nisabRaw) && nisabRaw > 0 ? nisabRaw : null

  const ownerPersonId = user.role === 'OWNER' ? (user.personId || null) : null
  const ownerResolvedSukukHawlStartByInvestmentId = new Map<string, Date>()
  const scopeKey = user.role === 'OWNER' ? 'OWNER' : user.personId!
  const nisabMetKey = `NISAB_MET_SINCE:${scopeKey}`

  if (user.role === 'PARTNER' && user.personId) {
    const cashAccount = await prisma.account.findFirst({
      where: { type: 'CASH', isActive: true },
      select: { id: true, currency: true },
    })

    const partnerBuckets = await prisma.cashBucket.findMany({
      where: {
        personId: user.personId,
        OR: [
          { label: null },
          {
            AND: [
              { NOT: { label: { startsWith: 'Debt •' } } },
              { NOT: { label: 'Partner Commission' } },
            ],
          },
        ],
      } as any,
      select: { balance: true },
    })

    const partnerBucketBalance = partnerBuckets.reduce((sum: number, b: any) => {
      const balance = Number(b?.balance)
      return sum + (Number.isFinite(balance) ? Math.max(0, balance) : 0)
    }, 0)

    if (partnerBucketBalance <= 0.0001) {
      const cashSetting = await prisma.systemSetting.findUnique({
        where: { key: `CASH_BALANCE:${user.personId}` },
        select: { value: true },
      })
      const settingBalance = Math.max(0, Number(cashSetting?.value || 0))

      let txNetBalance = 0
      let firstPositiveTxDate: Date | null = null
      if (cashAccount?.id) {
        const txScope = {
          accountId: cashAccount.id,
          personId: user.personId,
          NOT: { type: 'PARTNER_COMMISSION' },
        } as any

        const txAgg = await prisma.transaction.aggregate({
          where: txScope,
          _sum: { amount: true },
        })
        txNetBalance = Math.max(0, Number(txAgg?._sum?.amount || 0))

        const firstPositiveTx = await prisma.transaction.findFirst({
          where: { ...txScope, amount: { gt: 0 } },
          orderBy: { date: 'asc' },
          select: { date: true },
        })
        firstPositiveTxDate = firstPositiveTx?.date ? new Date(firstPositiveTx.date) : null
      }

      const recoverAmount = Math.max(settingBalance, txNetBalance)
      if (recoverAmount > 0.0001) {
        const anchorRaw =
          firstPositiveTxDate && !Number.isNaN(firstPositiveTxDate.getTime())
            ? firstPositiveTxDate
            : new Date()
        const anchorDate = new Date(anchorRaw.getFullYear(), anchorRaw.getMonth(), anchorRaw.getDate())

        await prisma.cashBucket.create({
          data: {
            label: 'Partner Legacy Cash Sync',
            currency: cashAccount?.currency || 'SAR',
            balance: recoverAmount,
            haulStartDate: anchorDate,
            excludeFromZakat: false,
            personId: user.personId,
            movements: {
              create: {
                investmentId: null,
                amount: recoverAmount,
                type: 'CASH_IN',
                date: anchorDate,
                notes: 'Auto-synced from legacy partner cash records',
              },
            },
          } as any,
        })

        await recomputeCashSetting(prisma, user.personId)
      }
    }
  }

  if (user.role === 'OWNER') {
    const savingsInvestments = await prisma.investment.findMany({
      where: { account: { type: 'CIRCLYS' } },
      select: {
        id: true,
        name: true,
        startDate: true,
        metadata: true,
        account: { select: { currency: true } },
      },
    })

    let rewardCashAdjusted = false
    let cachedCashAccountId: string | null | undefined
    const ensureCashAccountId = async (currency: string) => {
      if (cachedCashAccountId !== undefined) return cachedCashAccountId
      const cashAccount =
        (await prisma.account.findFirst({
          where: { type: 'CASH', isActive: true },
          select: { id: true },
        })) ??
        (await prisma.account.create({
          data: {
            name: 'Cash Balance',
            type: 'CASH',
            currency,
            description: 'Cash ledger account',
          },
          select: { id: true },
        }))
      cachedCashAccountId = cashAccount.id
      return cachedCashAccountId
    }

    for (const inv of savingsInvestments) {
      const metadata = parseMetadata(inv.metadata) || {}
      const payments = metadata?.payments && typeof metadata.payments === 'object' ? metadata.payments : {}
      const paymentEntries = Object.values(payments) as any[]
      const firstContributionFromPayments = paymentEntries
        .map((p: any) => {
          const d = new Date(p?.paidDate || p?.dueDate)
          return Number.isNaN(d.getTime()) ? null : d
        })
        .filter((d: Date | null): d is Date => Boolean(d))
        .sort((a: Date, b: Date) => a.getTime() - b.getTime())[0] || null

      const firstContributionFromBuckets = await prisma.cashBucket.findFirst({
        where: {
          label: { startsWith: `Circlys • ${inv.name} •` },
        },
        select: { haulStartDate: true },
        orderBy: { haulStartDate: 'asc' },
      })

      const firstContributionDateCandidates = [
        firstContributionFromPayments,
        toDate(firstContributionFromBuckets?.haulStartDate),
        toDate(inv.startDate),
      ]
        .filter((d: Date | null): d is Date => Boolean(d))
        .map((d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()))
        .sort((a: Date, b: Date) => a.getTime() - b.getTime())

      const firstContributionDate = firstContributionDateCandidates[0] || null

      const expectedRewardTotal = getExpectedSavingsRewardTotal(metadata, paymentEntries)
      const hasReceived = Boolean(metadata?.received?.date)
      const rewardBucketIdFromMeta =
        typeof metadata?.received?.rewardBucketId === 'string' ? metadata.received.rewardBucketId : null
      const normalizedTotalMonths = Math.max(0, Math.floor(toNonNegativeNumber(metadata?.totalMonths)))
      const paidMonthsFromEntries = paymentEntries
        .filter((p: any) => typeof p?.bucketId === 'string' && p.bucketId.length > 0)
        .length
      const paidMonthsFromMeta = Math.max(0, Math.floor(toNonNegativeNumber(metadata?.monthsPaid)))
      const paidMonths = Math.max(paidMonthsFromEntries, paidMonthsFromMeta)
      const rewardMatured = hasReceived && (
        normalizedTotalMonths > 0
          ? paidMonths >= normalizedTotalMonths
          : paidMonths > 0
      )
      const rewardSeedAnchor = firstContributionDate || toDate(inv.startDate) || new Date()
      const rewardDateRaw = normalizedTotalMonths > 0
        ? addMonths(rewardSeedAnchor, normalizedTotalMonths - 1)
        : (toDate(metadata?.received?.date) || rewardSeedAnchor)
      const rewardDate = new Date(
        rewardDateRaw.getFullYear(),
        rewardDateRaw.getMonth(),
        rewardDateRaw.getDate(),
      )
      const rewardAnchorDate = new Date(
        rewardSeedAnchor.getFullYear(),
        rewardSeedAnchor.getMonth(),
        rewardSeedAnchor.getDate(),
      )
      const rewardCurrency = inv.account?.currency || 'SAR'

      if (rewardMatured && expectedRewardTotal > REWARD_EPSILON) {
        const rewardBucket = await prisma.cashBucket.findFirst({
          where: {
            personId: null,
            OR: [
              ...(rewardBucketIdFromMeta ? [{ id: rewardBucketIdFromMeta }] : []),
              {
                label: `Circlys Reward Receipt • ${inv.name}`,
                movements: {
                  some: {
                    investmentId: inv.id,
                    type: 'CASH_IN',
                  },
                },
              },
            ],
          },
          include: {
            movements: {
              where: { type: 'CASH_IN' },
              select: { amount: true },
            },
          },
        })

        let resolvedRewardBucketId = rewardBucket?.id || rewardBucketIdFromMeta
        let creditedReward = (rewardBucket?.movements || []).reduce(
          (sum: number, m: any) => sum + toNonNegativeNumber(m?.amount),
          0,
        )

        if (!rewardBucket) {
          const createdRewardBucket = await prisma.cashBucket.create({
            data: {
              label: `Circlys Reward Receipt • ${inv.name}`,
              currency: rewardCurrency,
              balance: expectedRewardTotal,
              haulStartDate: rewardAnchorDate,
              excludeFromZakat: false,
              personId: null,
              movements: {
                create: {
                  investmentId: inv.id,
                  amount: expectedRewardTotal,
                  type: 'CASH_IN',
                  date: rewardDate,
                  notes: `Circlys reward receipt • ${inv.name}`,
                },
              },
            },
            select: { id: true },
          })

          resolvedRewardBucketId = createdRewardBucket.id
          creditedReward = expectedRewardTotal

          const cashAccountId = await ensureCashAccountId(rewardCurrency)
          if (cashAccountId) {
            await prisma.transaction.create({
              data: {
                accountId: cashAccountId,
                investmentId: inv.id,
                personId: null,
                type: 'CASH_IN',
                amount: expectedRewardTotal,
                date: rewardDate,
                description: `Circlys reward receipt • ${inv.name}`,
              },
            })
          }
          rewardCashAdjusted = true
        } else {
          await prisma.cashBucket.update({
            where: { id: rewardBucket.id },
            data: {
              haulStartDate: rewardAnchorDate,
              excludeFromZakat: false,
              personId: null,
            },
          })
        }

        const rewardShortfall = Math.max(0, expectedRewardTotal - creditedReward)
        if (resolvedRewardBucketId && rewardShortfall > REWARD_EPSILON) {
          await prisma.cashBucket.update({
            where: { id: resolvedRewardBucketId },
            data: { balance: { increment: rewardShortfall } },
          })

          await prisma.cashBucketMovement.create({
            data: {
              cashBucketId: resolvedRewardBucketId,
              investmentId: inv.id,
              amount: rewardShortfall,
              type: 'CASH_IN',
              date: rewardDate,
              notes: `Circlys reward reconciliation • ${inv.name}`,
            },
          })

          const cashAccountId = await ensureCashAccountId(rewardCurrency)
          if (cashAccountId) {
            await prisma.transaction.create({
              data: {
                accountId: cashAccountId,
                investmentId: inv.id,
                personId: null,
                type: 'CASH_IN',
                amount: rewardShortfall,
                date: rewardDate,
                description: `Circlys reward reconciliation • ${inv.name}`,
              },
            })
          }
          rewardCashAdjusted = true
        }

        if (
          resolvedRewardBucketId &&
          (
            rewardBucketIdFromMeta !== resolvedRewardBucketId ||
            Math.abs(toNonNegativeNumber(metadata?.received?.rewardAmount) - expectedRewardTotal) > REWARD_EPSILON
          )
        ) {
          await prisma.investment.update({
            where: { id: inv.id },
            data: {
              metadata: JSON.stringify({
                ...metadata,
                received: {
                  ...(metadata?.received && typeof metadata.received === 'object' ? metadata.received : {}),
                  rewardAmount: expectedRewardTotal,
                  rewardBucketId: resolvedRewardBucketId,
                },
              }),
            },
          })
        }
      } else if (hasReceived && expectedRewardTotal > REWARD_EPSILON) {
        // Reward not yet "matured" by paidMonths logic, but money WAS received.
        // Ensure the reward bucket exists, is visible for Zakat, and credited.
        const rewardBucket = await prisma.cashBucket.findFirst({
          where: {
            personId: null,
            OR: [
              ...(rewardBucketIdFromMeta ? [{ id: rewardBucketIdFromMeta }] : []),
              {
                label: `Circlys Reward Receipt • ${inv.name}`,
                movements: {
                  some: {
                    investmentId: inv.id,
                    type: 'CASH_IN',
                  },
                },
              },
            ],
          },
          include: {
            movements: {
              where: { type: 'CASH_IN' },
              select: { amount: true },
            },
          },
        })

        let resolvedRewardBucketId = rewardBucket?.id || rewardBucketIdFromMeta
        let creditedReward = (rewardBucket?.movements || []).reduce(
          (sum: number, m: any) => sum + toNonNegativeNumber(m?.amount),
          0,
        )

        if (!rewardBucket) {
          // Create the reward bucket so the reward money appears in Zakat
          const createdRewardBucket = await prisma.cashBucket.create({
            data: {
              label: `Circlys Reward Receipt • ${inv.name}`,
              currency: rewardCurrency,
              balance: expectedRewardTotal,
              haulStartDate: rewardAnchorDate,
              excludeFromZakat: false,
              personId: null,
              movements: {
                create: {
                  investmentId: inv.id,
                  amount: expectedRewardTotal,
                  type: 'CASH_IN',
                  date: rewardDate,
                  notes: `Circlys reward receipt • ${inv.name}`,
                },
              },
            },
            select: { id: true },
          })

          resolvedRewardBucketId = createdRewardBucket.id
          creditedReward = expectedRewardTotal

          const cashAccountId = await ensureCashAccountId(rewardCurrency)
          if (cashAccountId) {
            await prisma.transaction.create({
              data: {
                accountId: cashAccountId,
                investmentId: inv.id,
                personId: null,
                type: 'CASH_IN',
                amount: expectedRewardTotal,
                date: rewardDate,
                description: `Circlys reward receipt • ${inv.name}`,
              },
            })
          }
          rewardCashAdjusted = true
        } else {
          // Bucket exists — ensure it is NOT excluded from Zakat
          await prisma.cashBucket.update({
            where: { id: rewardBucket.id },
            data: {
              haulStartDate: rewardAnchorDate,
              excludeFromZakat: false,
              personId: null,
            },
          })
        }

        // Top up if shortfall
        const rewardShortfall = Math.max(0, expectedRewardTotal - creditedReward)
        if (resolvedRewardBucketId && rewardShortfall > REWARD_EPSILON) {
          await prisma.cashBucket.update({
            where: { id: resolvedRewardBucketId },
            data: { balance: { increment: rewardShortfall } },
          })

          await prisma.cashBucketMovement.create({
            data: {
              cashBucketId: resolvedRewardBucketId,
              investmentId: inv.id,
              amount: rewardShortfall,
              type: 'CASH_IN',
              date: rewardDate,
              notes: `Circlys reward reconciliation • ${inv.name}`,
            },
          })

          const cashAccountId = await ensureCashAccountId(rewardCurrency)
          if (cashAccountId) {
            await prisma.transaction.create({
              data: {
                accountId: cashAccountId,
                investmentId: inv.id,
                personId: null,
                type: 'CASH_IN',
                amount: rewardShortfall,
                date: rewardDate,
                description: `Circlys reward reconciliation • ${inv.name}`,
              },
            })
          }
          rewardCashAdjusted = true
        }

        // Keep metadata in sync
        if (
          resolvedRewardBucketId &&
          (
            rewardBucketIdFromMeta !== resolvedRewardBucketId ||
            Math.abs(toNonNegativeNumber(metadata?.received?.rewardAmount) - expectedRewardTotal) > REWARD_EPSILON
          )
        ) {
          await prisma.investment.update({
            where: { id: inv.id },
            data: {
              metadata: JSON.stringify({
                ...metadata,
                received: {
                  ...(metadata?.received && typeof metadata.received === 'object' ? metadata.received : {}),
                  rewardAmount: expectedRewardTotal,
                  rewardBucketId: resolvedRewardBucketId,
                },
              }),
            },
          })
        }
      }

      const receivedBucketId = typeof metadata?.received?.bucketId === 'string' ? metadata.received.bucketId : null
      if (receivedBucketId && firstContributionDate) {
        await prisma.cashBucket.updateMany({
          where: {
            id: receivedBucketId,
            label: { startsWith: 'Savings Receipt •' },
          },
          data: {
            haulStartDate: firstContributionDate,
            excludeFromZakat: false,
            personId: null,
          },
        })
      }

      if (firstContributionDate) {
        await prisma.cashBucket.updateMany({
          where: {
            label: { startsWith: 'Savings Receipt •' },
            movements: {
              some: {
                investmentId: inv.id,
                type: 'CASH_IN',
              },
            },
          },
          data: {
            haulStartDate: firstContributionDate,
            excludeFromZakat: false,
            personId: null,
          },
        })
      }

      const contributionBucketIds = paymentEntries
        .map((p: any) => p?.bucketId)
        .filter((id: any): id is string => typeof id === 'string' && !id.startsWith('post-receipt-'))

      if (contributionBucketIds.length > 0) {
        await prisma.cashBucket.updateMany({
          where: { id: { in: contributionBucketIds } },
          data: { excludeFromZakat: true },
        })
      }

      await prisma.cashBucket.updateMany({
        where: {
          label: { startsWith: `Circlys • ${inv.name} •` },
        },
        data: { excludeFromZakat: true },
      })
    }

    if (rewardCashAdjusted) {
      await recomputeCashSetting(prisma, null)
    }
  }

  // For every Sukuk investment held by the current viewer (owner OR partner),
  // determine correct hawl start:
  // - Prefer real funding allocations from ROSCA buckets
  //   (Savings Receipt and Circlys Reward Receipt buckets)
  // - Else prefer allocations from Sukuk principal receipt buckets (recycled principal)
  // - Fallback to CASH_INVEST/start date for manual cash funding
  // Persist anchor in metadata and keep receipt suppression only for fully depleted receipts.
  //
  // Partners get the exact same treatment as the owner here (scoped to their
  // own personId) so their sukuk principal/profit receipts inherit the
  // correct historical hawl anchor instead of resetting the zakat clock.
  const sukukAnchorScopePersonId = user.role === 'OWNER' ? ownerPersonId : user.personId!
  if (user.role === 'OWNER' || (user.role === 'PARTNER' && user.personId)) {
    const allSukukInvestments = await prisma.investment.findMany({
      where: { account: { type: 'SUKUK' } },
      select: { id: true, name: true, metadata: true, startDate: true },
    })

    const allSukukCashInvestTxs = await prisma.transaction.findMany({
      where: {
        type: 'CASH_INVEST',
        ...(sukukAnchorScopePersonId
          ? { OR: [{ personId: sukukAnchorScopePersonId }, { personId: null }] }
          : { personId: null }),
        investmentId: { not: null },
        investment: { account: { type: 'SUKUK' } },
      },
      select: { id: true, investmentId: true, amount: true, date: true },
    })

    const allSukukRoscaAllocations = allSukukInvestments.length
      ? await prisma.investmentBucketAllocation.findMany({
          where: {
            investmentId: { in: allSukukInvestments.map((inv: any) => inv.id) },
            cashBucket: {
              AND: [
                ...(sukukAnchorScopePersonId
                  ? [{ OR: [{ personId: sukukAnchorScopePersonId }, { personId: null }] }]
                  : [{ personId: null }]),
                {
                  OR: [
                    { label: { startsWith: 'Savings Receipt •' } },
                    { label: { startsWith: 'Circlys Reward Receipt •' } },
                    { label: { startsWith: 'Circlys •' } },
                  ],
                },
              ],
            },
          } as any,
          select: {
            investmentId: true,
            cashBucketId: true,
            haulStartDate: true,
            principalAllocated: true,
            principalRemaining: true,
            cashBucket: {
              select: {
                id: true,
                label: true,
                haulStartDate: true,
                balance: true,
                currency: true,
                movements: {
                  where: { type: 'CASH_IN' },
                  select: { amount: true, date: true },
                  orderBy: { date: 'asc' },
                },
              },
            },
          },
        })
      : []

    const allSukukInvestOutFundingAnchors = allSukukInvestments.length
      ? await prisma.cashBucketMovement.findMany({
          where: {
            investmentId: { in: allSukukInvestments.map((inv: any) => inv.id) },
            type: 'INVEST_OUT',
            cashBucket: {
              AND: [
                ...(sukukAnchorScopePersonId
                  ? [{ OR: [{ personId: sukukAnchorScopePersonId }, { personId: null }] }]
                  : [{ personId: null }]),
                {
                  OR: [
                    { label: { startsWith: 'Savings Receipt •' } },
                    { label: { startsWith: 'Circlys Reward Receipt •' } },
                    { label: { startsWith: 'Circlys •' } },
                    { label: { startsWith: 'Sukuk Principal •' } },
                    { label: { endsWith: ' Principal Receipt' } },
                  ],
                },
              ],
            },
          },
          select: {
            investmentId: true,
            date: true,
            cashBucket: {
              select: {
                label: true,
                haulStartDate: true,
              },
            },
          },
        })
      : []

    const allSukukPrincipalReceiptAllocations = allSukukInvestments.length
      ? await prisma.investmentBucketAllocation.findMany({
          where: {
            investmentId: { in: allSukukInvestments.map((inv: any) => inv.id) },
            cashBucket: {
              AND: [
                ...(sukukAnchorScopePersonId
                  ? [{ OR: [{ personId: sukukAnchorScopePersonId }, { personId: null }] }]
                  : [{ personId: null }]),
                {
                  OR: [
                    { label: { startsWith: 'Sukuk Principal •' } },
                    { label: { endsWith: ' Principal Receipt' } },
                  ],
                },
              ],
            },
          } as any,
          select: {
            investmentId: true,
            cashBucketId: true,
            haulStartDate: true,
            cashBucket: {
              select: {
                id: true,
                haulStartDate: true,
              },
            },
          },
        })
      : []

    const allOwnerRewardReceiptBuckets = await prisma.cashBucket.findMany({
      where: {
        ...(sukukAnchorScopePersonId
          ? { OR: [{ personId: sukukAnchorScopePersonId }, { personId: null }] }
          : { personId: null }),
        label: { startsWith: 'Circlys Reward Receipt •' },
      },
      select: {
        label: true,
        haulStartDate: true,
      },
    })

    const normalizeSavingsNameKey = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase()
    const rewardReceiptAnchorBySavingsName = new Map<string, Date>()
    for (const bucket of allOwnerRewardReceiptBuckets) {
      const label = typeof bucket?.label === 'string' ? bucket.label : ''
      const match = label.match(/^Circlys Reward Receipt • (.+)$/)
      const savingsNameRaw = match?.[1]?.trim()
      if (!savingsNameRaw) continue
      const savingsNameKey = normalizeSavingsNameKey(savingsNameRaw)
      if (!savingsNameKey) continue
      const rawAnchor = toDate(bucket?.haulStartDate)
      if (!rawAnchor || Number.isNaN(rawAnchor.getTime())) continue
      const anchorDay = new Date(rawAnchor.getFullYear(), rawAnchor.getMonth(), rawAnchor.getDate())
      const existing = rewardReceiptAnchorBySavingsName.get(savingsNameKey)
      if (!existing || anchorDay.getTime() < existing.getTime()) {
        rewardReceiptAnchorBySavingsName.set(savingsNameKey, anchorDay)
      }
    }

    const roscaAllocationsByInvestmentId = new Map<string, any[]>()
    for (const alloc of allSukukRoscaAllocations) {
      const investmentId = typeof alloc?.investmentId === 'string' ? alloc.investmentId : null
      if (!investmentId) continue
      const list = roscaAllocationsByInvestmentId.get(investmentId) || []
      list.push(alloc)
      roscaAllocationsByInvestmentId.set(investmentId, list)
    }

    const principalReceiptAllocationsByInvestmentId = new Map<string, any[]>()
    for (const alloc of allSukukPrincipalReceiptAllocations) {
      const investmentId = typeof alloc?.investmentId === 'string' ? alloc.investmentId : null
      if (!investmentId) continue
      const list = principalReceiptAllocationsByInvestmentId.get(investmentId) || []
      list.push(alloc)
      principalReceiptAllocationsByInvestmentId.set(investmentId, list)
    }

    const savingsRoscaInvestOutAnchorsByInvestmentId = new Map<string, Date[]>()
    const rewardRoscaInvestOutAnchorsByInvestmentId = new Map<string, Date[]>()
    const principalInvestOutAnchorsByInvestmentId = new Map<string, Date[]>()
    const savingsRoscaFundingDatesByInvestmentId = new Map<string, Date[]>()
    const rewardRoscaFundingDatesByInvestmentId = new Map<string, Date[]>()
    const principalFundingDatesByInvestmentId = new Map<string, Date[]>()
    const circlysSavingsNameKeysByInvestmentId = new Map<string, string[]>()
    for (const movement of allSukukInvestOutFundingAnchors) {
      const investmentId = typeof movement?.investmentId === 'string' ? movement.investmentId : null
      if (!investmentId) continue

      const label = typeof movement?.cashBucket?.label === 'string' ? movement.cashBucket.label : ''
      const circlysContributionMatch = label.match(/^Circlys • (.+?) • /)
      const circlysSavingsNameRaw = circlysContributionMatch?.[1]?.trim() || ''
      const circlysSavingsNameKey = circlysSavingsNameRaw ? normalizeSavingsNameKey(circlysSavingsNameRaw) : ''
      if (circlysSavingsNameKey) {
        const existingNames = circlysSavingsNameKeysByInvestmentId.get(investmentId) || []
        if (!existingNames.includes(circlysSavingsNameKey)) {
          existingNames.push(circlysSavingsNameKey)
          circlysSavingsNameKeysByInvestmentId.set(investmentId, existingNames)
        }
      }
      const rawAnchor = toDate(movement?.cashBucket?.haulStartDate)
      if (!rawAnchor || Number.isNaN(rawAnchor.getTime())) continue
      const anchor = new Date(rawAnchor.getFullYear(), rawAnchor.getMonth(), rawAnchor.getDate())
      const movementRawDate = toDate((movement as any)?.date)
      const movementDay =
        movementRawDate && !Number.isNaN(movementRawDate.getTime())
          ? new Date(movementRawDate.getFullYear(), movementRawDate.getMonth(), movementRawDate.getDate())
          : null

      const isSavingsRoscaFunding = label.startsWith('Savings Receipt •')
      const isRewardRoscaFunding = label.startsWith('Circlys Reward Receipt •')
      const isPrincipalFunding =
        label.startsWith('Sukuk Principal •') ||
        label.endsWith(' Principal Receipt')

      if (isSavingsRoscaFunding) {
        const list = savingsRoscaInvestOutAnchorsByInvestmentId.get(investmentId) || []
        list.push(anchor)
        savingsRoscaInvestOutAnchorsByInvestmentId.set(investmentId, list)
        if (movementDay) {
          const dateList = savingsRoscaFundingDatesByInvestmentId.get(investmentId) || []
          dateList.push(movementDay)
          savingsRoscaFundingDatesByInvestmentId.set(investmentId, dateList)
        }
      }

      if (isRewardRoscaFunding) {
        const list = rewardRoscaInvestOutAnchorsByInvestmentId.get(investmentId) || []
        list.push(anchor)
        rewardRoscaInvestOutAnchorsByInvestmentId.set(investmentId, list)
        if (movementDay) {
          const dateList = rewardRoscaFundingDatesByInvestmentId.get(investmentId) || []
          dateList.push(movementDay)
          rewardRoscaFundingDatesByInvestmentId.set(investmentId, dateList)
        }
      }

      if (isPrincipalFunding) {
        const list = principalInvestOutAnchorsByInvestmentId.get(investmentId) || []
        list.push(anchor)
        principalInvestOutAnchorsByInvestmentId.set(investmentId, list)
        if (movementDay) {
          const dateList = principalFundingDatesByInvestmentId.get(investmentId) || []
          dateList.push(movementDay)
          principalFundingDatesByInvestmentId.set(investmentId, dateList)
        }
      }
    }

    const firstCashInvestDayByInvestmentId = new Map<string, Date>()
    for (const tx of allSukukCashInvestTxs) {
      const investmentId = typeof tx?.investmentId === 'string' ? tx.investmentId : null
      if (!investmentId) continue
      const rawDate = tx?.date instanceof Date ? tx.date : new Date(tx?.date as any)
      if (Number.isNaN(rawDate.getTime())) continue
      const txDay = new Date(rawDate.getFullYear(), rawDate.getMonth(), rawDate.getDate())
      const existing = firstCashInvestDayByInvestmentId.get(investmentId)
      if (!existing || txDay.getTime() < existing.getTime()) {
        firstCashInvestDayByInvestmentId.set(investmentId, txDay)
      }
    }

    for (const sukukInv of allSukukInvestments) {
      const firstCashInvestDay = firstCashInvestDayByInvestmentId.get(sukukInv.id) || null
      const fallbackRaw = firstCashInvestDay ?? sukukInv.startDate
      if (!fallbackRaw) continue
      const fallbackDate = fallbackRaw instanceof Date ? fallbackRaw : new Date(fallbackRaw as any)
      if (Number.isNaN(fallbackDate.getTime())) continue
      const fallbackDay = new Date(fallbackDate.getFullYear(), fallbackDate.getMonth(), fallbackDate.getDate())

      const roscaAllocations = roscaAllocationsByInvestmentId.get(sukukInv.id) || []
      const principalReceiptAllocations = principalReceiptAllocationsByInvestmentId.get(sukukInv.id) || []
      const savingsRoscaAnchorFromAllocations = roscaAllocations
        .filter((alloc: any) => {
          const label = typeof alloc?.cashBucket?.label === 'string' ? alloc.cashBucket.label : ''
          return label.startsWith('Savings Receipt •')
        })
        .map((alloc: any) => toDate(alloc?.haulStartDate || alloc?.cashBucket?.haulStartDate))
        .filter((d: Date | null): d is Date => Boolean(d && !Number.isNaN(d.getTime())))
        .map((d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()))
      const rewardRoscaAnchorFromAllocations = roscaAllocations
        .filter((alloc: any) => {
          const label = typeof alloc?.cashBucket?.label === 'string' ? alloc.cashBucket.label : ''
          return label.startsWith('Circlys Reward Receipt •')
        })
        .map((alloc: any) => toDate(alloc?.haulStartDate || alloc?.cashBucket?.haulStartDate))
        .filter((d: Date | null): d is Date => Boolean(d && !Number.isNaN(d.getTime())))
        .map((d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()))
      const savingsRoscaAnchorFromInvestOut = savingsRoscaInvestOutAnchorsByInvestmentId.get(sukukInv.id) || []
      const rewardRoscaAnchorFromInvestOut = rewardRoscaInvestOutAnchorsByInvestmentId.get(sukukInv.id) || []
      const savingsRoscaAnchors = [...savingsRoscaAnchorFromAllocations, ...savingsRoscaAnchorFromInvestOut]
        .sort((a: Date, b: Date) => a.getTime() - b.getTime())
      const rewardRoscaAnchors = [...rewardRoscaAnchorFromAllocations, ...rewardRoscaAnchorFromInvestOut]
        .sort((a: Date, b: Date) => a.getTime() - b.getTime())
      const circlysContributionNameKeysFromAllocations = Array.from(new Set(
        roscaAllocations
          .map((alloc: any) => {
            const label = typeof alloc?.cashBucket?.label === 'string' ? alloc.cashBucket.label : ''
            const match = label.match(/^Circlys • (.+?) • /)
            const raw = match?.[1]?.trim() || ''
            return raw ? normalizeSavingsNameKey(raw) : null
          })
          .filter((nameKey: string | null): nameKey is string => Boolean(nameKey))
      ))
      const circlysContributionNameKeysFromMovements = circlysSavingsNameKeysByInvestmentId.get(sukukInv.id) || []
      const circlysContributionNameKeys = Array.from(
        new Set([...circlysContributionNameKeysFromAllocations, ...circlysContributionNameKeysFromMovements]),
      )
      const relatedRewardReceiptAnchors = circlysContributionNameKeys
        .map((nameKey: string) => rewardReceiptAnchorBySavingsName.get(nameKey) || null)
        .filter((d: Date | null): d is Date => Boolean(d))
        .sort((a: Date, b: Date) => a.getTime() - b.getTime())
      const sameNameRewardAnchor = rewardReceiptAnchorBySavingsName.get(
        normalizeSavingsNameKey(typeof sukukInv?.name === 'string' ? sukukInv.name : ''),
      ) || null

      const principalAnchorFromAllocations = principalReceiptAllocations
        .map((alloc: any) => toDate(alloc?.haulStartDate || alloc?.cashBucket?.haulStartDate))
        .filter((d: Date | null): d is Date => Boolean(d && !Number.isNaN(d.getTime())))
        .map((d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()))
      const principalAnchorFromInvestOut = principalInvestOutAnchorsByInvestmentId.get(sukukInv.id) || []
      const principalReceiptAnchors = [...principalAnchorFromAllocations, ...principalAnchorFromInvestOut]
        .sort((a: Date, b: Date) => a.getTime() - b.getTime())

      const existingMeta = parseMetadata(sukukInv.metadata) || {}
      const existingSavingsAnchorRaw = toDate(existingMeta?.savingsHaulStartDate)
      const existingSavingsAnchor = existingSavingsAnchorRaw && !Number.isNaN(existingSavingsAnchorRaw.getTime())
        ? new Date(
            existingSavingsAnchorRaw.getFullYear(),
            existingSavingsAnchorRaw.getMonth(),
            existingSavingsAnchorRaw.getDate(),
          )
        : null

      const sukukStartRaw = toDate(sukukInv.startDate)
      const sukukStartDay = sukukStartRaw && !Number.isNaN(sukukStartRaw.getTime())
        ? new Date(sukukStartRaw.getFullYear(), sukukStartRaw.getMonth(), sukukStartRaw.getDate())
        : fallbackDay

      const rewardRoscaAnchor = rewardRoscaAnchors[0] || relatedRewardReceiptAnchors[0] || sameNameRewardAnchor || null
      const savingsRoscaAnchor = savingsRoscaAnchors[0] || null
      const principalReceiptAnchor = principalReceiptAnchors.length > 0
        ? principalReceiptAnchors[principalReceiptAnchors.length - 1]
        : null
      const savingsFundingDates = (savingsRoscaFundingDatesByInvestmentId.get(sukukInv.id) || [])
        .sort((a: Date, b: Date) => a.getTime() - b.getTime())
      const rewardFundingDates = (rewardRoscaFundingDatesByInvestmentId.get(sukukInv.id) || [])
        .sort((a: Date, b: Date) => a.getTime() - b.getTime())
      const principalFundingDates = (principalFundingDatesByInvestmentId.get(sukukInv.id) || [])
        .sort((a: Date, b: Date) => a.getTime() - b.getTime())
      const savingsReferenceDay = savingsFundingDates.length > 0
        ? savingsFundingDates[savingsFundingDates.length - 1]
        : fallbackDay
      const rewardReferenceDay = rewardFundingDates.length > 0
        ? rewardFundingDates[rewardFundingDates.length - 1]
        : fallbackDay
      const principalReferenceDay = principalFundingDates.length > 0
        ? principalFundingDates[principalFundingDates.length - 1]
        : fallbackDay

      // ROSCA anchor rules:
      // - Resolve reward/savings/principal anchors to the latest completed cycle at funding time.
      // - This preserves continuity while preventing old pre-completion starts from leaking into
      //   post-completion Sukuk hawl timelines.
      const hawlStart =
        rewardRoscaAnchor
          ? getLastCompletedHawlAnchor(rewardRoscaAnchor, rewardReferenceDay)
          : savingsRoscaAnchor
            ? getLastCompletedHawlAnchor(savingsRoscaAnchor, savingsReferenceDay)
            : principalReceiptAnchor
              ? principalReceiptAnchor
              : (existingSavingsAnchor || fallbackDay)

      ownerResolvedSukukHawlStartByInvestmentId.set(sukukInv.id, hawlStart)

      // Persist hawl start in investment metadata
      const hawlIso = hawlStart.toISOString().split('T')[0]
      if (existingMeta?.savingsHaulStartDate !== hawlIso) {
        await prisma.investment.update({
          where: { id: sukukInv.id },
          data: { metadata: JSON.stringify({ ...existingMeta, savingsHaulStartDate: hawlIso }) },
        })
      }

    }

    // DO NOT exclude ROSCA receipt buckets from Zakat.
    // They must always show hawl 1 completed row even after full investment.
    // Reinvestment tracking (investOutEvents barrier) prevents double counting instead.
  }

  const buckets = await prisma.cashBucket.findMany({
    where: {
      AND: [
        {
          OR: [
            { excludeFromZakat: false },
            // Always include ROSCA receipt buckets regardless of excludeFromZakat flag
            // because they need to show hawl 1 completed row even after full investment
            { label: { startsWith: 'Savings Receipt •' } },
            { label: { startsWith: 'Circlys Reward Receipt •' } },
          ],
        },
        ...(user.role === 'OWNER'
          ? [
              {
                OR: [
                  { personId: null },
                  { personId: ownerPersonId },
                ],
              },
            ]
          : [
              {
                personId: user.personId,
                OR: [
                  { label: null },
                  {
                    AND: [
                      { NOT: { label: 'Partner Commission' } },
                      { NOT: { label: { startsWith: 'Debt •' } } },
                      { NOT: { label: { startsWith: 'Debt Refund •' } } },
                    ],
                  },
                ],
              },
            ]),
      ],
    },
    include: {
      movements: {
        orderBy: { date: 'asc' },
        include: {
          investment: {
            select: {
              id: true,
              name: true,
              isIjarah: true,
              startDate: true,
              reopenedAt: true,
              category: true,
              metadata: true,
            },
          },
        },
      },
      allocations: {
        include: {
          investment: {
            select: { id: true, name: true, principalAmount: true, account: { select: { type: true } } },
          },
        },
      },
    },
  })

  // Create global payments array from all buckets for cross-bucket zakat payment detection
  const allPayments = buckets.flatMap((bucket: any) => 
    Array.isArray(bucket.movements) 
      ? bucket.movements.filter((m: any) => m?.type === 'ZAKAT_PAID')
      : []
  )

  const totalZakatableWealth = buckets.reduce((sum: number, b: any) => {
    const balance = Number(b.balance)
    return sum + (Number.isFinite(balance) ? Math.max(0, balance) : 0)
  }, 0)

  const now = new Date()
  let sukukValueForNisab = 0
  if (user.role === 'PARTNER' && user.personId) {
    const participations = await prisma.dealParticipant.findMany({
      where: {
        personId: user.personId,
        investment: {
          account: { type: 'SUKUK' },
        },
      },
      select: {
        investedAmount: true,
        acquiredAt: true,
        commissionFees: true,
        personId: true,
        investment: {
          select: {
            id: true,
            startDate: true,
            maturityDate: true,
            interestRate: true,
            fees: true,
            principalAmount: true,
            receivableAmount: true,
            transactions: {
              where: {
                type: { in: ['WITHDRAW_PROFIT', 'WITHDRAW_PRINCIPAL', 'BUY_FROM_PARTNER'] },
                OR: [{ personId: user.personId }, { personId: null }],
              },
              select: { type: true, date: true, amount: true, personId: true, metadata: true },
              orderBy: { date: 'asc' },
            },
          },
        },
      },
    })

    sukukValueForNisab = participations.reduce((sum: number, p: any) => {
      return sum + getPartnerSukukValueAt(p.investment, p, now)
    }, 0)

    // Some sukuk deals are created entirely for a partner (funded and
    // withdrawn via personId-tagged transactions and a partnerCommissionPlan
    // in metadata) without ever getting a DealParticipant row, so they never
    // show up in the query above. Find those and value them the same way,
    // using a synthetic participation covering the full deal.
    const legacyPartnerSukuk = await prisma.investment.findMany({
      where: {
        account: { type: 'SUKUK' },
        dealParticipants: { none: {} },
        transactions: { some: { personId: user.personId } },
      },
      select: {
        id: true,
        startDate: true,
        maturityDate: true,
        interestRate: true,
        fees: true,
        principalAmount: true,
        receivableAmount: true,
        transactions: {
          where: {
            type: { in: ['WITHDRAW_PROFIT', 'WITHDRAW_PRINCIPAL', 'BUY_FROM_PARTNER'] },
            OR: [{ personId: user.personId }, { personId: null }],
          },
          select: { type: true, date: true, amount: true, personId: true, metadata: true },
          orderBy: { date: 'asc' },
        },
      },
    })

    sukukValueForNisab += legacyPartnerSukuk.reduce((sum: number, inv: any) => {
      const syntheticParticipation = {
        investedAmount: inv.principalAmount,
        acquiredAt: inv.startDate,
        commissionFees: 0,
        personId: user.personId,
      }
      return sum + getPartnerSukukValueAt(inv, syntheticParticipation, now)
    }, 0)
  }

  if (user.role === 'OWNER') {
    const investments = await prisma.investment.findMany({
      where: {
        account: { type: 'SUKUK' },
      },
      select: {
        id: true,
        principalAmount: true,
        startDate: true,
        maturityDate: true,
        interestRate: true,
        fees: true,
        receivableAmount: true,
        metadata: true,
        dealParticipants: {
          select: { personId: true, investedAmount: true, acquiredAt: true, commissionFees: true },
        },
        transactions: {
          where: {
            type: { in: ['WITHDRAW_PROFIT', 'WITHDRAW_PRINCIPAL'] },
          },
          select: { type: true, date: true, amount: true, personId: true },
          orderBy: { date: 'asc' },
        },
      },
    })

    const getOwnerPosition = (inv: any) => {
      if (!ownerPersonId) return null
      const dps = Array.isArray(inv.dealParticipants) ? inv.dealParticipants : []
      return dps.find((p: any) => p?.personId === ownerPersonId) || null
    }

    // Deals created entirely for a partner (funded/withdrawn via
    // personId-tagged transactions and a partnerCommissionPlan in metadata)
    // without a DealParticipant row should NOT count as the owner's own
    // sukuk principal for zakat purposes.
    const isPartnerOnlyLegacyDeal = (inv: any) => {
      let meta: any = null
      try {
        meta = typeof inv?.metadata === 'string' ? JSON.parse(inv.metadata) : inv?.metadata
      } catch {
        meta = null
      }
      if (meta?.partnerCommissionPlan) return true
      const txs = Array.isArray(inv?.transactions) ? inv.transactions : []
      return txs.some((tx: any) => tx?.personId && tx.personId !== ownerPersonId)
    }

    sukukValueForNisab = investments.reduce((sum: number, inv: any) => {
      const pos = getOwnerPosition(inv)
      const participants = Array.isArray(inv.dealParticipants) ? inv.dealParticipants : []
      if (!pos && participants.length === 0 && isPartnerOnlyLegacyDeal(inv)) return sum
      const principal = pos ? (Number(pos.investedAmount) || 0) : (Number(inv.principalAmount) || 0)
      if (principal <= 0) return sum

      const totalMonths = getPeriodMonths(inv.startDate, inv.maturityDate)
      const periodYears = totalMonths ? totalMonths / 12 : 0
      const apr = Number(inv.interestRate) || 0
      const fees = Number(inv.fees) || 0
      const manualReceivable = Number.isFinite(inv.receivableAmount) ? Number(inv.receivableAmount) : null
      const totalProfit = manualReceivable !== null && manualReceivable > 0
        ? manualReceivable
        : Math.max(0, (principal * (apr / 100) * periodYears) - fees)

      const start = toDate(inv.startDate)
      const maturity = toDate(inv.maturityDate)
      const startTime = start?.getTime() || 0
      const maturityTime = maturity?.getTime() || 0
      const totalMs = maturityTime > startTime ? maturityTime - startTime : 0
      const atMs = now.getTime()
      const elapsedMs = totalMs > 0
        ? Math.min(Math.max(atMs - startTime, 0), totalMs)
        : (atMs > startTime ? 1 : 0)
      const accruedProfit = totalMs > 0
        ? totalProfit * (elapsedMs / totalMs)
        : (atMs > startTime ? totalProfit : 0)

      const txs = Array.isArray(inv.transactions) ? inv.transactions : []
      const isOwnerTx = (tx: any) => {
        if (!ownerPersonId) return true
        return tx?.personId === ownerPersonId || tx?.personId == null
      }
      const withdrawnProfit = txs
        .filter((tx: any) => tx?.type === 'WITHDRAW_PROFIT' && isOwnerTx(tx))
        .filter((tx: any) => {
          const d = tx?.date instanceof Date ? tx.date : new Date(tx?.date)
          return !Number.isNaN(d.getTime()) && d.getTime() <= atMs
        })
        .reduce((s: number, tx: any) => s + Math.abs(Number(tx?.amount) || 0), 0)

      const withdrawnPrincipal = txs
        .filter((tx: any) => tx?.type === 'WITHDRAW_PRINCIPAL' && isOwnerTx(tx))
        .filter((tx: any) => {
          const d = tx?.date instanceof Date ? tx.date : new Date(tx?.date)
          return !Number.isNaN(d.getTime()) && d.getTime() <= atMs
        })
        .reduce((s: number, tx: any) => s + Math.abs(Number(tx?.amount) || 0), 0)

      const principalOutstanding = Math.max(0, principal - withdrawnPrincipal)
      const receivable = Math.max(0, accruedProfit - withdrawnProfit)
      return sum + principalOutstanding + receivable
    }, 0)
  }

  const totalZakatableWealthForNisab = totalZakatableWealth + sukukValueForNisab

  const nisabConfigured = nisabValue !== null
  const thresholdMet = nisabConfigured ? totalZakatableWealthForNisab >= nisabValue : false
  const nisabMetSetting = await prisma.systemSetting.findUnique({ where: { key: nisabMetKey } })
  const nisabMetSince = nisabMetSetting?.value ? new Date(nisabMetSetting.value) : null

  // Haul starts when nisab is met, and restarts when wealth drops below nisab.
  // We persist the crossing time to keep haul-year stable.
  if (nisabConfigured && thresholdMet) {
    if (!nisabMetSince || Number.isNaN(nisabMetSince.getTime())) {
      const now = new Date()
      const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      await prisma.systemSetting.upsert({
        where: { key: nisabMetKey },
        update: { value: dayStart.toISOString() },
        create: {
          key: nisabMetKey,
          value: dayStart.toISOString(),
          description: 'When nisab threshold was met for zakat haul start',
        },
      })
    }
  } else if (nisabMetSetting) {
    await prisma.systemSetting.delete({ where: { key: nisabMetKey } })
  }

  const effectiveNisabStart = nisabConfigured && thresholdMet
    ? (nisabMetSince && !Number.isNaN(nisabMetSince.getTime()) ? nisabMetSince : new Date())
    : null

  const zakatEnabled = Boolean(effectiveNisabStart)

  const investmentIds = Array.from(
    new Set(
      buckets
        .flatMap((b: any) => Array.isArray(b.movements) ? b.movements : [])
        .map((m: any) => (typeof m.investmentId === 'string' ? m.investmentId : null))
        .filter((id: string | null): id is string => Boolean(id)),
    ),
  )

  const investments = investmentIds.length
    ? await prisma.investment.findMany({
        where: { id: { in: investmentIds } },
        select: {
          id: true,
          name: true,
          startDate: true,
          maturityDate: true,
          principalAmount: true,
          isIjarah: true,
          reopenedAt: true,
          category: true,
          metadata: true,
          account: { select: { type: true } },
        },
      })
    : []
  const investmentMap = new Map<string, any>(investments.map((inv: any) => [inv.id, inv]))

  const cashInvestTransactions = await prisma.transaction.findMany({
    where: {
      type: 'CASH_INVEST',
      ...(user.role === 'OWNER'
        ? (ownerPersonId
            ? { OR: [{ personId: ownerPersonId }, { personId: null }] }
            : { personId: null })
        : { personId: user.personId }),
    },
    select: { investmentId: true, amount: true, date: true },
  })

  const cashInvestByInvestmentId = new Map<string, Array<{ amount: number; date: Date }>>()
  for (const tx of cashInvestTransactions) {
    const investmentId = typeof tx?.investmentId === 'string' ? tx.investmentId : null
    if (!investmentId) continue
    const list = cashInvestByInvestmentId.get(investmentId) || []
    list.push({ amount: Math.abs(Number(tx.amount) || 0), date: tx.date })
    cashInvestByInvestmentId.set(investmentId, list)
  }

  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const isoDay = (d: Date) => startOfDay(d).toISOString().split('T')[0]
  const movementDay = (m: any) => {
    const d = m?.date instanceof Date ? m.date : new Date(m?.date)
    if (Number.isNaN(d.getTime())) return null
    return new Date(d.getFullYear(), d.getMonth(), d.getDate())
  }
  const movementAmount = (m: any) => {
    if (m?.type === 'SELL_RECEIPT') {
      const amount = Number(m?.amount || 0)
      const principal = Number(m?.principalReduction)
      if (!Number.isFinite(amount) || !Number.isFinite(principal)) return 0
      return Math.max(0, amount - principal)
    }
    const amount = Number(m?.amount || 0)
    return Number.isFinite(amount) ? amount : 0
  }

  const isReceiptMovement = (m: any, treatCashInAsReceipt: boolean) => {
    if (treatCashInAsReceipt && m?.type === 'CASH_IN') return true
    return receiptTypes.has(m?.type)
  }

  const hasDefaultOrWrittenOff = (inv: any) => {
    if (!inv) return true
    const metadata = parseMetadata(inv?.metadata)
    const category = inv?.category
    if (
      category === 'DEFAULT_LEGAL' ||
      category === 'WRITTEN_OFF' ||
      metadata?.recoveryStatus === 'DEFAULT_LEGAL' ||
      metadata?.recoveryStatus === 'WRITTEN_OFF'
    ) {
      return true
    }
    return false
  }

  const buildRowKey = (parts: string[]) => parts.join('|')
  const movementHasRowPaid = (payments: any[], rowKey: string) => {
    return payments.some((p) => typeof p?.notes === 'string' && p.notes.includes(`ZAKAT_ROW=${rowKey}`))
  }

  const getRowKind = (bucket: any, rowKey: string, dueReceipts: any[]) => {
    const label = typeof bucket?.label === 'string' ? bucket.label : ''
    if (label === 'Partner Commission') return 'COMMISSION' as const
    if (label.startsWith('Circlys Reward Receipt •')) return 'REWARD' as const
    if (label.startsWith('Savings Receipt •')) return 'RECEIPT' as const
    if (rowKey.startsWith('IDLE|') || rowKey.startsWith('DEPOSIT|')) return 'IDLE' as const
    const t = dueReceipts?.[0]?.type
    if (t === 'WITHDRAW_PRINCIPAL') return 'PRINCIPAL' as const
    if (t === 'WITHDRAW_PROFIT') return 'PROFIT' as const
    if (label.startsWith('Profit •')) return 'PROFIT' as const
    return 'PROFIT' as const
  }

  // Map of row IDs to their haul completion years (populated after rows are created)
  const rowYearMap = new Map<string, number>()

  const rawRows: BucketRow[] = buckets
    .flatMap((bucket: any): BucketRow[] => {
      const now = startOfDay(new Date())
      const bucketStart = new Date(bucket.haulStartDate)
      if (Number.isNaN(bucketStart.getTime())) return []

      const isProfitBucket = typeof bucket.label === 'string' && bucket.label.startsWith('Profit •')
      const isCommissionBucket = typeof bucket.label === 'string' && (bucket.label === 'Partner Commission' || bucket.label.startsWith('Partner Commission'))
      const isImmediateReceiptBucket = isProfitBucket || isCommissionBucket
      const isCirclys = typeof bucket.label === 'string' && bucket.label.startsWith('Circlys')
      const isSavingsContribution = typeof bucket.label === 'string' && bucket.label.startsWith('Circlys •') && !bucket.label.includes('Receipt')
      const isSavingsReceiptBucket =
        typeof bucket.label === 'string' &&
        (bucket.label.startsWith('Savings Receipt •') || bucket.label.startsWith('Circlys Reward Receipt •'))
      const isRewardReceiptBucket = typeof bucket.label === 'string' && bucket.label.startsWith('Circlys Reward Receipt •')

      const alloc = bucket.allocations?.[0]
      const source = alloc?.investment?.name || bucket.label || 'General'
      const sourceType = alloc?.investment?.account?.type || 'OTHER'
      const sourceGroup =
        isCirclys && bucket.label
          ? bucket.label.split(' \u2022 ').slice(0, 2).join(' \u2022 ')
          : source

      const displayBalance = Number(bucket.balance) || 0

      const payments = (Array.isArray(bucket.movements) ? bucket.movements : [])
        .filter((m: any) => m?.type === 'ZAKAT_PAID')
        .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
      const lastPayment = payments[0]

      const movements = Array.isArray(bucket.movements) ? bucket.movements : []
      const hawlOutflowEvents = movements
        .map((m: any) => {
          const movementType = typeof m?.type === 'string' ? m.type : ''
          if (!hawlOutflowTypes.has(movementType)) return null

          const day = movementDay(m)
          if (!day) return null

          const amount = Math.abs(Number(m?.amount) || 0)
          if (amount <= 0) return null

          return {
            time: day.getTime(),
            amount,
            type: movementType,
          }
        })
        .filter((x: { time: number; amount: number; type: string } | null): x is { time: number; amount: number; type: string } => Boolean(x))
      const sumHawlOutflowsBetween = (periodStart: Date, periodEnd: Date) => {
        const startTime = startOfDay(periodStart).getTime()
        const endTime = startOfDay(periodEnd).getTime()
        if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime < startTime) return 0

        return hawlOutflowEvents.reduce((sum: number, evt: { time: number; amount: number; type: string }) => {
          if (evt.time < startTime) return sum
          // Inclusive end boundary so same-day spend/withdrawal is treated as not held for full hawl.
          if (evt.time > endTime) return sum
          return sum + evt.amount
        }, 0)
      }
      const treatCashInAsReceipt = isImmediateReceiptBucket || isRewardReceiptBucket
      const receiptMovements = movements.filter((m: any) => {
        if (!isReceiptMovement(m, treatCashInAsReceipt)) return false
        if (isRewardReceiptBucket) {
          // Barrier: reward buckets should anchor from the original reward receipt only.
          // Do not start additional receipt/idle timelines from later non-CASH_IN movement types.
          return m?.type === 'CASH_IN'
        }
        return true
      })

      // RULE 1: Exclude savings contribution buckets from zakat calculation
      // They are just temporary tracking, not actual zakat buckets
      if (isSavingsContribution) {
        return []
      }

      // RULE 2: Savings Receipt buckets:
      // - If fully moved into Sukuk, bucket may be marked excludeFromZakat=true in DB → won't reach here
      // - Otherwise: first hawl is special receipt row from first contribution date
      if (isSavingsReceiptBucket) {
        const cashInMovement = movements.find((m: any) => m?.type === 'CASH_IN')
        if (!cashInMovement) return []

        const receiptDate = new Date(cashInMovement.date)
        if (Number.isNaN(receiptDate.getTime())) return []

        const totalReceived = Math.abs(Number(cashInMovement.amount) || 0)
        if (totalReceived <= 0) return []

        const bucketMetadata = parseMetadata(bucket?.metadata) || {}
        const rewardFirstContributionMeta = toDate(bucketMetadata?.firstContributionDate)
        const rewardFirstContributionFromInvestment = toDate(cashInMovement?.investment?.startDate)
        const firstHawlStartBase = isRewardReceiptBucket
          ? (rewardFirstContributionMeta || rewardFirstContributionFromInvestment || bucketStart)
          : bucketStart
        const firstHawlStart = startOfDay(firstHawlStartBase)
        const investmentName = isRewardReceiptBucket
          ? bucket.label.replace('Circlys Reward Receipt • ', '')
          : bucket.label.replace('Savings Receipt • ', '')
        const roscaLabelPrefix = isRewardReceiptBucket ? 'Circlys Reward Receipt' : 'Savings Receipt'
        const sourceGroupLabel = `${roscaLabelPrefix} • ${investmentName}`
        const savingsRows: BucketRow[] = []

        // Calculate Sukuk investments made during first hawl period
        const firstHaulEnd = addDays(firstHawlStart, 354)
        const sukukInvestedDuringFirstHawl = movements.reduce((sum: number, m: any) => {
          const movementType = typeof m?.type === 'string' ? m.type : ''
          if (movementType !== 'INVEST_OUT') return sum
          
          const invId = typeof m?.investmentId === 'string' ? m.investmentId : null
          const inv = invId ? investmentMap.get(invId) : null
          const invType = inv?.account?.type
          if (invType !== 'SUKUK') return sum
          
          const movementDate = m?.date instanceof Date ? m.date : new Date(m?.date)
          if (Number.isNaN(movementDate.getTime())) return sum
          
          // Only count investments made before first hawl completes
          if (movementDate.getTime() < firstHaulEnd.getTime()) {
            const amt = Math.abs(Number(m?.amount) || 0)
            return sum + amt
          }
          return sum
        }, 0)

        const allocatedSukukInvestmentIds = new Set(
          (Array.isArray(bucket.allocations) ? bucket.allocations : [])
            .map((alloc: any) => (typeof alloc?.investment?.id === 'string' ? alloc.investment.id : null))
            .filter((id: string | null): id is string => Boolean(id)),
        )

        const sukukInvestedByMetadata = allocatedSukukInvestmentIds.size > 0
          ? investments.reduce((sum: number, inv: any) => {
              if (inv?.account?.type !== 'SUKUK') return sum
              if (!allocatedSukukInvestmentIds.has(inv.id as string)) return sum

              const meta = parseMetadata(inv?.metadata)
              const savingsStart = toDate(meta?.savingsHaulStartDate)
              if (!savingsStart || Number.isNaN(savingsStart.getTime())) return sum
              if (isoDay(startOfDay(savingsStart)) !== isoDay(firstHawlStart)) return sum

              const investTxs = cashInvestByInvestmentId.get(inv.id) || []
              const investedInFirstHawl = investTxs.reduce((txSum: number, tx: { amount: number; date: Date }) => {
                const d = tx.date instanceof Date ? tx.date : new Date(tx.date as any)
                if (Number.isNaN(d.getTime())) return txSum
                if (d.getTime() >= firstHaulEnd.getTime()) return txSum
                const amt = Math.abs(Number(tx.amount) || 0)
                return txSum + (Number.isFinite(amt) ? amt : 0)
              }, 0)

              return sum + investedInFirstHawl
            }, 0)
          : 0

        const effectiveSukukInvested = Math.max(sukukInvestedDuringFirstHawl, sukukInvestedByMetadata)

        // First hawl: ROSCA Hawl 1 from first contribution to receipt completion.
        // Only amount still held through hawl completion is zakatable.
        const firstHaulCompleted = now.getTime() >= firstHaulEnd.getTime()
        const firstRowKey = buildRowKey(['ROSCA_RECEIPT', isRewardReceiptBucket ? 'REWARD' : 'SAVINGS', bucket.id])
        const firstIsPaid = movementHasRowPaid(allPayments, firstRowKey)
        const firstHawlStartTime = startOfDay(firstHawlStart).getTime()
        const firstHawlEndTime = startOfDay(firstHaulEnd).getTime()
        const outflowsBeforeFirstHawlEnd = hawlOutflowEvents.reduce(
          (sum: number, evt: { time: number; amount: number; type: string }) => {
            if (evt.time < firstHawlStartTime) return sum
            if (evt.time > firstHawlEndTime) return sum

            // Savings rollover to Sukuk on hawl-end day starts the next cycle; keep Hawl 1 visible.
            if (!isRewardReceiptBucket && evt.time === firstHawlEndTime && evt.type === 'INVEST_OUT') return sum

            return sum + evt.amount
          },
          0,
        )
        const withdrawnBeforeFirstHawlEnd = Math.max(
          effectiveSukukInvested,
          outflowsBeforeFirstHawlEnd,
        )
        const firstHawlZakatBase = Math.max(0, totalReceived - withdrawnBeforeFirstHawlEnd)
        if (firstHawlZakatBase > 0.01) {
          const firstZakatDue = !firstIsPaid && firstHaulCompleted && firstHawlZakatBase > 0 ? firstHawlZakatBase * 0.025 : 0

          savingsRows.push({
            id: firstRowKey,
            bucketId: bucket.id,
            periodIndex: 0,
            label: `${roscaLabelPrefix} • ${investmentName}`,
            currency: bucket.currency,
            balance: firstHawlZakatBase,
            haulStartDate: isoDay(firstHawlStart),
            lastZakatPaidDate: bucket.lastZakatPaidDate
              ? bucket.lastZakatPaidDate.toISOString().split('T')[0]
              : null,
            haulCompleteDate: isoDay(firstHaulEnd),
            idleBase: 0,
            receiptsTotal: firstHawlZakatBase,
            zakatDue: firstZakatDue,
            isPaid: firstIsPaid,
            haulCompleted: firstHaulCompleted,
            source: investmentName,
            sourceGroup: sourceGroupLabel,
            sourceType: 'CIRCLYS',
            rowKind: isRewardReceiptBucket ? ('REWARD' as const) : ('RECEIPT' as const),
            why: withdrawnBeforeFirstHawlEnd > 0
              ? `ROSCA Hawl 1: ${bucket.currency} ${totalReceived.toLocaleString()} received from ${isoDay(firstHawlStart)} to ${isoDay(firstHaulEnd)}. ${withdrawnBeforeFirstHawlEnd.toLocaleString()} withdrawn/spent before hawl completion. Zakatable: ${firstHawlZakatBase.toLocaleString()}.`
              : `ROSCA Hawl 1: Receipt ${bucket.currency} ${totalReceived.toLocaleString()} from ${isoDay(firstHawlStart)} to ${isoDay(firstHaulEnd)}`,
            lastPayment: lastPayment
              ? {
                  id: lastPayment.id,
                  date: new Date(lastPayment.date).toISOString().split('T')[0],
                  amount: Math.abs(Number(lastPayment.amount || 0)),
                }
              : null,
            dueReceipts: [{
              date: isoDay(receiptDate),
              amount: firstHawlZakatBase,
              type: 'CASH_IN',
              investmentName,
            }],
          })
        }

        // After first hawl, continue the same hawl timeline.
        // If part of savings was moved into Sukuk principal, continue that portion under Sukuk.
        // Use totalReceived as the base, not currentBalance (which would double-count)
        const baseForSecondAndLater = totalReceived
        const movementNetSukukInvested = movements.reduce((sum: number, m: any) => {
          const movementType = typeof m?.type === 'string' ? m.type : ''
          if (
            movementType !== 'INVEST_OUT' &&
            movementType !== 'WITHDRAW_PRINCIPAL' &&
            movementType !== 'ROLLBACK_PRINCIPAL'
          ) {
            return sum
          }

          const invId = typeof m?.investmentId === 'string' ? m.investmentId : null
          const inv = invId ? investmentMap.get(invId) : null
          const invType = inv?.account?.type
          if (invType !== 'SUKUK') return sum

          const amt = Math.abs(Number(m?.amount) || 0)
          if (amt <= 0) return sum

          if (movementType === 'INVEST_OUT') return sum + amt
          return sum - amt
        }, 0)

        const sukukAllocations = (Array.isArray(bucket.allocations) ? bucket.allocations : [])
          .map((alloc: any) => {
            const principalRemaining = Math.max(0, Number(alloc?.principalRemaining) || 0)
            const invId = typeof alloc?.investment?.id === 'string' ? alloc.investment.id : null
            const invName = typeof alloc?.investment?.name === 'string' ? alloc.investment.name : 'Sukuk'
            const invPrincipal = Math.max(0, Number(alloc?.investment?.principalAmount) || 0)
            const isDealClosed = invPrincipal <= 0.0001
            
            // Keep closed deals too: they are when principal continuity becomes due.
            if (!invId || principalRemaining <= 0) return null
            
            // Get investment details from investmentMap
            const inv = investmentMap.get(invId)
            const maturityDate = inv?.maturityDate ? new Date(inv.maturityDate) : null
            const isActive = maturityDate && !Number.isNaN(maturityDate.getTime()) && maturityDate.getTime() > now.getTime()
            const isMatured = maturityDate && !Number.isNaN(maturityDate.getTime()) && maturityDate.getTime() <= now.getTime()
            const isClosedAndMatured = isDealClosed && Boolean(isMatured)
            
            return {
              investmentId: invId,
              investmentName: invName,
              principalRemaining,
              maturityDate,
              isActive,
              isDealClosed,
              isClosedAndMatured,
            }
          })
          .filter((x: any): x is { investmentId: string; investmentName: string; principalRemaining: number; maturityDate: Date | null; isActive: boolean; isDealClosed: boolean; isClosedAndMatured: boolean } => Boolean(x))

        const sukukInvestedByAllocations = sukukAllocations.reduce(
          (sum: number, a: { principalRemaining: number }) => sum + a.principalRemaining,
          0,
        )
        const sukukInvestedBase = Math.max(
          0,
          Math.max(sukukInvestedByAllocations, movementNetSukukInvested, sukukInvestedByMetadata)
        )
        const savingsIdleBase = Math.max(0, baseForSecondAndLater - sukukInvestedBase)

        if (firstHaulCompleted) {
          const idleStart = firstHaulEnd
          const elapsedSinceFirstHawl = diffDaysFloor(idleStart, now)
          const completedIdleHawls = Math.floor(elapsedSinceFirstHawl / 354)

          for (let i = 0; i < completedIdleHawls; i++) {
            const periodStart = addDays(idleStart, i * 354)
            const periodEnd = addDays(idleStart, (i + 1) * 354)
            const idleDays = diffDaysFloor(periodStart, periodEnd)

            const withdrawnBeforePeriodEnd = sumHawlOutflowsBetween(firstHawlStart, periodEnd)
            const heldForFullHawl = Math.max(0, baseForSecondAndLater - withdrawnBeforePeriodEnd)
            if (heldForFullHawl <= 0.01) continue

            const rowKey = buildRowKey(['SAVINGS_IDLE', bucket.id, isoDay(periodStart), isoDay(periodEnd)])
            const isPaid = movementHasRowPaid(allPayments, rowKey)
            const zakatDue = !isPaid ? heldForFullHawl * 0.025 : 0

            savingsRows.push({
              id: rowKey,
              bucketId: bucket.id,
              periodIndex: i + 1,
              label: `Idle • ${roscaLabelPrefix} • ${investmentName} • ${isoDay(periodStart)} → ${isoDay(periodEnd)}`,
              currency: bucket.currency,
              balance: heldForFullHawl,
              haulStartDate: isoDay(periodStart),
              lastZakatPaidDate: bucket.lastZakatPaidDate
                ? bucket.lastZakatPaidDate.toISOString().split('T')[0]
                : null,
              haulCompleteDate: isoDay(periodEnd),
              idleBase: heldForFullHawl,
              receiptsTotal: 0,
              zakatDue,
              isPaid,
              haulCompleted: now.getTime() >= periodEnd.getTime(),
              source: investmentName,
              sourceGroup: sourceGroupLabel,
              sourceType: 'CIRCLYS',
              rowKind: 'IDLE',
              why: withdrawnBeforePeriodEnd > 0
                ? `Cash idle from ${isoDay(periodStart)} to ${isoDay(periodEnd)} (${idleDays} days), reduced by ${withdrawnBeforePeriodEnd.toLocaleString()} withdrawn/spent before hawl end.`
                : `Cash idle from ${isoDay(periodStart)} to ${isoDay(periodEnd)} (${idleDays} days)`,
              lastPayment: lastPayment
                ? {
                    id: lastPayment.id,
                    date: new Date(lastPayment.date).toISOString().split('T')[0],
                    amount: Math.abs(Number(lastPayment.amount || 0)),
                  }
                : null,
              dueReceipts: [],
            })
          }
        }

        // ROSCA-funded Sukuk principal continuity rows:
        // once ROSCA Hawl 1 completes, invested portion continues immediately under Sukuk.
        for (const alloc of sukukAllocations) {
          if (alloc.principalRemaining <= 0.0001) continue
          if (!alloc.isClosedAndMatured) continue

          const continuityStart = startOfDay(firstHaulEnd)
          const elapsedContinuityDays = diffDaysFloor(continuityStart, now)
          const completedContinuityHawls = Math.floor(elapsedContinuityDays / 354)
          if (completedContinuityHawls <= 0) continue

          for (let i = 0; i < completedContinuityHawls; i++) {
            const periodStart = addDays(continuityStart, i * 354)
            const periodEnd = addDays(continuityStart, (i + 1) * 354)
            const rowKey = buildRowKey([
              'ROSCA_SUKUK_PRINCIPAL',
              bucket.id,
              alloc.investmentId,
              isoDay(periodStart),
              isoDay(periodEnd),
            ])
            const isPaid = movementHasRowPaid(allPayments, rowKey)
            const zakatDue = !isPaid ? alloc.principalRemaining * 0.025 : 0

            savingsRows.push({
              id: rowKey,
              bucketId: bucket.id,
              periodIndex: i + 1,
              label: `Sukuk Principal • ${alloc.investmentName} • ${isoDay(periodStart)} → ${isoDay(periodEnd)}`,
              currency: bucket.currency,
              balance: alloc.principalRemaining,
              haulStartDate: isoDay(periodStart),
              lastZakatPaidDate: bucket.lastZakatPaidDate
                ? bucket.lastZakatPaidDate.toISOString().split('T')[0]
                : null,
              haulCompleteDate: isoDay(periodEnd),
              idleBase: alloc.principalRemaining,
              receiptsTotal: 0,
              zakatDue,
              isPaid,
              haulCompleted: true,
              source: alloc.investmentName,
              sourceGroup: `Sukuk Principal • ${alloc.investmentName}`,
              sourceType: 'SUKUK',
              rowKind: 'PRINCIPAL',
              why: `Sukuk principal continuity from ROSCA receipt (${isoDay(periodStart)} to ${isoDay(periodEnd)}). Deal closed and matured: Zakat due now.`,
              lastPayment: lastPayment
                ? {
                    id: lastPayment.id,
                    date: new Date(lastPayment.date).toISOString().split('T')[0],
                    amount: Math.abs(Number(lastPayment.amount || 0)),
                  }
                : null,
              dueReceipts: [],
            })
          }
        }

        return savingsRows
      }

      const qualifyingReceipts = receiptMovements
        .map((m: any) => {
          const day = movementDay(m)
          if (!day) return null

          const investmentId = typeof m?.investmentId === 'string' ? m.investmentId : null
          const inv = investmentId ? investmentMap.get(investmentId) : null
          if (!isCommissionBucket) {
            if (!inv) return null
            if (inv.isIjarah) return null
            if (hasDefaultOrWrittenOff(inv)) return null
          }

          if (inv?.reopenedAt) {
            const reopenedAt = new Date(inv.reopenedAt as any)
            if (!Number.isNaN(reopenedAt.getTime())) {
              const createdAt = new Date(m.createdAt)
              if (!Number.isNaN(createdAt.getTime()) && createdAt < reopenedAt) return null
            }
          }

          const start = inv?.startDate instanceof Date ? inv.startDate : (inv?.startDate ? new Date(inv.startDate as any) : bucketStart)
          if (Number.isNaN(start.getTime())) return null
          const invMetadata = parseMetadata(inv?.metadata)
          const inheritedSavingsHaulStart = toDate(invMetadata?.savingsHaulStartDate)
          // Resolved for both owner and partner (see sukukAnchorScopePersonId block above).
          const resolvedOwnerAnchor = inv?.id
            ? ownerResolvedSukukHawlStartByInvestmentId.get(inv.id as string) || null
            : null
          const ownerSukukAnchor =
            resolvedOwnerAnchor && !Number.isNaN(resolvedOwnerAnchor.getTime())
              ? resolvedOwnerAnchor
              : inheritedSavingsHaulStart && !Number.isNaN(inheritedSavingsHaulStart.getTime())
              ? inheritedSavingsHaulStart
              : start
          const movementType = typeof m?.type === 'string' ? m.type : ''
          const isPrincipalReceiptMovement = movementType === 'WITHDRAW_PRINCIPAL' || movementType === 'ROLLBACK_PRINCIPAL'
          const isProfitReceiptMovement = movementType === 'WITHDRAW_PROFIT' || (isProfitBucket && movementType === 'CASH_IN')

          if (isPrincipalReceiptMovement && inv?.account?.type === 'SUKUK') {
            const currentPrincipal = Math.max(0, Number(inv?.principalAmount || 0))
            if (currentPrincipal > 0.0001) return null
            const maturityRaw = inv?.maturityDate ? new Date(inv.maturityDate as any) : null
            const matured =
              maturityRaw &&
              !Number.isNaN(maturityRaw.getTime()) &&
              maturityRaw.getTime() <= now.getTime()
            if (!matured) return null
          }

          // Principal receipts from ROSCA-funded Sukuk inherit the resolved running
          // ROSCA hawl anchor (continuity across cycles).
          // Profit receipts always use investment.startDate.
          const resolvedRoscaAnchor = ownerSukukAnchor && !Number.isNaN(ownerSukukAnchor.getTime())
            ? ownerSukukAnchor
            : start
          const eligibilityAnchor = isCommissionBucket
            ? bucketStart
            : isProfitReceiptMovement
              ? start  // ✅ profit always uses investment.startDate
              : isPrincipalReceiptMovement
                ? resolvedRoscaAnchor  // ✅ principal keeps ROSCA continuity
                : resolvedRoscaAnchor
          const eligibilityStart = startOfDay(eligibilityAnchor)
          const duration = diffDaysFloor(eligibilityStart, day)

          const amount = movementAmount(m)
          if (amount <= 0) return null

          const investmentName = inv?.name || bucket.label || 'General'

          return {
            movement: m,
            movementId: m.id,
            investmentId: (inv?.id as string) || (investmentId as string),
            investmentName,
            receiptDay: day,
            eligibilityStart,
            eligibilityDuration: duration,
            amount,
          }
        })
        .filter((x: any) => Boolean(x)) as Array<{
          movement: any
          movementId: string
          investmentId: string
          investmentName: string
          receiptDay: Date
          eligibilityStart: Date
          eligibilityDuration: number
          amount: number
        }>

      const bucketRows: BucketRow[] = []

      qualifyingReceipts.forEach((r) => {
        if (r.eligibilityDuration < 354) return

        const rowKey = buildRowKey(['RECEIPT', bucket.id, r.movementId])
        const isPaid = movementHasRowPaid(allPayments, rowKey)
        // For receipt rows, hawl completes on receipt day itself.
        // Only same-day outflows can reduce this row's zakat base.
        const withdrawnBeforeHawlEnd = sumHawlOutflowsBetween(r.receiptDay, r.receiptDay)
        const zakatBase = Math.max(0, r.amount - withdrawnBeforeHawlEnd)
        if (zakatBase <= 0.01) return
        const zakatDue = !isPaid && zakatBase > 0 ? zakatBase * 0.025 : 0
        const dueReceipts = [
          {
            date: isoDay(r.receiptDay),
            amount: zakatBase,
            type: r.movement.type,
            investmentName: r.investmentName,
          },
        ]
        const rowKind = getRowKind(bucket, rowKey, dueReceipts)
        const daysHeld = diffDaysFloor(r.eligibilityStart, r.receiptDay)
        if (rowKind === 'PRINCIPAL' && zakatDue <= 0) return
        const why = rowKind === 'COMMISSION'
          ? `Commission from sale on ${isoDay(bucket.haulStartDate)}, held ${daysHeld} days`
          : rowKind === 'PRINCIPAL'
            ? `Principal received on ${isoDay(r.receiptDay)}, investment ran ${daysHeld} days (\u2265354)`
            : `Profit received on ${isoDay(r.receiptDay)}, investment ran ${daysHeld} days (\u2265354)`
        const whyWithOutflow = withdrawnBeforeHawlEnd > 0
          ? `${why}. Reduced by ${withdrawnBeforeHawlEnd.toLocaleString()} withdrawn/spent before hawl completion.`
          : why
        bucketRows.push({
          id: rowKey,
          bucketId: bucket.id,
          periodIndex: 0,
          label: `Receipt \u2022 ${r.investmentName} \u2022 ${isoDay(r.receiptDay)}`,
          currency: bucket.currency,
          balance: displayBalance,
          haulStartDate: isoDay(r.eligibilityStart),
          lastZakatPaidDate: bucket.lastZakatPaidDate
            ? bucket.lastZakatPaidDate.toISOString().split('T')[0]
            : null,
          haulCompleteDate: isoDay(r.receiptDay),
          idleBase: 0,
          receiptsTotal: zakatBase,
          zakatDue,
          isPaid,
          haulCompleted: true,
          source: r.investmentName,
          sourceGroup,
          sourceType,
          rowKind,
          why: whyWithOutflow,
          lastPayment: lastPayment
            ? {
                id: lastPayment.id,
                date: new Date(lastPayment.date).toISOString().split('T')[0],
                amount: Math.abs(Number(lastPayment.amount || 0)),
              }
            : null,
          dueReceipts,
        })
      })

      const completedIdleRows: BucketRow[] = []
      qualifyingReceipts.forEach((r) => {
        // Check if this receipt was withdrawn/spent after receipt date.
        const receiptTime = r.receiptDay.getTime()
        const outflowEvents = hawlOutflowEvents
          // Include same-day outflows so money moved on hawl-end day is not treated as idle.
          .filter((x: { time: number; amount: number }) => x.time >= receiptTime)

        // If receipt itself completed the first hawl (>=354), the receipt row already shows Zakat for that period.
        // Idle rows should start from the NEXT hawl cycle (receipt day + 354 days).
        // If receipt happened before first hawl completion, keep continuity from eligibilityStart.
        const idleAnchorStart = r.eligibilityDuration >= 354 ? r.receiptDay : r.eligibilityStart
        const idleElapsed = diffDaysFloor(idleAnchorStart, now)
        const completedIdleHauls = Math.floor(idleElapsed / 354)
        
        // If receipt completed first hawl, skip that first idle period (already shown in receipt row)
        const startIndex = r.eligibilityDuration >= 354 ? 1 : 0
        if (completedIdleHauls <= startIndex) return

        for (let i = startIndex; i < completedIdleHauls; i++) {
          const periodStart = addDays(idleAnchorStart, i * 354)
          const periodEnd = addDays(idleAnchorStart, (i + 1) * 354)
          const periodEndTime = periodEnd.getTime()

          // Barrier: never duplicate the exact first-hawl period already represented by a receipt row.
          const isFirstHawlDuplicate =
            r.eligibilityDuration >= 354 &&
            isoDay(periodStart) === isoDay(r.eligibilityStart) &&
            isoDay(periodEnd) === isoDay(r.receiptDay)
          if (isFirstHawlDuplicate) continue

          const poolOutstanding = qualifyingReceipts
            .filter((q) => q.receiptDay.getTime() < periodEndTime)
            .reduce((s, q) => s + q.amount, 0)

          // Barrier: do not treat amounts already withdrawn/spent by this period end as idle.
          const outflowByPeriod = outflowEvents
            .filter((x: { time: number; amount: number }) => x.time <= periodEndTime)
            .reduce((s: number, x: { time: number; amount: number }) => s + x.amount, 0)
          const outstandingForReceipt = Math.max(0, r.amount - outflowByPeriod)
          if (outstandingForReceipt <= 0.01) continue

          const balanceAtEnd = Math.max(0, Number(bucket.balance) || 0)
          const ratio = poolOutstanding > 0 ? Math.min(1, balanceAtEnd / poolOutstanding) : 0
          const idleAmount = Math.max(0, Math.min(outstandingForReceipt, r.amount * ratio))
          if (idleAmount <= 0.01) continue

          const rowKey = buildRowKey(['IDLE', bucket.id, r.movementId, isoDay(periodStart), isoDay(periodEnd)])
          const isPaid = movementHasRowPaid(allPayments, rowKey)
          const zakatDue = !isPaid && idleAmount > 0 ? idleAmount * 0.025 : 0
          const idleDays = diffDaysFloor(periodStart, periodEnd)
          const movementType = typeof r.movement?.type === 'string' ? r.movement.type : ''
          const idleRowKind: BucketRow['rowKind'] = movementType === 'WITHDRAW_PRINCIPAL' || movementType === 'ROLLBACK_PRINCIPAL'
            ? 'PRINCIPAL'
            : movementType === 'WITHDRAW_PROFIT' || (isProfitBucket && movementType === 'CASH_IN')
              ? 'PROFIT'
              : isCommissionBucket
                ? 'COMMISSION'
                : 'IDLE'

          completedIdleRows.push({
            id: rowKey,
            bucketId: bucket.id,
            periodIndex: i + 1,
            label: `Idle • ${r.investmentName} • ${isoDay(periodStart)} → ${isoDay(periodEnd)}`,
            currency: bucket.currency,
            balance: displayBalance,
            haulStartDate: isoDay(periodStart),
            lastZakatPaidDate: bucket.lastZakatPaidDate
              ? bucket.lastZakatPaidDate.toISOString().split('T')[0]
              : null,
            haulCompleteDate: isoDay(periodEnd),
            idleBase: idleAmount,
            receiptsTotal: 0,
            zakatDue,
            isPaid,
            haulCompleted: now.getTime() >= periodEnd.getTime(),
            source: r.investmentName,
            sourceGroup,
            sourceType,
            rowKind: idleRowKind,
            why: `Cash idle from ${isoDay(periodStart)} to ${isoDay(periodEnd)} (${idleDays} days)`,
            lastPayment: lastPayment
              ? {
                  id: lastPayment.id,
                  date: new Date(lastPayment.date).toISOString().split('T')[0],
                  amount: Math.abs(Number(lastPayment.amount || 0)),
                }
              : null,
            dueReceipts: [
              {
                date: isoDay(r.receiptDay),
                amount: Number(r.movement.amount || 0),
                type: r.movement.type,
                investmentName: r.investmentName,
              },
            ],
          })
        }
      })

      bucketRows.push(...completedIdleRows)

      const cashInEvents = movements
        .map((m: any) => {
          if (m?.type !== 'CASH_IN') return null

          const day = movementDay(m)
          if (!day) return null

          const amount = Math.abs(Number(m?.amount) || 0)
          if (amount <= 0) return null

          return {
            time: day.getTime(),
            amount,
          }
        })
        .filter((x: { time: number; amount: number } | null): x is { time: number; amount: number } => Boolean(x))
      const hasReceiptMovements = receiptMovements.length > 0
      const normalizedCashInEvents = cashInEvents.length > 0
        ? cashInEvents
        : (!hasReceiptMovements && displayBalance > 0
          ? [{ time: startOfDay(bucketStart).getTime(), amount: displayBalance }]
          : [])

      if (!isImmediateReceiptBucket && !hasReceiptMovements && normalizedCashInEvents.length > 0) {
        const earliestCashInTime = normalizedCashInEvents.reduce(
          (min: number, evt: { time: number; amount: number }) => Math.min(min, evt.time),
          normalizedCashInEvents[0].time,
        )
        const start = startOfDay(new Date(earliestCashInTime))
        const elapsed = diffDaysFloor(start, now)
        const completed = Math.floor(elapsed / 354)
        for (let i = 0; i < completed; i++) {
          const periodStart = addDays(start, i * 354)
          const periodEnd = addDays(start, (i + 1) * 354)
          const periodEndTime = startOfDay(periodEnd).getTime()

          const inflowsByPeriodEnd = normalizedCashInEvents
            .filter((evt: { time: number; amount: number }) => evt.time <= periodEndTime)
            .reduce((sum: number, evt: { time: number; amount: number }) => sum + evt.amount, 0)
          if (inflowsByPeriodEnd <= 0.01) continue

          const withdrawnBeforePeriodEnd = sumHawlOutflowsBetween(start, periodEnd)
          const heldForFullHawl = Math.max(0, inflowsByPeriodEnd - withdrawnBeforePeriodEnd)
          if (heldForFullHawl <= 0.01) continue

          const rowKey = buildRowKey(['DEPOSIT', bucket.id, isoDay(periodStart), isoDay(periodEnd)])
          const isPaid = movementHasRowPaid(allPayments, rowKey)
          const zakatDue = !isPaid ? heldForFullHawl * 0.025 : 0
          const idleDays = diffDaysFloor(periodStart, periodEnd)

          bucketRows.push({
            id: rowKey,
            bucketId: bucket.id,
            periodIndex: i + 1,
            label: `Idle \u2022 ${source} \u2022 ${isoDay(periodStart)} \u2192 ${isoDay(periodEnd)}`,
            currency: bucket.currency,
            balance: displayBalance,
            haulStartDate: isoDay(periodStart),
            lastZakatPaidDate: bucket.lastZakatPaidDate
              ? bucket.lastZakatPaidDate.toISOString().split('T')[0]
              : null,
            haulCompleteDate: isoDay(periodEnd),
            idleBase: heldForFullHawl,
            receiptsTotal: 0,
            zakatDue,
            isPaid,
            haulCompleted: now.getTime() >= periodEnd.getTime(),
            source,
            sourceGroup,
            sourceType,
            rowKind: 'IDLE',
            why: withdrawnBeforePeriodEnd > 0
              ? `Cash idle from ${isoDay(periodStart)} to ${isoDay(periodEnd)} (${idleDays} days), reduced by ${withdrawnBeforePeriodEnd.toLocaleString()} withdrawn/spent before hawl end.`
              : `Cash idle from ${isoDay(periodStart)} to ${isoDay(periodEnd)} (${idleDays} days)`,
            lastPayment: lastPayment
              ? {
                  id: lastPayment.id,
                  date: new Date(lastPayment.date).toISOString().split('T')[0],
                  amount: Math.abs(Number(lastPayment.amount || 0)),
                }
              : null,
            dueReceipts: [],
          })
        }
      }

      const hasAnyActivity =
        bucketRows.some((row) => row.idleBase > 0 || row.receiptsTotal > 0 || row.zakatDue > 0) ||
        Number(bucket.balance || 0) > 0 ||
        payments.length > 0
      if (!hasAnyActivity) return []

      return bucketRows
    })
    .filter((row: BucketRow): row is BucketRow => Boolean(row))

  const principalAggregate = new Map<string, BucketRow>()
  const passthroughRows: BucketRow[] = []

  for (const row of rawRows) {
    const isRoscaSukukPrincipalRow =
      row.rowKind === 'PRINCIPAL' &&
      row.sourceType === 'SUKUK' &&
      typeof row.id === 'string' &&
      row.id.startsWith('ROSCA_SUKUK_PRINCIPAL|')

    if (!isRoscaSukukPrincipalRow) {
      passthroughRows.push(row)
      continue
    }

    const aggregateKey = [
      row.source,
      row.haulStartDate,
      row.haulCompleteDate,
      row.currency,
    ].join('|')

    const existing = principalAggregate.get(aggregateKey)
    if (!existing) {
      principalAggregate.set(aggregateKey, {
        ...row,
        id: `ROSCA_SUKUK_PRINCIPAL_AGG|${aggregateKey}`,
      })
      continue
    }

    existing.balance += row.balance
    existing.idleBase += row.idleBase
    existing.receiptsTotal += row.receiptsTotal
    existing.zakatDue += row.zakatDue
    existing.isPaid = existing.isPaid && row.isPaid
  }

  const rows: BucketRow[] = [...passthroughRows, ...principalAggregate.values()]

  // Sort rows so ROSCA first-hawl rows appear before principal/profit rows
  rows.sort((a, b) => {
    // Sort by haulStartDate first (earlier dates first)
    const aStart = new Date(a.haulStartDate).getTime()
    const bStart = new Date(b.haulStartDate).getTime()
    if (aStart !== bStart) return aStart - bStart
    // Then by haulCompleteDate
    const aEnd = new Date(a.haulCompleteDate).getTime()
    const bEnd = new Date(b.haulCompleteDate).getTime()
    return aEnd - bEnd
  })

  if (process.env.ZAKAT_DEBUG || process.env.DASHBOARD_DEBUG) {
    console.log(
      'ZAKAT BUCKETS:',
      JSON.stringify(
        rows.map((r) => ({
          label: r.label,
          periodIndex: r.periodIndex,
          haulStart: r.haulStartDate,
          haulEnd: r.haulCompleteDate,
          balance: r.balance,
          idleBase: r.idleBase,
          receipts: r.receiptsTotal,
          zakatDue: r.zakatDue,
          status: r.isPaid ? 'PAID' : r.zakatDue > 0 ? 'HAS_DUE' : 'NO_ACTIVITY',
        })),
        null,
        2,
      ),
    )
  }

  // Build map of row IDs to their haul completion years
  for (const row of rows) {
    const haulEndDate = row.haulCompleteDate
    const yearMatch = haulEndDate.match(/^(\d{4})-/)
    if (yearMatch) {
      rowYearMap.set(row.id, parseInt(yearMatch[1]))
    }
  }

  // Calculate total zakat paid and group by zakat period year
  const paymentsByYear = allPayments.reduce((acc: Record<string, number>, payment: any) => {
    const amount = Math.abs(Number(payment.amount) || 0)
    
    // Extract the row key from payment notes
    const notes = payment.notes || ''
    const rowKeyMatch = notes.match(/ZAKAT_ROW=(.+?)(?:\s|$)/)
    
    let year = new Date(payment.date).getFullYear() // fallback to payment date
    
    if (rowKeyMatch) {
      const rowKey = rowKeyMatch[1]
      // Look up the year for this row
      const rowYear = rowYearMap.get(rowKey)
      if (rowYear) {
        year = rowYear
      }
    }
    
    acc[year] = (acc[year] || 0) + amount
    return acc
  }, {})

  const totalZakatPaid = Object.values(paymentsByYear).reduce((sum: number, amt: number) => sum + amt, 0)

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-xl shadow-md p-6 text-white">
        <h1 className="text-2xl font-bold">Zakat Dashboard</h1>
        <p className="text-sm text-slate-400 mt-1">
          Zakat is calculated only on cash received after the haul is completed.
        </p>
      </div>

      {!nisabConfigured && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="font-semibold">Nisab not configured — please set it in Settings</div>
        </div>
      )}

      {nisabConfigured && !zakatEnabled && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="font-semibold">Below Nisab</div>
          <div className="mt-1">
            Total zakatable wealth is {money(totalZakatableWealthForNisab)}.
            Nisab is {money(nisabValue)}.
          </div>
        </div>
      )}

      <ZakatPageClient
        initialBuckets={rows}
        zakatEnabled={zakatEnabled}
        displayCurrency={displayCurrency}
        totalZakatPaid={totalZakatPaid}
        paymentsByYear={paymentsByYear}
      />
    </div>
  )
}
