import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { ZakatPageClient } from '@/components/zakat/ZakatPageClient'

export const dynamic = 'force-dynamic'

const NISAB_KEY = 'NISAB_VALUE'
const CASH_BALANCE_KEY = 'CASH_BALANCE'
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
  rowKind?: 'PROFIT' | 'COMMISSION' | 'IDLE' | 'PRINCIPAL'
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

const diffDaysFloor = (start: Date, end: Date) => {
  const startTime = start.getTime()
  const endTime = end.getTime()
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return 0
  const diffMs = endTime - startTime
  if (diffMs <= 0) return 0
  return Math.floor(diffMs / (1000 * 60 * 60 * 24))
}

const receiptTypes = new Set([
  'WITHDRAW_PROFIT',
  'WITHDRAW_PRINCIPAL',
  'ROLLBACK_PRINCIPAL',
  'SELL_RECEIPT',
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
  const rewardFromPayments = (Array.isArray(paymentEntries) ? paymentEntries : [])
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
  const totalMonths = Math.max(0, Math.floor(toNonNegativeNumber(metadata?.totalMonths)))
  const scheduledRewardMonths = receiptMonth > 0
    ? receiptMonth
    : (totalMonths > 0 ? totalMonths : paymentEntries.length)
  const rewardFromSchedule = rewardPerMonth * scheduledRewardMonths

  return Math.max(
    rewardFromPayments,
    rewardFromMeta,
    rewardFromLegacyConfig,
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
  const user = await getCurrentUser()
  if (!user) {
    return null
  }

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

  const scopeKey = user.role === 'OWNER' ? 'OWNER' : user.personId!
  const nisabMetKey = `NISAB_MET_SINCE:${scopeKey}`

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

      if (hasReceived && expectedRewardTotal > REWARD_EPSILON) {
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

        const rewardAnchorDate = firstContributionDate || toDate(inv.startDate) || new Date()
        const rewardDate = toDate(metadata?.received?.date) || rewardAnchorDate
        const rewardCurrency = inv.account?.currency || 'SAR'

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
      const cashBucketAgg = await prisma.cashBucket.aggregate({
        where: { personId: null },
        _sum: { balance: true },
      })
      const cashBucketSumRaw = cashBucketAgg?._sum?.balance
      const cashBucketSum = Number.isFinite(cashBucketSumRaw as any) ? Number(cashBucketSumRaw) : 0

      await prisma.systemSetting.upsert({
        where: { key: CASH_BALANCE_KEY },
        update: { value: cashBucketSum.toString() },
        create: {
          key: CASH_BALANCE_KEY,
          value: cashBucketSum.toString(),
          description: 'Available cash balance for investments',
        },
      })
    }

    // For every Sukuk investment owned by the owner, determine correct hawl start:
    // - Prefer real funding allocations from Savings Receipt buckets (ROSCA-funded)
    // - Else prefer allocations from Sukuk principal receipt buckets (recycled principal)
    // - Fallback to CASH_INVEST/start date for manual cash funding
    // Persist anchor in metadata and keep receipt suppression only for fully depleted receipts.

    const allSukukInvestments = await prisma.investment.findMany({
      where: { account: { type: 'SUKUK' } },
      select: { id: true, metadata: true, startDate: true },
    })

    const allSukukCashInvestTxs = await prisma.transaction.findMany({
      where: {
        type: 'CASH_INVEST',
        personId: null,
        investmentId: { not: null },
        investment: { account: { type: 'SUKUK' } },
      },
      select: { id: true, investmentId: true, amount: true, date: true },
    })

    const allSukukRoscaAllocations = allSukukInvestments.length
      ? await prisma.investmentBucketAllocation.findMany({
          where: {
            investmentId: { in: allSukukInvestments.map((inv: any) => inv.id) },
            principalAllocated: { gt: 0 },
            cashBucket: {
              personId: null,
              label: { startsWith: 'Savings Receipt •' },
            },
          } as any,
          select: {
            investmentId: true,
            cashBucketId: true,
            cashBucket: {
              select: {
                id: true,
                haulStartDate: true,
                balance: true,
              },
            },
          },
        })
      : []

    const allSukukPrincipalReceiptAllocations = allSukukInvestments.length
      ? await prisma.investmentBucketAllocation.findMany({
          where: {
            investmentId: { in: allSukukInvestments.map((inv: any) => inv.id) },
            principalAllocated: { gt: 0 },
            cashBucket: {
              personId: null,
              OR: [
                { label: { startsWith: 'Sukuk Principal •' } },
                { label: { endsWith: ' Principal Receipt' } },
              ],
            },
          } as any,
          select: {
            investmentId: true,
            cashBucketId: true,
            cashBucket: {
              select: {
                id: true,
                haulStartDate: true,
              },
            },
          },
        })
      : []

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

    const sukukInvestedReceiptIds = new Set<string>()

    for (const sukukInv of allSukukInvestments) {
      const cashInvestTx = allSukukCashInvestTxs.find((tx: any) => tx.investmentId === sukukInv.id)
      const fallbackRaw = cashInvestTx?.date ?? sukukInv.startDate
      if (!fallbackRaw) continue
      const fallbackDate = fallbackRaw instanceof Date ? fallbackRaw : new Date(fallbackRaw as any)
      if (Number.isNaN(fallbackDate.getTime())) continue
      const fallbackDay = new Date(fallbackDate.getFullYear(), fallbackDate.getMonth(), fallbackDate.getDate())

      const roscaAllocations = roscaAllocationsByInvestmentId.get(sukukInv.id) || []
      const principalReceiptAllocations = principalReceiptAllocationsByInvestmentId.get(sukukInv.id) || []
      const roscaAnchors = roscaAllocations
        .map((alloc: any) => toDate(alloc?.cashBucket?.haulStartDate))
        .filter((d: Date | null): d is Date => Boolean(d && !Number.isNaN(d.getTime())))
        .map((d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()))
        .sort((a: Date, b: Date) => a.getTime() - b.getTime())

      const principalReceiptAnchors = principalReceiptAllocations
        .map((alloc: any) => toDate(alloc?.cashBucket?.haulStartDate))
        .filter((d: Date | null): d is Date => Boolean(d && !Number.isNaN(d.getTime())))
        .map((d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()))
        .sort((a: Date, b: Date) => a.getTime() - b.getTime())

      // Prefer ROSCA anchors, then recycled principal anchors, then fallback to Sukuk cash-invest/start date.
      const hawlStart = roscaAnchors[0] || principalReceiptAnchors[0] || fallbackDay

      for (const alloc of roscaAllocations) {
        const bucketId = typeof alloc?.cashBucketId === 'string' ? alloc.cashBucketId : null
        if (!bucketId) continue
        const balance = Math.max(0, Number(alloc?.cashBucket?.balance) || 0)
        // Suppress only receipts that were fully moved out (avoid hiding partial receipts).
        if (balance <= 0.01) {
          sukukInvestedReceiptIds.add(bucketId)
        }
      }

      // Persist hawl start in investment metadata
      const hawlIso = hawlStart.toISOString().split('T')[0]
      const existingMeta = parseMetadata(sukukInv.metadata) || {}
      if (existingMeta?.savingsHaulStartDate !== hawlIso) {
        await prisma.investment.update({
          where: { id: sukukInv.id },
          data: { metadata: JSON.stringify({ ...existingMeta, savingsHaulStartDate: hawlIso }) },
        })
      }

      const sukukStartDate = toDate(sukukInv.startDate)
      const profitHawlStart = sukukStartDate && !Number.isNaN(sukukStartDate.getTime())
        ? new Date(sukukStartDate.getFullYear(), sukukStartDate.getMonth(), sukukStartDate.getDate())
        : fallbackDay

      // Profit is new money generated by Sukuk, so its hawl starts from Sukuk start date.
      await prisma.cashBucket.updateMany({
        where: {
          personId: null,
          label: { startsWith: 'Profit •' },
          movements: { some: { investmentId: sukukInv.id } },
        },
        data: { haulStartDate: profitHawlStart },
      })
    }

    // Exclude fully-invested Savings Receipt buckets from Zakat
    if (sukukInvestedReceiptIds.size > 0) {
      await prisma.cashBucket.updateMany({
        where: { id: { in: Array.from(sukukInvestedReceiptIds) } },
        data: { excludeFromZakat: true },
      })
    }
  }

  const buckets = await prisma.cashBucket.findMany({
    where: {
      AND: [
        { excludeFromZakat: false },
        ...(user.role === 'OWNER'
          ? [
              {
                OR: [
                  { personId: null },                    // Original owner buckets
                  { personId: user.personId || null },   // Commission buckets with owner's personId
                ],
              },
            ]
          : [
              {
                personId: user.personId,
                NOT: [
                  { label: 'Partner Commission' },
                  { label: { startsWith: 'Debt •' } },
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
            select: { id: true, name: true, account: { select: { type: true } } },
          },
        },
      },
    },
  })

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
  }

  if (user.role === 'OWNER') {
    const ownerPersonId = user.personId || null
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
        dealParticipants: {
          select: { personId: true, investedAmount: true, acquiredAt: true, commissionFees: true },
        },
        transactions: {
          where: {
            type: { in: ['WITHDRAW_PROFIT', 'WITHDRAW_PRINCIPAL'] },
          },
          select: { type: true, date: true, amount: true },
          orderBy: { date: 'asc' },
        },
      },
    })

    const getOwnerPosition = (inv: any) => {
      if (!ownerPersonId) return null
      const dps = Array.isArray(inv.dealParticipants) ? inv.dealParticipants : []
      return dps.find((p: any) => p?.personId === ownerPersonId) || null
    }

    sukukValueForNisab = investments.reduce((sum: number, inv: any) => {
      const pos = getOwnerPosition(inv)
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
      const withdrawnProfit = txs
        .filter((tx: any) => tx?.type === 'WITHDRAW_PROFIT')
        .filter((tx: any) => {
          const d = tx?.date instanceof Date ? tx.date : new Date(tx?.date)
          return !Number.isNaN(d.getTime()) && d.getTime() <= atMs
        })
        .reduce((s: number, tx: any) => s + Math.abs(Number(tx?.amount) || 0), 0)

      const withdrawnPrincipal = txs
        .filter((tx: any) => tx?.type === 'WITHDRAW_PRINCIPAL')
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
      ...(user.role === 'OWNER' ? { personId: null } : { personId: user.personId }),
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

  const isReceiptMovement = (m: any, isProfitBucket: boolean) => {
    if (isProfitBucket && m?.type === 'CASH_IN') return true
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
    if (rowKey.startsWith('IDLE|') || rowKey.startsWith('DEPOSIT|')) return 'IDLE' as const
    const t = dueReceipts?.[0]?.type
    if (t === 'WITHDRAW_PRINCIPAL') return 'PRINCIPAL' as const
    if (t === 'WITHDRAW_PROFIT') return 'PROFIT' as const
    if (label.startsWith('Profit \u2022')) return 'PROFIT' as const
    return 'PROFIT' as const
  }

  const hasAnySavingsReceiptBucket = buckets.some(
    (b: any) => typeof b?.label === 'string' && b.label.startsWith('Savings Receipt •'),
  )

  const rows: BucketRow[] = buckets
    .flatMap((bucket: any): BucketRow[] => {
      const now = startOfDay(new Date())
      const bucketStart = new Date(bucket.haulStartDate)
      if (Number.isNaN(bucketStart.getTime())) return []

      const isProfitBucket = typeof bucket.label === 'string' && bucket.label.startsWith('Profit •')
      const isCommissionBucket = typeof bucket.label === 'string' && (bucket.label === 'Partner Commission' || bucket.label.startsWith('Partner Commission'))
      const isImmediateReceiptBucket = isProfitBucket || isCommissionBucket
      const isCirclys = typeof bucket.label === 'string' && bucket.label.startsWith('Circlys')
      const isSavingsContribution = typeof bucket.label === 'string' && bucket.label.startsWith('Circlys •') && !bucket.label.includes('Receipt')
      const isSavingsReceiptBucket = typeof bucket.label === 'string' && bucket.label.startsWith('Savings Receipt •')
      const isSukukPrincipalBucket =
        typeof bucket.label === 'string' && bucket.label.startsWith('Sukuk Principal •')

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
      const receiptMovements = movements.filter((m: any) => isReceiptMovement(m, isImmediateReceiptBucket))

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

        const haulStart = startOfDay(bucketStart)
        const currentBalance = Math.max(0, Number(bucket.balance) || 0)
        const investmentName = bucket.label.replace('Savings Receipt • ', '')
        const savingsRows: BucketRow[] = []

        // Calculate Sukuk investments made during first hawl period
        const firstHaulEnd = addDays(haulStart, 354)
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

        const sukukInvestedByMetadata = investments.reduce((sum: number, inv: any) => {
          if (inv?.account?.type !== 'SUKUK') return sum

          const meta = parseMetadata(inv?.metadata)
          const savingsStart = toDate(meta?.savingsHaulStartDate)
          if (!savingsStart || Number.isNaN(savingsStart.getTime())) return sum
          if (isoDay(startOfDay(savingsStart)) !== isoDay(haulStart)) return sum

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

        const effectiveSukukInvested = Math.max(sukukInvestedDuringFirstHawl, sukukInvestedByMetadata)

        // First hawl: special receipt zakat (from first contribution date)
        const firstHaulCompleted = now.getTime() >= firstHaulEnd.getTime()
        const firstRowKey = buildRowKey(['SAVINGS_RECEIPT', bucket.id])
        const firstIsPaid = movementHasRowPaid(payments, firstRowKey)
        // Reduce Zakat base by amount invested in Sukuk during first hawl
        const firstHawlZakatBase = Math.max(0, totalReceived - effectiveSukukInvested)
        const firstZakatDue = !firstIsPaid && firstHaulCompleted && firstHawlZakatBase > 0 ? firstHawlZakatBase * 0.025 : 0

        savingsRows.push({
          id: firstRowKey,
          bucketId: bucket.id,
          periodIndex: 0,
          label: `Savings Receipt • ${investmentName}`,
          currency: bucket.currency,
          balance: firstHawlZakatBase,
          haulStartDate: isoDay(haulStart),
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
          sourceGroup: `Savings Receipt • ${investmentName}`,
          sourceType: 'CIRCLYS',
          rowKind: 'PROFIT' as const,
          why: effectiveSukukInvested > 0
            ? `ROSCA receipt of SAR ${totalReceived.toLocaleString()}, ${effectiveSukukInvested.toLocaleString()} invested in Sukuk, hawl from ${isoDay(haulStart)}`
            : `ROSCA receipt of SAR ${totalReceived.toLocaleString()}, hawl from ${isoDay(haulStart)}`,
          lastPayment: lastPayment
            ? {
                id: lastPayment.id,
                date: new Date(lastPayment.date).toISOString().split('T')[0],
                amount: Math.abs(Number(lastPayment.amount || 0)),
              }
            : null,
          dueReceipts: [{
            date: isoDay(receiptDate),
            amount: totalReceived,
            type: 'CASH_IN',
            investmentName,
          }],
        })

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
            const invType = alloc?.investment?.account?.type
            const invPrincipal = Math.max(0, Number(alloc?.investment?.principalAmount) || 0)
            
            // Skip if not a Sukuk, or if principal remaining is 0, or if investment is closed (principalAmount = 0)
            if (!invId || invType !== 'SUKUK' || principalRemaining <= 0 || invPrincipal <= 0) return null
            
            // Get investment details from investmentMap
            const inv = investmentMap.get(invId)
            const maturityDate = inv?.maturityDate ? new Date(inv.maturityDate) : null
            const isActive = maturityDate && !Number.isNaN(maturityDate.getTime()) && maturityDate.getTime() > now.getTime()
            
            return {
              investmentId: invId,
              investmentName: invName,
              principalRemaining,
              maturityDate,
              isActive,
            }
          })
          .filter((x: any): x is { investmentId: string; investmentName: string; principalRemaining: number; maturityDate: Date | null; isActive: boolean } => Boolean(x))

        const sukukInvestedByAllocations = sukukAllocations.reduce(
          (sum: number, a: { principalRemaining: number }) => sum + a.principalRemaining,
          0,
        )
        const sukukInvestedBase = Math.max(
          0,
          Math.max(sukukInvestedByAllocations, movementNetSukukInvested, sukukInvestedByMetadata)
        )
        const savingsIdleBase = Math.max(0, baseForSecondAndLater - sukukInvestedBase)

        if (firstHaulCompleted && (savingsIdleBase > 0 || sukukInvestedBase > 0)) {
          const idleStart = firstHaulEnd
          const elapsedSinceFirstHawl = diffDaysFloor(idleStart, now)
          const completedIdleHawls = Math.floor(elapsedSinceFirstHawl / 354)

          for (let i = 0; i < completedIdleHawls; i++) {
            const periodStart = addDays(idleStart, i * 354)
            const periodEnd = addDays(idleStart, (i + 1) * 354)
            const idleDays = diffDaysFloor(periodStart, periodEnd)

            if (savingsIdleBase > 0) {
              const rowKey = buildRowKey(['SAVINGS_IDLE', bucket.id, isoDay(periodStart), isoDay(periodEnd)])
              const isPaid = movementHasRowPaid(payments, rowKey)
              const zakatDue = !isPaid ? savingsIdleBase * 0.025 : 0

              savingsRows.push({
                id: rowKey,
                bucketId: bucket.id,
                periodIndex: i + 1,
                label: `Idle • Savings Receipt • ${investmentName} • ${isoDay(periodStart)} → ${isoDay(periodEnd)}`,
                currency: bucket.currency,
                balance: savingsIdleBase,
                haulStartDate: isoDay(periodStart),
                lastZakatPaidDate: bucket.lastZakatPaidDate
                  ? bucket.lastZakatPaidDate.toISOString().split('T')[0]
                  : null,
                haulCompleteDate: isoDay(periodEnd),
                idleBase: savingsIdleBase,
                receiptsTotal: 0,
                zakatDue,
                isPaid,
                haulCompleted: now.getTime() >= periodEnd.getTime(),
                source: investmentName,
                sourceGroup: `Savings Receipt • ${investmentName}`,
                sourceType: 'CIRCLYS',
                rowKind: 'IDLE',
                why: `Cash idle from ${isoDay(periodStart)} to ${isoDay(periodEnd)} (${idleDays} days)`,
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

            for (const alloc of sukukAllocations) {
              // For active Sukuk investments, defer Zakat to maturity date, not hawl completion
              const maturityTime = alloc.maturityDate?.getTime() || 0
              const periodEndTime = periodEnd.getTime()
              
              // For matured investments or periods that include maturity, use maturity date as hawl complete
              const effectiveHaulComplete = alloc.maturityDate && maturityTime <= periodEndTime && maturityTime >= periodStart.getTime()
                ? alloc.maturityDate
                : periodEnd
              
              // For active Sukuk, Zakat is deferred to maturity (zakatDue = 0 until maturity)
              const isMatured = !alloc.isActive || maturityTime <= periodEndTime
              
              const rowKey = buildRowKey([
                'SAVINGS_SUKUK_IDLE',
                bucket.id,
                alloc.investmentId,
                isoDay(periodStart),
                isoDay(effectiveHaulComplete),
              ])
              const isPaid = movementHasRowPaid(payments, rowKey)
              const zakatDue = isMatured && !isPaid ? alloc.principalRemaining * 0.025 : 0

              savingsRows.push({
                id: rowKey,
                bucketId: bucket.id,
                periodIndex: i + 1,
                label: `Idle • Sukuk Principal • ${alloc.investmentName} • ${isoDay(haulStart)} → ${isoDay(effectiveHaulComplete)}`,
                currency: bucket.currency,
                balance: alloc.principalRemaining,
                haulStartDate: isoDay(haulStart),
                lastZakatPaidDate: bucket.lastZakatPaidDate
                  ? bucket.lastZakatPaidDate.toISOString().split('T')[0]
                  : null,
                haulCompleteDate: isoDay(effectiveHaulComplete),
                idleBase: alloc.principalRemaining,
                receiptsTotal: 0,
                zakatDue,
                isPaid,
                haulCompleted: isMatured,
                source: alloc.investmentName,
                sourceGroup: `Sukuk Principal • ${alloc.investmentName}`,
                sourceType: 'SUKUK',
                rowKind: 'PRINCIPAL',
                why: alloc.isActive && !isMatured
                  ? `Sukuk principal - Zakat deferred to maturity (${isoDay(alloc.maturityDate!)})`
                  : alloc.maturityDate && maturityTime <= periodEndTime 
                  ? `Sukuk principal Zakat due on maturity (${isoDay(alloc.maturityDate)})`
                  : `Sukuk principal carrying forward hawl from ${isoDay(haulStart)}`,
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
        }

        return savingsRows
      }

      // In ROSCA scenarios, manual funding cash-ins can create standalone
      // General Cash idle rows that double-count against the Savings Receipt row.
      if (
        hasAnySavingsReceiptBucket &&
        !isSavingsReceiptBucket &&
        !isImmediateReceiptBucket &&
        (bucket.label === 'General Cash' || bucket.label == null)
      ) {
        return []
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
          const ownerSukukAnchor =
            inheritedSavingsHaulStart && !Number.isNaN(inheritedSavingsHaulStart.getTime())
              ? inheritedSavingsHaulStart
              : start
          const movementType = typeof m?.type === 'string' ? m.type : ''
          const isPrincipalReceiptMovement = movementType === 'WITHDRAW_PRINCIPAL' || movementType === 'ROLLBACK_PRINCIPAL'
          const isProfitReceiptMovement = movementType === 'WITHDRAW_PROFIT' || (isProfitBucket && movementType === 'CASH_IN')

          // For principal receipts from ROSCA-funded Sukuk, use ROSCA first contribution date
          // For profit receipts (including Profit bucket CASH_IN), use investment start date for OWNER (Sukuk start)
          const eligibilityAnchor = (isCommissionBucket
            ? bucketStart
            : (isPrincipalReceiptMovement
              ? (user.role === 'PARTNER' ? bucketStart : ownerSukukAnchor)
              : (isProfitReceiptMovement
                ? (user.role === 'PARTNER' ? bucketStart : start)
                : (user.role === 'PARTNER' ? bucketStart : ownerSukukAnchor))))
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
        const isPaid = movementHasRowPaid(payments, rowKey)
        const zakatBase = r.amount
        const zakatDue = !isPaid && zakatBase > 0 ? zakatBase * 0.025 : 0
        const dueReceipts = [
          {
            date: isoDay(r.receiptDay),
            amount: Number(r.movement.amount || 0),
            type: r.movement.type,
            investmentName: r.investmentName,
          },
        ]
        const rowKind = getRowKind(bucket, rowKey, dueReceipts)
        const daysHeld = diffDaysFloor(r.eligibilityStart, r.receiptDay)
        const why = rowKind === 'COMMISSION'
          ? `Commission from sale on ${isoDay(bucket.haulStartDate)}, held ${daysHeld} days`
          : rowKind === 'PRINCIPAL'
            ? `Principal received on ${isoDay(r.receiptDay)}, investment ran ${daysHeld} days (\u2265354)`
            : `Profit received on ${isoDay(r.receiptDay)}, investment ran ${daysHeld} days (\u2265354)`
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
          why,
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
        // If receipt itself completed the first hawl (>=354), next hawl starts from receipt day.
        // If receipt happened before first hawl completion, keep continuity from eligibilityStart.
        const idleAnchorStart = r.eligibilityDuration >= 354 ? r.receiptDay : r.eligibilityStart
        const idleElapsed = diffDaysFloor(idleAnchorStart, now)
        const completedIdleHauls = Math.floor(idleElapsed / 354)
        if (completedIdleHauls <= 0) return

        for (let i = 0; i < completedIdleHauls; i++) {
          const periodStart = addDays(idleAnchorStart, i * 354)
          const periodEnd = addDays(idleAnchorStart, (i + 1) * 354)
          const periodEndTime = periodEnd.getTime()

          const poolOutstanding = qualifyingReceipts
            .filter((q) => q.receiptDay.getTime() < periodEndTime)
            .reduce((s, q) => s + q.amount, 0)

          const balanceAtEnd = Math.max(0, Number(bucket.balance) || 0)
          const ratio = poolOutstanding > 0 ? Math.min(1, balanceAtEnd / poolOutstanding) : 0
          const idleAmount = Math.max(0, r.amount * ratio)

          const rowKey = buildRowKey(['IDLE', bucket.id, r.movementId, isoDay(periodStart), isoDay(periodEnd)])
          const isPaid = movementHasRowPaid(payments, rowKey)
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
            label: `Idle \u2022 ${r.investmentName} \u2022 ${isoDay(periodStart)} \u2192 ${isoDay(periodEnd)}`,
            currency: bucket.currency,
            balance: displayBalance,
            haulStartDate: isoDay(r.eligibilityStart),
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

      const hasAnyInvestOut = movements.some((m: any) => m?.type === 'INVEST_OUT')
      const hasPrincipalWithdrawal = movements.some((m: any) => m?.type === 'WITHDRAW_PRINCIPAL' || m?.type === 'ROLLBACK_PRINCIPAL')
      const disableDepositIdle = user.role === 'PARTNER' && isSukukPrincipalBucket
      if (!hasAnyInvestOut && !hasPrincipalWithdrawal && !isImmediateReceiptBucket && !disableDepositIdle) {
        const start = startOfDay(bucketStart)
        const elapsed = diffDaysFloor(start, now)
        const completed = Math.floor(elapsed / 354)
        for (let i = 0; i < completed; i++) {
          const periodStart = addDays(start, i * 354)
          const periodEnd = addDays(start, (i + 1) * 354)
          const balanceAtEnd = Math.max(0, Number(bucket.balance) || 0)
          if (balanceAtEnd <= 0) continue

          const rowKey = buildRowKey(['DEPOSIT', bucket.id, isoDay(periodStart), isoDay(periodEnd)])
          const isPaid = movementHasRowPaid(payments, rowKey)
          const zakatDue = !isPaid ? balanceAtEnd * 0.025 : 0
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
            idleBase: balanceAtEnd,
            receiptsTotal: 0,
            zakatDue,
            isPaid,
            haulCompleted: now.getTime() >= periodEnd.getTime(),
            source,
            sourceGroup,
            sourceType,
            rowKind: 'IDLE',
            why: `Cash idle from ${isoDay(periodStart)} to ${isoDay(periodEnd)} (${idleDays} days)`,
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
            Total zakatable wealth is SAR {totalZakatableWealthForNisab.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.
            Nisab is SAR {nisabValue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}.
          </div>
        </div>
      )}

      <ZakatPageClient initialBuckets={rows} zakatEnabled={zakatEnabled} />
    </div>
  )
}
