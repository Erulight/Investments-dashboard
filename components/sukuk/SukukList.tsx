'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Table, TableHeader, TableBody, TableFooter, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import { Button } from '@/components/ui/Button'
import { Modal } from './SukukModal'
import { DateInput } from '@/components/ui/DateInput'
import { formatDateInput, toIsoDateInput } from '@/lib/date'
import { SukukForm } from './SukukForm'

const Icon = ({ children }: { children: ReactNode }) => (
  <span className="inline-flex h-4 w-4 items-center justify-center">{children}</span>
)

const EditIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
)

const WithdrawIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3v12" />
    <path d="m7 10 5 5 5-5" />
    <path d="M4 21h16" />
  </svg>
)

const ReopenIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12a9 9 0 1 1-2.64-6.36" />
    <path d="M21 3v7h-7" />
  </svg>
)

const SellIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 12H4" />
    <path d="m14 6 6 6-6 6" />
  </svg>
)

const TrashIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6h18" />
    <path d="M8 6V4h8v2" />
    <path d="M6 6l1 16h10l1-16" />
    <path d="M10 11v6" />
    <path d="M14 11v6" />
  </svg>
)

interface SukukListProps {
  initialSukuk: any[]
  userRole: string
  ownerPersonId?: string | null
  viewerPersonId?: string | null
}

export function SukukList({ initialSukuk, userRole, ownerPersonId, viewerPersonId }: SukukListProps) {
  const router = useRouter()

  if (typeof window !== 'undefined') {
    const anyRouter = router as any
    if (!anyRouter.__debugPatched) {
      anyRouter.__debugPatched = true
      if (typeof anyRouter.push === 'function') {
        const originalPush = anyRouter.push.bind(anyRouter)
        anyRouter.push = (...args: any[]) => {
          console.log('router.push called from SukukList:', ...args)
          return originalPush(...args)
        }
      }
      if (typeof anyRouter.replace === 'function') {
        const originalReplace = anyRouter.replace.bind(anyRouter)
        anyRouter.replace = (...args: any[]) => {
          console.log('router.replace called from SukukList:', ...args)
          return originalReplace(...args)
        }
      }
    }
  }
  const searchParams = useSearchParams()
  const [sukuk, setSukuk] = useState<any[]>(
    Array.isArray(initialSukuk) ? initialSukuk : []
  )

  const canActOnDeals = userRole === 'OWNER' || userRole === 'PARTNER'

  useEffect(() => {
    setSukuk(Array.isArray(initialSukuk) ? initialSukuk : [])
  }, [initialSukuk])

  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' }>(() => ({
    key: 'maturityDate',
    dir: 'asc',
  }))
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [editingSukuk, setEditingSukuk] = useState<any>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [detailTarget, setDetailTarget] = useState<any>(null)
  const [withdrawTarget, setWithdrawTarget] = useState<{ inv: any; metrics: any } | null>(null)
  const [sellTarget, setSellTarget] = useState<any>(null)
  const [withdrawForm, setWithdrawForm] = useState({
    type: 'BOTH' as 'PRINCIPAL' | 'PROFIT' | 'BOTH',
    principalAmount: '',
    profitAmount: '',
    date: formatDateInput(new Date()),
    notes: '',
  })
  const [sellForm, setSellForm] = useState({
    buyerPersonId: '',
    amount: '',
    salePrice: '',
    paymentMode: 'CASH',
    debtId: '',
    commissionType: 'FIXED',
    commissionValue: '',
    date: formatDateInput(new Date()),
    notes: '',
  })
  const [partners, setPartners] = useState<any[]>([])
  const [debts, setDebts] = useState<any[]>([])
  const [actionError, setActionError] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [returnModalOpen, setReturnModalOpen] = useState(false)
  const [returnInvestment, setReturnInvestment] = useState<any>(null)
  const [filters, setFilters] = useState({
    platforms: [] as string[],
    terms: [] as string[],
    years: [] as string[],
    months: [] as string[],
    days: [] as string[],
    statuses: [] as string[],
  })
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [filterTab, setFilterTab] = useState<'platforms' | 'terms' | 'statuses' | 'dates'>('platforms')
  const [ownerView, setOwnerView] = useState<'all' | 'active' | 'closed' | 'sold'>('all')
  const list = Array.isArray(sukuk) ? sukuk : []
  const isEmpty = list.length === 0

  const openCreateModal = () => setIsCreateModalOpen(true)
  const asOfDate = new Date()
  const asOfLabel = asOfDate.toLocaleDateString()

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

  const getOwnerParticipant = (participantList: any[]) => {
    if (!ownerPersonId) return null
    return participantList.find((p: any) => p?.personId === ownerPersonId) || null
  }

  const isSoldDealForOwnerView = (investment: any) => {
    if (userRole !== 'OWNER' || !ownerPersonId) return false
    const participantList = Array.isArray(investment?.dealParticipants) ? investment.dealParticipants : []
    if (participantList.length === 0) return false
    const ownerParticipant = getOwnerParticipant(participantList)
    if (!ownerParticipant) return true
    return Number(ownerParticipant.investedAmount || 0) <= 0
  }

  const isViewerTransaction = (tx: any) => {
    if (userRole === 'OWNER') {
      if (tx?.personId == null) return true
      return ownerPersonId ? tx.personId === ownerPersonId : false
    }
    if (viewerPersonId) return tx?.personId === viewerPersonId
    return true
  }

  const getViewerReceived = (inv: any) => {
    const transactions = Array.isArray(inv.transactions) ? inv.transactions : []
    const profitWithdrawals = transactions.filter((tx: any) => tx.type === 'WITHDRAW_PROFIT')

    const scopedSum = profitWithdrawals.reduce((sum: number, tx: any) => {
      if (!isViewerTransaction(tx)) return sum
      const amount = Number(tx.amount)
      return sum + (Number.isFinite(amount) ? amount : 0)
    }, 0)

    if (userRole === 'OWNER') {
      const totalReceived = Number(inv.totalReceived)
      return Number.isFinite(totalReceived) ? totalReceived : scopedSum
    }

    if (viewerPersonId) {
      return scopedSum
    }

    const totalReceived = Number(inv.totalReceived)
    return Number.isFinite(totalReceived)
      ? totalReceived
      : scopedSum
  }

  const formatDate = (value?: string | Date | null) => {
    const date = toDate(value)
    if (!date) return '-'
    return date.toLocaleDateString('en-CA')
  }

  const formatCurrency = (value: number, currency?: string) => {
    const amount = Number.isFinite(value) ? value : 0
    const formatted = amount.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
    return currency ? `${currency} ${formatted}` : formatted
  }

  const formatPercent = (value: number) => {
    const percent = Number.isFinite(value) ? value : 0
    return `${percent.toFixed(2)}%`
  }

  const getPeriodMonths = (start?: string | Date | null, end?: string | Date | null) => {
    const startDate = toDate(start)
    const endDate = toDate(end)
    if (!startDate || !endDate) return null
    const months = (endDate.getFullYear() - startDate.getFullYear()) * 12
      + (endDate.getMonth() - startDate.getMonth())
      + (endDate.getDate() - startDate.getDate()) / 30
    return Math.max(0, months)
  }

  const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())

  const getLatestReceiptDate = (inv: any) => {
    const transactions = Array.isArray(inv.transactions) ? inv.transactions : []
    const profitReceipts = transactions.filter((tx: any) => tx.type === 'WITHDRAW_PROFIT' && isViewerTransaction(tx))
    if (profitReceipts.length === 0) return null
    return profitReceipts.reduce((latest: Date | null, tx: any) => {
      const txDate = toDate(tx.date)
      if (!txDate) return latest
      if (!latest || txDate > latest) return txDate
      return latest
    }, null)
  }

  const getLatestPrincipalWithdrawalDate = (inv: any) => {
    const transactions = Array.isArray(inv.transactions) ? inv.transactions : []
    const principalWithdrawals = transactions.filter((tx: any) => tx.type === 'WITHDRAW_PRINCIPAL')
    if (principalWithdrawals.length === 0) return null

    const filtered = principalWithdrawals.filter((tx: any) => isViewerTransaction(tx))

    if (filtered.length === 0) return null
    return filtered.reduce((latest: Date | null, tx: any) => {
      const txDate = toDate(tx.date)
      if (!txDate) return latest
      if (!latest || txDate > latest) return txDate
      return latest
    }, null)
  }

  const getHistoricalPrincipal = (inv: any, participation: any) => {
    const participationPrincipal = Number(participation?.investedAmount)
    const investmentPrincipal = Number(inv.principalAmount)
    const currentPrincipal = Number.isFinite(participationPrincipal)
      ? participationPrincipal
      : (Number.isFinite(investmentPrincipal) ? investmentPrincipal : 0)

    const transactions = Array.isArray(inv.transactions) ? inv.transactions : []
    const principalWithdrawals = transactions.filter((tx: any) => tx.type === 'WITHDRAW_PRINCIPAL')
    const withdrawalSum = principalWithdrawals
      .filter((tx: any) => isViewerTransaction(tx))
      .reduce((sum: number, tx: any) => {
        const amount = Number(tx.amount)
        return sum + (Number.isFinite(amount) ? amount : 0)
      }, 0)

    return Math.max(0, currentPrincipal + withdrawalSum)
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

  const handleReturnToOwner = async (investment: any) => {
    if (actionLoading) return
    const participants = Array.isArray(investment?.dealParticipants) ? investment.dealParticipants : []
    const myParticipation = investment?.myParticipation
      || (viewerPersonId ? participants.find((p: any) => p?.personId === viewerPersonId) : null)

    const principalRaw = Number(myParticipation?.investedAmount ?? 0)
    const principal = Number.isFinite(principalRaw) ? principalRaw : 0
    if (principal <= 0) {
      setActionError('Your principal balance is 0')
      return
    }

    // Get owner personId from SELL_TO_PARTNER transaction
    const sellTx = investment.transactions?.find(
      (t: any) => t.type === 'SELL_TO_PARTNER'
    )
    const meta = sellTx?.metadata
      ? JSON.parse(sellTx.metadata) : null

    // Owner is the one who originally sold — stored in BUY_FROM_PARTNER as sellerPersonId
    const buyTx = investment.transactions?.find(
      (t: any) => t.type === 'BUY_FROM_PARTNER'
    )
    const buyMeta = buyTx?.metadata
      ? JSON.parse(buyTx.metadata) : null

    const resolvedOwnerPersonId = buyMeta?.sellerPersonId || meta?.sellerPersonId || ownerPersonId

    console.log('RETURN TO OWNER START', {
      investmentId: investment.id,
      partnerInvestedAmount: myParticipation?.investedAmount,
      ownerPersonId: resolvedOwnerPersonId,
      sellTx: sellTx?.id,
      buyTx: buyTx?.id,
      meta,
      buyMeta,
    })

    if (!resolvedOwnerPersonId) {
      setActionError('Owner profile is missing')
      return
    }

    setReturnInvestment(investment)
    setReturnModalOpen(true)
  }

  const confirmReturnToOwner = async () => {
    if (!returnInvestment) return
    const investment = returnInvestment
    const participants = Array.isArray(investment?.dealParticipants) ? investment.dealParticipants : []
    const myParticipation = investment?.myParticipation
      || (viewerPersonId ? participants.find((p: any) => p?.personId === viewerPersonId) : null)

    const principalRaw = Number(myParticipation?.investedAmount ?? 0)
    const principal = Number.isFinite(principalRaw) ? principalRaw : 0

    // Get owner personId from SELL_TO_PARTNER transaction
    const sellTx = investment.transactions?.find(
      (t: any) => t.type === 'SELL_TO_PARTNER'
    )
    const meta = sellTx?.metadata
      ? JSON.parse(sellTx.metadata) : null

    // Owner is the one who originally sold — stored in BUY_FROM_PARTNER as sellerPersonId
    const buyTx = investment.transactions?.find(
      (t: any) => t.type === 'BUY_FROM_PARTNER'
    )
    const buyMeta = buyTx?.metadata
      ? JSON.parse(buyTx.metadata) : null

    const resolvedOwnerPersonId = buyMeta?.sellerPersonId || meta?.sellerPersonId || ownerPersonId

    setReturnModalOpen(false)
    setActionLoading(true)
    setActionError('')
    try {
      const isoDate = new Date().toISOString().split('T')[0]
      const res = await fetch(`/api/sukuk/${investment.id}/sell`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buyerPersonId: resolvedOwnerPersonId,
          amount: principal,
          salePrice: 0,
          paymentMode: 'CASH',
          commissionType: 'FIXED',
          commissionValue: 0,
          date: isoDate,
          notes: 'Return to owner',
          restoreSnapshot: {
            principalAmount: Number(investment.principalAmount ?? 0),
            currentValue: Number(investment.principalAmount ?? 0),
            receivableAmount: Number(investment.receivableAmount ?? 0),
            interestRate: Number(investment.interestRate ?? 0),
            fees: Number(investment.fees ?? 0),
            totalReceived: Number(investment.totalReceived ?? 0),
            realizedProfit: Number(investment.realizedProfit ?? 0),
            unrealizedProfit: Number(investment.unrealizedProfit ?? 0),
            startDate: investment.startDate,
          },
        }),
      })

      const data = await res.json()
      console.log('RETURN TO OWNER RESPONSE', res.status, data)

      if (!res.ok) {
        alert(`Failed: ${data.error || 'Unknown error'}`)
        setActionError(data.error || 'Failed to return Sukuk')
        return
      }

      window.location.reload()
    } catch (err) {
      console.error('RETURN TO OWNER ERROR', err)
      alert(`Error: ${String(err)}`)
      setActionError('Failed to return Sukuk')
    } finally {
      setActionLoading(false)
    }
  }

  const handleReceiveAndClose = async (investment: any, metrics: any) => {
    if (actionLoading) return
    setActionLoading(true)
    setActionError('')
    try {
      const isSoldDealForOwner = isSoldDealForOwnerView(investment)

      // For sold deals, call the receive route instead of withdraw
      if (isSoldDealForOwner) {
        const res = await fetch(`/api/sukuk/${investment.id}/receive`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setActionError(data.error || 'Failed to receive sold deal')
          setActionLoading(false)
          return
        }
        window.location.reload()
        return
      }

      // For non-sold deals, open the withdraw modal
      openWithdrawModal(investment, metrics)
    } catch (error) {
      setActionError('Failed to receive sold deal')
      setActionLoading(false)
    }
  }

  const getPartnerCommissionPaid = (inv: any) => {
    if (!viewerPersonId) return 0
    const transactions = Array.isArray(inv.transactions) ? inv.transactions : []

    const buys = transactions
      .filter((tx: any) => tx.type === 'BUY_FROM_PARTNER' && tx.personId === viewerPersonId)
      .map((tx: any) => ({ tx, d: toDate(tx?.date) }))
      .filter((x: any) => x.d)

    const sells = transactions
      .filter((tx: any) => tx.type === 'SELL_TO_PARTNER' && tx.personId === viewerPersonId)
      .map((tx: any) => toDate(tx?.date))
      .filter((d: any) => d)

    const hasSellAfter = (buyDate: Date) => sells.some((sd: Date) => (sd as any).getTime() >= (buyDate as any).getTime())

    return buys.reduce((sum: number, b: any) => {
      if (hasSellAfter(b.d as Date)) return sum
      const meta = parseMetadata(b.tx?.metadata)
      const commission = Number(meta?.commissionAmount ?? 0)
      return sum + (Number.isFinite(commission) ? Math.max(0, commission) : 0)
    }, 0)
  }

  const getSoldDealMetrics = (inv: any) => {
    const currency = inv.account?.currency || ''
    const transactions = Array.isArray(inv.transactions) ? inv.transactions : []

    const sellTxs = transactions
      .filter((tx: any) => tx.type === 'SELL_TO_PARTNER' && (!ownerPersonId || tx.personId === ownerPersonId))
      .map((tx: any) => ({ tx, meta: parseMetadata(tx.metadata) }))
      .filter((x: any) => x.tx)

    const sellTx = sellTxs
      .map((x: any) => ({
        ...x,
        d: toDate(x.tx.date),
      }))
      .filter((x: any) => x.d)
      .sort((a: any, b: any) => (b.d as Date).getTime() - (a.d as Date).getTime())[0]

    const saleDate = sellTx?.d ? startOfDay(sellTx.d) : null
    const principalSold = Number(sellTx?.meta?.principalTransferred ?? sellTx?.meta?.amount ?? 0)
    const salePrice = Number(sellTx?.meta?.salePrice ?? sellTx?.tx?.amount ?? 0)

    const commissionEarned = transactions
      .filter((tx: any) => tx.type === 'PARTNER_COMMISSION')
      .reduce((sum: number, tx: any) => {
        const meta = parseMetadata(tx.metadata)
        if (meta?.investmentId && meta.investmentId !== inv.id) return sum
        const amount = Number(tx.amount)
        return sum + (Number.isFinite(amount) ? amount : 0)
      }, 0)

    const apr = Number.isFinite(inv.interestRate) ? inv.interestRate : 0
    const meta = sellTx?.meta || null

    const investorDays = Number(meta?.investorDays ?? 0)
    const totalDays = Number(meta?.totalDays ?? 0)
    const monthsHeld = investorDays > 0 ? investorDays / 30 : (saleDate ? getPeriodMonths(inv.startDate, saleDate) : null)

    const investorProfit = Math.round(Number(meta?.investorProfit ?? 0) * 100) / 100
    const investorFeeShare = Math.round(Number(meta?.investorFeeShare ?? 0) * 100) / 100
    const partnerFeeShare = Math.round(Number(meta?.partnerFeeShare ?? 0) * 100) / 100
    const accruedProfitAtSale = Math.round(Number(meta?.accruedProfitAtSale ?? 0) * 100) / 100

    // This is the realized gain booked for the owner at sale time per business rules:
    // owner net profit for held days + fee share recovered from partner.
    const profitEarnedToSale = Number.isFinite(accruedProfitAtSale)
      ? Math.max(0, accruedProfitAtSale)
      : Math.max(0, investorProfit + partnerFeeShare)

    const feesHeld = Number.isFinite(investorFeeShare) ? Math.max(0, investorFeeShare) : 0
    const cashInflow = Math.max(0, salePrice) + Math.max(0, commissionEarned)

    // Calculate APR after fees
    const periodYears = monthsHeld ? monthsHeld / 12 : 0
    const aprAfterFees = principalSold > 0 && periodYears > 0
      ? ((profitEarnedToSale - feesHeld) / principalSold / periodYears) * 100
      : 0

    // Calculate days remaining and payment status
    const daysRemaining = getDaysRemaining(inv.maturityDate, saleDate ?? asOfDate)
    const paymentStatus = daysRemaining === null
      ? 'unknown'
      : daysRemaining < 0
        ? 'delayed'
        : daysRemaining > 0
          ? 'early'
          : 'ontime'

    return {
      totalInvestment: Number.isFinite(principalSold) ? principalSold : 0,
      apr,
      fees: feesHeld,
      netProfit: profitEarnedToSale,
      commissionEarned,
      acquiredAt: null,
      commissionPaid: 0,
      cashInflow,
      totalReceived: cashInflow,
      receivable: 0,
      periodMonths: monthsHeld,
      daysRemaining,
      paymentStatus,
      progress: getProgress(Math.max(0, cashInflow), Math.max(0, cashInflow)),
      currency,
      aprAfterFees: Number.isFinite(aprAfterFees) ? aprAfterFees : 0,
      saleDate,
      salePrice,
      principalSold,
      investorDays: Number.isFinite(investorDays) ? investorDays : null,
      totalDays: Number.isFinite(totalDays) ? totalDays : null,
    }
  }

  const getDaysRemaining = (end?: string | Date | null, reference?: Date | null) => {
    const endDate = toDate(end)
    if (!endDate) return null
    const asOf = startOfDay(reference ?? asOfDate)
    const endDay = startOfDay(endDate)
    const diffMs = endDay.getTime() - asOf.getTime()
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
    return diffDays
  }

  const getProgress = (netProfit: number, totalReceived: number) => {
    if (netProfit <= 0) {
      return { percent: 0, className: 'bg-gray-100 text-gray-700' }
    }
    const percent = Math.min(100, Math.max(0, (totalReceived / netProfit) * 100))
    const className = percent >= 100 ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
    return { percent, className }
  }

  const getMetrics = (inv: any) => {
    const participantList = Array.isArray(inv.dealParticipants) ? inv.dealParticipants : []
    const isSoldForOwner = isSoldDealForOwnerView(inv)

    const ownerParticipation =
      userRole === 'OWNER'
        ? getOwnerParticipant(participantList)
        : null

    const participation = userRole === 'OWNER'
      ? (participantList.length === 0
          ? {
              investedAmount: inv.principalAmount,
              acquiredAt: inv.startDate,
              commissionFees: 0,
            }
          : ownerParticipation)
      : (inv.myParticipation || null)

    if (isSoldForOwner) {
      return {
        totalInvestment: 0,
        apr: Number.isFinite(inv.interestRate) ? inv.interestRate : 0,
        fees: 0,
        netProfit: 0,
        commissionEarned: 0,
        commissionPaid: 0,
        acquiredAt: null,
        totalReceived: 0,
        receivable: 0,
        periodMonths: getPeriodMonths(inv.startDate, inv.maturityDate),
        daysRemaining: getDaysRemaining(inv.maturityDate, asOfDate),
        paymentStatus: 'sold',
        progress: getProgress(0, 0),
        currency: inv.account?.currency || '',
        aprAfterFees: 0,
      }
    }

    const endBasis = getLatestPrincipalWithdrawalDate(inv) ?? inv.maturityDate
    const principal = getHistoricalPrincipal(inv, participation)
    const totalInvestment = Number.isFinite(principal) ? principal : 0
    const apr = Number.isFinite(inv.interestRate) ? inv.interestRate : 0
    const fullFees = Number.isFinite(inv.fees) ? inv.fees : 0
    const principalBase = Number(inv.principalAmount)
    const participationRatio = totalInvestment > 0
      ? (Number.isFinite(principalBase) && principalBase > 0
          ? Math.min(1, totalInvestment / principalBase)
          : 1)
      : 0
    const totalMonthsFull = getPeriodMonths(inv.startDate, inv.maturityDate)
    const startBasis = participation?.acquiredAt ?? inv.startDate
    const periodMonths = getPeriodMonths(startBasis, endBasis)
    const timeRatio = totalMonthsFull && periodMonths !== null && totalMonthsFull > 0
      ? Math.min(1, Math.max(0, periodMonths / totalMonthsFull))
      : 1
    const round2 = (n: number) => Math.round((n || 0) * 100) / 100
    
    const fees = round2(participation
      ? (fullFees * participationRatio) * timeRatio
      : fullFees)

    const totalReceived = getViewerReceived(inv)
    const periodYears = periodMonths ? periodMonths / 12 : 0
    
    const grossProfit = totalInvestment > 0 && apr > 0 && periodYears > 0
      ? totalInvestment * (apr / 100) * periodYears
      : 0
    const manualReceivableFull = Number.isFinite(inv.receivableAmount) ? round2(inv.receivableAmount) : null
    const manualReceivable = manualReceivableFull !== null && manualReceivableFull > 0
      ? (participation ? round2((manualReceivableFull * participationRatio) * timeRatio) : manualReceivableFull)
      : null
    const commissionFees = Number.isFinite(participation?.commissionFees)
      ? round2(Number(participation.commissionFees))
      : 0
    
    const netProfit = round2(manualReceivable !== null
      ? Math.max(0, manualReceivable - commissionFees)
      : Math.max(0, grossProfit - fees - commissionFees))
    const aprAfterFees = totalInvestment > 0 && periodYears > 0
      ? ((netProfit / totalInvestment) / periodYears) * 100
      : 0
    const receivable = round2(Math.max(0, netProfit - totalReceived))
    const receiptDate = getLatestReceiptDate(inv)
    const isFullyReceived = receivable <= 0.01
    const referenceDate = isFullyReceived
      ? receiptDate ?? asOfDate
      : asOfDate
    const daysRemaining = getDaysRemaining(inv.maturityDate, referenceDate)

    const paymentStatus = daysRemaining === null
      ? 'unknown'
      : daysRemaining < 0
        ? 'delayed'
        : daysRemaining > 0
          ? 'early'
          : (isFullyReceived ? 'completed' : 'ontime')

    const progress = getProgress(netProfit, totalReceived)
    const currency = inv.account?.currency || ''

    return {
      totalInvestment,
      apr,
      periodMonths,
      maturityDate: inv.maturityDate,
      daysRemaining,
      fees,
      netProfit,
      commissionEarned: 0,
      commissionPaid: userRole === 'OWNER' ? 0 : getPartnerCommissionPaid(inv),
      totalReceived,
      receivable,
      currency,
      progress,
      paymentStatus,
      aprAfterFees,
      isFullyReceived,
      acquiredAt: participation?.acquiredAt ?? null,
    }
  }

  const toggleFilter = (key: keyof typeof filters, value: string) => {
    setFilters((prev) => {
      const list = prev[key]
      const exists = list.includes(value)
      const next = exists ? list.filter((item) => item !== value) : [...list, value]
      return { ...prev, [key]: next }
    })
  }

  const clearFilters = () => {
    setFilters({
      platforms: [],
      terms: [],
      years: [],
      months: [],
      days: [],
      statuses: [],
    })
  }

  const activeFilterCount = Object.values(filters).reduce((sum, list) => sum + list.length, 0)

  const filterOptions = list.reduce<{
    platforms: Set<string>
    terms: Set<string>
    years: Set<string>
    months: Set<string>
    days: Set<string>
  }>(
    (acc, inv) => {
      const platform = inv.account?.name
      if (platform) acc.platforms.add(platform)
      const maturityDate = toDate(inv.maturityDate)
      if (maturityDate) {
        acc.years.add(String(maturityDate.getFullYear()))
        acc.months.add(String(maturityDate.getMonth() + 1))
        acc.days.add(String(maturityDate.getDate()))
      }
      const metrics = getMetrics(inv)
      if (metrics.periodMonths !== null) {
        if (metrics.periodMonths <= 12) acc.terms.add('short')
        if (metrics.periodMonths > 12) acc.terms.add('long')
      }
      return acc
    },
    {
      platforms: new Set<string>(),
      terms: new Set<string>(),
      years: new Set<string>(),
      months: new Set<string>(),
      days: new Set<string>(),
    }
  )

  const filteredSukuk = list.filter((inv) => {
    if (userRole === 'OWNER' && ownerPersonId) {
      const participantList = Array.isArray(inv.dealParticipants) ? inv.dealParticipants : []
      const ownerParticipant = getOwnerParticipant(participantList)
      
      // Sold for owner when participants exist and owner has no principal left
      // (either owner row is missing, or investedAmount is 0)
      const isSoldDeal = participantList.length > 0
        && (!ownerParticipant || Number(ownerParticipant.investedAmount || 0) <= 0)
      const metrics = isSoldDeal ? getSoldDealMetrics(inv) : getMetrics(inv)
      const isClosedDeal = !isSoldDeal && Number(metrics.receivable || 0) <= 0.01
      const isActiveDeal = !isSoldDeal && !isClosedDeal

      if (ownerView === 'active' && !isActiveDeal) return false
      if (ownerView === 'closed' && !isClosedDeal) return false
      if (ownerView === 'sold' && !isSoldDeal) return false
      if (ownerView === 'all') {
        // show all
      }
    }
    const metrics = getMetrics(inv)
    const platform = inv.account?.name || ''
    const maturityDate = toDate(inv.maturityDate)
    const year = maturityDate ? String(maturityDate.getFullYear()) : null
    const month = maturityDate ? String(maturityDate.getMonth() + 1) : null
    const day = maturityDate ? String(maturityDate.getDate()) : null
    const term = metrics.periodMonths === null
      ? 'unknown'
      : metrics.periodMonths <= 12
        ? 'short'
        : 'long'

    if (filters.platforms.length > 0 && !filters.platforms.includes(platform)) {
      return false
    }

    if (filters.terms.length > 0 && !filters.terms.includes(term)) {
      return false
    }

    if (filters.years.length > 0 && (!year || !filters.years.includes(year))) {
      return false
    }

    if (filters.months.length > 0 && (!month || !filters.months.includes(month))) {
      return false
    }

    if (filters.days.length > 0 && (!day || !filters.days.includes(day))) {
      return false
    }

    if (filters.statuses.length > 0) {
      const statusChecks = {
        receivable: metrics.receivable > 0,
        received: metrics.receivable <= 0,
        nearClose: metrics.daysRemaining !== null && metrics.daysRemaining > 0 && metrics.daysRemaining <= 30,
        closing: metrics.daysRemaining !== null && metrics.daysRemaining <= 0,
      }
      const matches = filters.statuses.some((status) => {
        if (status === 'receivable') return statusChecks.receivable
        if (status === 'received') return statusChecks.received
        if (status === 'nearClose') return statusChecks.nearClose
        if (status === 'closing') return statusChecks.closing
        return false
      })
      if (!matches) return false
    }

    return true
  })

  const rows = useMemo(() => {
    return filteredSukuk.map((inv: any) => {
      const participantList = Array.isArray(inv.dealParticipants) ? inv.dealParticipants : []
      const ownerParticipant = getOwnerParticipant(participantList)
      const isSoldForOwner = userRole === 'OWNER' && ownerPersonId
        ? (participantList.length > 0 && (!ownerParticipant || Number(ownerParticipant.investedAmount || 0) <= 0))
        : false

      const metrics = isSoldForOwner ? getSoldDealMetrics(inv) : getMetrics(inv)

      return { inv, metrics }
    })
  }, [filteredSukuk, ownerView, ownerPersonId, userRole])

  const sortedRows = useMemo(() => {
    const dirMul = sort.dir === 'asc' ? 1 : -1
    const normalizeString = (value: unknown) => String(value ?? '').toLowerCase()
    const normalizeNumber = (value: unknown) => {
      const n = typeof value === 'number' ? value : Number(value)
      return Number.isFinite(n) ? n : 0
    }
    const normalizeDateMs = (value: unknown) => {
      const d = toDate(value as any)
      if (!d) return 0
      const ms = d.getTime()
      return Number.isFinite(ms) ? ms : 0
    }

    const getSortableValue = (row: { inv: any; metrics: any }) => {
      switch (sort.key) {
        case 'company':
          return normalizeString(row.inv?.name)
        case 'investment':
          return normalizeNumber(row.metrics?.totalInvestment)
        case 'apr':
          return normalizeNumber(row.metrics?.apr)
        case 'aprAfterFees':
          return normalizeNumber(row.metrics?.aprAfterFees)
        case 'period':
          return normalizeNumber(row.metrics?.periodMonths)
        case 'maturityDate':
          return normalizeDateMs(row.inv?.maturityDate)
        case 'days':
          return normalizeNumber(row.metrics?.daysRemaining)
        case 'fees':
          return normalizeNumber(row.metrics?.fees)
        case 'profit':
          return normalizeNumber(row.metrics?.netProfit)
        case 'received':
          return normalizeNumber(row.metrics?.totalReceived)
        case 'receivable':
          return normalizeNumber(row.metrics?.receivable)
        case 'status':
          return normalizeNumber(row.metrics?.progress?.percent)
        default:
          return 0
      }
    }

    const next = [...rows]
    next.sort((a, b) => {
      const av = getSortableValue(a)
      const bv = getSortableValue(b)
      if (typeof av === 'string' && typeof bv === 'string') {
        return av.localeCompare(bv) * dirMul
      }
      return (normalizeNumber(av) - normalizeNumber(bv)) * dirMul
    })
    return next
  }, [rows, sort, toDate])

  const totals = useMemo(() => {
    if (sortedRows.length === 0) return null
    return sortedRows.reduce(
      (
        acc: {
          currency: string
          investment: number
          fees: number
          profit: number
          commission: number
          commissionPaid: number
          received: number
          receivable: number
        },
        row: { metrics: any }
      ) => {
        const m = row.metrics
        acc.currency = acc.currency || String(m.currency || 'SAR')
        acc.investment += Number(m.totalInvestment || 0)
        acc.fees += Number(m.fees || 0)
        acc.profit += Number(m.netProfit || 0)
        acc.commission += Number(m.commissionEarned || 0)
        acc.commissionPaid += Number(m.commissionPaid || 0)
        acc.received += Number(m.totalReceived || 0)
        acc.receivable += Number(m.receivable || 0)
        return acc
      },
      { currency: '', investment: 0, fees: 0, profit: 0, commission: 0, commissionPaid: 0, received: 0, receivable: 0 }
    )
  }, [sortedRows])

  const [expandedPlatforms, setExpandedPlatforms] = useState<Record<string, boolean>>({})

  useEffect(() => {
    // Ensure newly-seen platforms default to expanded while preserving existing state
    setExpandedPlatforms((prev) => {
      const next = { ...prev }
      sortedRows.forEach(({ inv }) => {
        const platform = inv.account?.name || 'Unknown Platform'
        if (!(platform in next)) {
          next[platform] = true
        }
      })
      return next
    })
  }, [sortedRows])

  const groupedByPlatform = useMemo(() => {
    const groups: Record<string, {
      rows: { inv: any; metrics: any }[]
      totals: {
        deals: number
        investment: number
        profit: number
        receivable: number
        currency: string
      }
    }> = {}

    sortedRows.forEach(({ inv, metrics }) => {
      const platform = inv.account?.name || 'Unknown Platform'
      if (!groups[platform]) {
        groups[platform] = {
          rows: [],
          totals: {
            deals: 0,
            investment: 0,
            profit: 0,
            receivable: 0,
            currency: metrics.currency || inv.account?.currency || 'SAR',
          },
        }
      }

      const g = groups[platform]
      g.rows.push({ inv, metrics })
      g.totals.deals += 1
      g.totals.investment += Number(metrics.totalInvestment || 0)
      g.totals.profit += Number(metrics.netProfit || 0)
      g.totals.receivable += Number(metrics.receivable || 0)
    })

    return groups
  }, [sortedRows])

  const toggleSort = (key: string) => {
    setSort((prev) => {
      if (prev.key === key) {
        return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      }
      return { key, dir: 'asc' }
    })
  }

  const sortIndicator = (key: string) => {
    if (sort.key !== key) return null
    return (
      <span className="ml-1 text-[10px] text-gray-500">{sort.dir === 'asc' ? '▲' : '▼'}</span>
    )
  }

  const resetWithdrawForm = () => {
    setWithdrawForm({
      type: 'BOTH',
      principalAmount: '',
      profitAmount: '',
      date: formatDateInput(new Date()),
      notes: '',
    })
  }

  const resetSellForm = () => {
    setSellForm({
      buyerPersonId: '',
      amount: '',
      salePrice: '',
      paymentMode: 'CASH',
      debtId: '',
      commissionType: 'FIXED',
      commissionValue: '',
      date: formatDateInput(new Date()),
      notes: '',
    })
  }

  const openWithdrawModal = (investment: any, metricsOverride?: any) => {
    setActionError('')

    const participantList = Array.isArray(investment?.dealParticipants)
      ? investment.dealParticipants
      : []
    const isSoldDealForOwner = isSoldDealForOwnerView(investment)

    const metrics = metricsOverride || (isSoldDealForOwner ? getSoldDealMetrics(investment) : getMetrics(investment))

    // Compute viewer-specific remaining principal and profit
    const currencyLabel = investment?.account?.currency || 'SAR'

    let principalRemaining = 0
    const receivableRemaining = Math.max(0, Number(metrics?.receivable ?? 0))

    const partnerClosed = Boolean(investment?.partnerClosed)

    if (userRole === 'OWNER') {
      const principalRaw = Number(investment?.principalAmount ?? 0)
      principalRemaining = Number.isFinite(principalRaw) ? Math.max(0, principalRaw) : 0
    } else {
      // PARTNER: use their participation investedAmount as canonical principal
      const myParticipation = investment.myParticipation
        || (viewerPersonId
          ? participantList.find((p: any) => p?.personId === viewerPersonId)
          : null)

      const investedRaw = Number(myParticipation?.investedAmount ?? 0)
      principalRemaining = Number.isFinite(investedRaw) ? Math.max(0, investedRaw) : 0
    }

    const defaultType: 'PRINCIPAL' | 'PROFIT' | 'BOTH' =
      principalRemaining > 0 && receivableRemaining > 0
        ? 'BOTH'
        : principalRemaining > 0
          ? 'PRINCIPAL'
          : 'PROFIT'

    const enforcedType: 'PRINCIPAL' | 'PROFIT' | 'BOTH' =
      (userRole === 'OWNER' && isSoldDealForOwner)
        ? 'PROFIT'
        : defaultType

    const principalForForm = (userRole === 'OWNER' && isSoldDealForOwner) ? '' : (principalRemaining > 0 ? principalRemaining.toFixed(2) : '')

    setWithdrawTarget({ inv: investment, metrics })
    setWithdrawForm({
      type: enforcedType,
      principalAmount: principalForForm,
      profitAmount: isSoldDealForOwner
        ? (Number(metrics?.netProfit || 0) > 0 ? Number(metrics.netProfit || 0).toFixed(2) : '')
        : (receivableRemaining > 0 ? receivableRemaining.toFixed(2) : ''),
      date: formatDateInput(new Date()),
      notes: '',
    })
  }

  useEffect(() => {
    const receiveId = searchParams?.get('receive')
    if (!receiveId) return

    const inv = sukuk.find((s: any) => s?.id === receiveId)
    if (!inv) return

    // Auto-open the receipt modal when navigated here with ?receive=,
    // but avoid mutating the URL here to prevent fighting with
    // other navigation (e.g. navbar links).
    openWithdrawModal(inv)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, sukuk])

  const openSellModal = async (investment: any) => {
    setActionError('')
    setSellTarget(investment)
    resetSellForm()
    if (partners.length === 0) {
      try {
        const res = await fetch('/api/partners')
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(data.error || 'Failed to load partners')
        }
        setPartners(Array.isArray(data.partners) ? data.partners : [])
      } catch (error) {
        console.error('Failed to load partners:', error)
        setActionError('Failed to load partners.')
      }
    }

    if (userRole === 'OWNER' && debts.length === 0) {
      try {
        const res = await fetch('/api/debts')
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(data.error || 'Failed to load debts')
        }
        setDebts(Array.isArray(data.debts) ? data.debts : [])
      } catch (error) {
        console.error('Failed to load debts:', error)
      }
    }
  }

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!withdrawTarget) return
    if (actionLoading) return
    setActionError('')
    setActionLoading(true)
    try {
      const isSoldDealForOwner = isSoldDealForOwnerView(withdrawTarget.inv)
      const partnerClosed = Boolean(withdrawTarget.inv?.partnerClosed)

      // FIX 4: for sold deals, owner does not withdraw principal and does not directly withdraw profit/commission
      // from the investment. Profit bucket settlement + commission bucket are credited on partner closure.
      // Confirm here simply acknowledges and marks the notification as read.
      if (userRole === 'OWNER' && isSoldDealForOwner && partnerClosed) {
        const res = await fetch('/api/notifications/dismiss', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ investmentId: withdrawTarget.inv.id }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setActionError(data.error || 'Failed to mark notification as read')
          return
        }
        setWithdrawTarget(null)
        window.location.reload()
        return
      }

      if (userRole === 'OWNER' && isSoldDealForOwner && !partnerClosed) {
        setActionError('Waiting for partner to close their position before you can receive profit/commission.')
        setActionLoading(false)
        return
      }

      const hasPrincipal = withdrawForm.type === 'PRINCIPAL' || withdrawForm.type === 'BOTH'
      const hasProfit = withdrawForm.type === 'PROFIT' || withdrawForm.type === 'BOTH'

      const principalAmount = hasPrincipal ? Number(withdrawForm.principalAmount) : 0
      const profitAmount = hasProfit ? Number(withdrawForm.profitAmount) : 0

      if ((hasPrincipal && (!Number.isFinite(principalAmount) || principalAmount <= 0)) ||
          (hasProfit && (!Number.isFinite(profitAmount) || profitAmount <= 0))) {
        setActionError('Please enter valid amounts for the selected receipt type.')
        setActionLoading(false)
        return
      }

      const isoDate = toIsoDateInput(withdrawForm.date)
      if (!isoDate) {
        setActionError('Invalid date format')
        setActionLoading(false)
        return
      }
      const requests: { source: 'PRINCIPAL' | 'PROFIT'; amount: number }[] = []
      if (hasProfit && profitAmount > 0) {
        requests.push({ source: 'PROFIT', amount: profitAmount })
      }
      if (hasPrincipal && principalAmount > 0) {
        requests.push({ source: 'PRINCIPAL', amount: principalAmount })
      }

      for (const req of requests) {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 20000)
        let res: Response
        try {
          res = await fetch(`/api/sukuk/${withdrawTarget.inv.id}/withdraw`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              source: req.source,
              amount: req.amount,
              date: isoDate,
              notes: withdrawForm.notes,
            }),
            signal: controller.signal,
          })
        } finally {
          clearTimeout(timeout)
        }

        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setActionError(data.error || 'Failed to withdraw')
          setActionLoading(false)
          return
        }
      }

      setWithdrawTarget(null)
      setWithdrawForm({
        type: 'BOTH',
        principalAmount: '',
        profitAmount: '',
        date: formatDateInput(new Date()),
        notes: '',
      })
      window.location.reload()
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        setActionError('Request timed out. Please try again.')
      } else {
        setActionError('Failed to withdraw')
      }
    } finally {
      setActionLoading(false)
    }
  }

  const handleSell = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!sellTarget) return
    if (actionLoading) return
    setActionError('')
    setActionLoading(true)
    try {
      const isoDate = toIsoDateInput(sellForm.date)
      if (!isoDate) {
        setActionError('Invalid date format')
        setActionLoading(false)
        return
      }

      if (sellForm.paymentMode === 'SETTLE_DEBT' && !sellForm.debtId) {
        setActionError('Please select a debt to settle')
        setActionLoading(false)
        return
      }

      const res = await fetch(`/api/sukuk/${sellTarget.id}/sell`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buyerPersonId: sellForm.buyerPersonId,
          amount: parseFloat(sellForm.amount),
          salePrice: sellForm.paymentMode === 'SETTLE_DEBT'
            ? parseFloat(sellForm.amount)
            : sellForm.salePrice
              ? parseFloat(sellForm.salePrice)
              : undefined,
          paymentMode: sellForm.paymentMode,
          debtId: sellForm.paymentMode === 'SETTLE_DEBT' ? sellForm.debtId : undefined,
          commissionType: sellForm.commissionType,
          commissionValue: sellForm.commissionValue
            ? parseFloat(sellForm.commissionValue)
            : 0,
          date: isoDate,
          notes: sellForm.notes,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setActionError(data.error || 'Failed to sell')
        return
      }
      setSellTarget(null)
      setSellForm({
        buyerPersonId: '',
        amount: '',
        salePrice: '',
        paymentMode: 'CASH',
        debtId: '',
        commissionType: 'FIXED',
        commissionValue: '',
        date: formatDateInput(new Date()),
        notes: '',
      })
      window.location.reload()
    } catch (error) {
      setActionError('Failed to sell')
    } finally {
      setActionLoading(false)
    }
  }


  const handleReopen = async (investment: any) => {
    if (actionLoading) return
    const confirmed = confirm('Reopen will remove all receipts for this deal and reverse cash. Continue?')
    if (!confirmed) return
    setActionLoading(true)
    try {
      const res = await fetch(`/api/sukuk/${investment.id}/reopen`, {
        method: 'POST',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(data.error || 'Failed to reopen deal')
        return
      }
      window.location.reload()
    } catch (error) {
      alert('Failed to reopen deal')
    } finally {
      setActionLoading(false)
    }
  }

  const handleCreateSuccess = () => {
    setIsCreateModalOpen(false)
    window.location.reload()
  }

  const handleEditSuccess = () => {
    setIsEditModalOpen(false)
    setEditingSukuk(null)
    window.location.reload()
  }

  const handleEdit = (sukukItem: any) => {
    setEditingSukuk(sukukItem)
    setIsEditModalOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this Sukuk? This action cannot be undone.')) {
      return
    }

    setDeletingId(id)
    try {
      const res = await fetch(`/api/sukuk/${id}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'Failed to delete Sukuk')
        return
      }

      // Remove from local state
      setSukuk(list.filter((s) => s.id !== id))
      window.location.reload()
    } catch (error) {
      alert('An error occurred while deleting the Sukuk')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">All Sukuk Deals</h2>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            {filteredSukuk.length} of {list.length} deals
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500 dark:text-slate-400">As of {asOfLabel}</span>
          {userRole === 'OWNER' && ownerPersonId && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setOwnerView('all')}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  ownerView === 'all'
                    ? 'border-blue-600 bg-blue-600 text-white dark:bg-blue-500 dark:text-blue-100'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:border-white/20'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setOwnerView('active')}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  ownerView === 'active'
                    ? 'border-blue-600 bg-blue-600 text-white dark:bg-blue-500 dark:text-blue-100'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:border-white/20'
                }`}
              >
                Active
              </button>
              <button
                type="button"
                onClick={() => setOwnerView('closed')}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  ownerView === 'closed'
                    ? 'border-blue-600 bg-blue-600 text-white dark:bg-blue-500 dark:text-blue-100'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:border-white/20'
                }`}
              >
                Closed
              </button>
              <button
                type="button"
                onClick={() => setOwnerView('sold')}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  ownerView === 'sold'
                    ? 'border-blue-600 bg-blue-600 text-white dark:bg-blue-500 dark:text-blue-100'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:border-white/20'
                }`}
              >
                Sold
              </button>
            </div>
          )}
          {(userRole === 'OWNER' || userRole === 'PARTNER') && (
            <Button onClick={openCreateModal} variant="primary" size="sm">
              + Add New Deal
            </Button>
          )}
        </div>
      </div>

      {isEmpty ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center dark:border-white/10 dark:bg-slate-900/60">
          <div className="mb-3 text-4xl">💼</div>
          <h3 className="mb-1 text-lg font-bold text-slate-900 dark:text-slate-100">No Sukuk Investments Yet</h3>
          <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
            {userRole === 'OWNER'
              ? 'Start by creating your first Sukuk investment.'
              : 'Contact the owner to add you to Sukuk investments.'}
          </p>
          {(userRole === 'OWNER' || userRole === 'PARTNER') && (
            <Button onClick={openCreateModal} variant="primary">
              + Add New Deal
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="mb-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-slate-900/60">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setFiltersOpen((prev) => !prev)}
                >
                  {filtersOpen ? 'Hide Filters' : 'Show Filters'}
                </Button>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {activeFilterCount} active
                </span>
              </div>
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Clear all
              </Button>
            </div>

            {filtersOpen && (
              <div className="mt-4 rounded-lg border border-slate-200 dark:border-white/10">
                <div className="flex flex-wrap gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-white/10 dark:bg-slate-950/60">
                  {[
                    { key: 'platforms', label: 'Platforms' },
                    { key: 'terms', label: 'Term' },
                    { key: 'statuses', label: 'Status' },
                    { key: 'dates', label: 'Maturity' },
                  ].map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setFilterTab(tab.key as typeof filterTab)}
                      className={`rounded-full px-3 py-1 font-semibold ${
                        filterTab === tab.key
                          ? 'bg-blue-600 text-white'
                          : 'border border-slate-200 bg-white text-slate-600 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-300'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="p-4 text-xs text-slate-600 dark:text-slate-300">
                  {filterTab === 'platforms' && (
                    <div className="flex flex-wrap gap-2">
                      {Array.from(filterOptions.platforms).map((platform) => (
                        <label key={platform} className="flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={filters.platforms.includes(platform)}
                            onChange={() => toggleFilter('platforms', platform)}
                            className="h-3 w-3 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 dark:border-white/10 dark:bg-slate-900"
                          />
                          {platform}
                        </label>
                      ))}
                    </div>
                  )}

                  {filterTab === 'terms' && (
                    <div className="flex flex-wrap gap-2">
                      {['short', 'long'].map((term) => (
                        <label key={term} className="flex items-center gap-1 capitalize">
                          <input
                            type="checkbox"
                            checked={filters.terms.includes(term)}
                            onChange={() => toggleFilter('terms', term)}
                            className="h-3 w-3 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 dark:border-white/10 dark:bg-slate-900"
                          />
                          {term} term
                        </label>
                      ))}
                    </div>
                  )}

                  {filterTab === 'statuses' && (
                    <div className="flex flex-wrap gap-2">
                      {[
                        { key: 'receivable', label: 'Receivable' },
                        { key: 'received', label: 'Received' },
                        { key: 'nearClose', label: 'Near Close' },
                        { key: 'closing', label: 'Closing' },
                      ].map((status) => (
                        <label key={status.key} className="flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={filters.statuses.includes(status.key)}
                            onChange={() => toggleFilter('statuses', status.key)}
                            className="h-3 w-3 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 dark:border-white/10 dark:bg-slate-900"
                          />
                          {status.label}
                        </label>
                      ))}
                    </div>
                  )}

                  {filterTab === 'dates' && (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                      <div>
                        <div className="mb-2 font-semibold text-slate-500 dark:text-slate-400">Year</div>
                        <div className="flex flex-wrap gap-2">
                          {Array.from(filterOptions.years).sort().map((year) => (
                            <label key={year} className="flex items-center gap-1">
                              <input
                                type="checkbox"
                                checked={filters.years.includes(year)}
                                onChange={() => toggleFilter('years', year)}
                                className="h-3 w-3 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 dark:border-white/10 dark:bg-slate-900"
                              />
                              {year}
                            </label>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div className="mb-2 font-semibold text-slate-500 dark:text-slate-400">Month</div>
                        <div className="flex flex-wrap gap-2">
                          {Array.from(filterOptions.months)
                            .sort((a, b) => Number(a) - Number(b))
                            .map((month) => (
                              <label key={month} className="flex items-center gap-1">
                                <input
                                  type="checkbox"
                                  checked={filters.months.includes(month)}
                                  onChange={() => toggleFilter('months', month)}
                                  className="h-3 w-3 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 dark:border-white/10 dark:bg-slate-900"
                                />
                                {month}
                              </label>
                            ))}
                        </div>
                      </div>
                      <div>
                        <div className="mb-2 font-semibold text-slate-500 dark:text-slate-400">Day</div>
                        <div className="flex flex-wrap gap-2">
                          {Array.from(filterOptions.days)
                            .sort((a, b) => Number(a) - Number(b))
                            .map((dayValue) => (
                              <label key={dayValue} className="flex items-center gap-1">
                                <input
                                  type="checkbox"
                                  checked={filters.days.includes(dayValue)}
                                  onChange={() => toggleFilter('days', dayValue)}
                                  className="h-3 w-3 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 dark:border-white/10 dark:bg-slate-900"
                                />
                                {dayValue}
                              </label>
                            ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          {filteredSukuk.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-600">
              No deals match the selected filters.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
              <Table className="text-xs table-auto min-w-[980px]">
                <TableHeader className="sticky top-0 bg-white">
                  <TableRow>
                    <TableHead className="px-2 py-1.5 text-xs whitespace-nowrap">
                      <button type="button" onClick={() => toggleSort('company')} className="inline-flex items-center hover:text-gray-900">
                        Company{sortIndicator('company')}
                      </button>
                    </TableHead>
                    <TableHead className="px-2 py-1.5 text-xs whitespace-nowrap text-right">
                      <button type="button" onClick={() => toggleSort('investment')} className="inline-flex items-center hover:text-gray-900">
                        Investment{sortIndicator('investment')}
                      </button>
                    </TableHead>
                    <TableHead className="px-2 py-1.5 text-xs whitespace-nowrap text-right">
                      <button type="button" onClick={() => toggleSort('apr')} className="inline-flex items-center hover:text-gray-900">
                        APR{sortIndicator('apr')}
                      </button>
                    </TableHead>
                    <TableHead className="px-2 py-1.5 text-xs whitespace-nowrap text-right">
                      <button type="button" onClick={() => toggleSort('aprAfterFees')} className="inline-flex items-center hover:text-gray-900">
                        APR (Fees){sortIndicator('aprAfterFees')}
                      </button>
                    </TableHead>
                    <TableHead className="px-2 py-1.5 text-xs whitespace-nowrap text-right">
                      <button type="button" onClick={() => toggleSort('period')} className="inline-flex items-center hover:text-gray-900">
                        Period{sortIndicator('period')}
                      </button>
                    </TableHead>
                    {userRole !== 'OWNER' && (
                      <TableHead className="px-2 py-1.5 text-xs whitespace-nowrap">
                        Start Date
                      </TableHead>
                    )}
                    <TableHead className="px-2 py-1.5 text-xs whitespace-nowrap">
                      <button type="button" onClick={() => toggleSort('maturityDate')} className="inline-flex items-center hover:text-gray-900">
                        Maturity{sortIndicator('maturityDate')}
                      </button>
                    </TableHead>
                    <TableHead className="px-2 py-1.5 text-xs whitespace-nowrap text-right">
                      <button type="button" onClick={() => toggleSort('days')} className="inline-flex items-center hover:text-gray-900">
                        Days{sortIndicator('days')}
                      </button>
                    </TableHead>
                    <TableHead className="px-2 py-1.5 text-xs whitespace-nowrap text-right">
                      <button type="button" onClick={() => toggleSort('fees')} className="inline-flex items-center hover:text-gray-900">
                        Fees{sortIndicator('fees')}
                      </button>
                    </TableHead>
                    {userRole !== 'OWNER' && (
                      <TableHead className="px-2 py-1.5 text-xs whitespace-nowrap text-right">
                        Commission Paid
                      </TableHead>
                    )}
                    <TableHead className="px-2 py-1.5 text-xs whitespace-nowrap text-right">
                      <button type="button" onClick={() => toggleSort('profit')} className="inline-flex items-center hover:text-gray-900">
                        Profit{sortIndicator('profit')}
                      </button>
                    </TableHead>
                    {userRole === 'OWNER' && ownerView === 'sold' && (
                      <TableHead className="px-2 py-1.5 text-xs whitespace-nowrap text-right">
                        Commission
                      </TableHead>
                    )}
                    <TableHead className="px-2 py-1.5 text-xs whitespace-nowrap text-right">
                      <button type="button" onClick={() => toggleSort('received')} className="inline-flex items-center hover:text-gray-900">
                        Received{sortIndicator('received')}
                      </button>
                    </TableHead>
                    <TableHead className="px-2 py-1.5 text-xs whitespace-nowrap text-right">
                      <button type="button" onClick={() => toggleSort('receivable')} className="inline-flex items-center hover:text-gray-900">
                        Receivable{sortIndicator('receivable')}
                      </button>
                    </TableHead>
                    <TableHead className="px-2 py-1.5 text-xs whitespace-nowrap">
                      <button type="button" onClick={() => toggleSort('status')} className="inline-flex items-center hover:text-gray-900">
                        Status{sortIndicator('status')}
                      </button>
                    </TableHead>
                    {canActOnDeals && (
                      <TableHead className="px-2 py-1.5 text-xs whitespace-nowrap">Actions</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                {Object.entries(groupedByPlatform).map(([platformName, group]) => {
                  const expanded = expandedPlatforms[platformName] ?? true
                  const hasRows = group.rows.length > 0
                  if (!hasRows) return null

                  const dealsLabel = group.totals.deals === 1 ? '1 deal' : `${group.totals.deals} deals`
                  const investedLabel = formatCurrency(group.totals.investment, group.totals.currency)
                  const profitLabel = formatCurrency(group.totals.profit, group.totals.currency)
                  const receivableLabel = formatCurrency(group.totals.receivable, group.totals.currency)

                  return (
                    <>
                      <TableRow
                        key={`platform-${platformName}`}
                        className="bg-gray-50 dark:bg-slate-800/50 hover:bg-cyan-500/10 dark:hover:bg-cyan-500/20 cursor-pointer transition-all duration-200"
                        onClick={() =>
                          setExpandedPlatforms((prev) => ({
                            ...prev,
                            [platformName]: !(prev[platformName] ?? true),
                          }))
                        }
                      >
                        <TableCell colSpan={20} className="px-2 py-2 align-middle">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-500">
                                {expanded ? '▼' : '▶'}
                              </span>
                              <span className="text-sm font-semibold text-gray-900">
                                {platformName}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-600">
                              <span>{dealsLabel}</span>
                              <span className="hidden sm:inline">•</span>
                              <span>Invested: {investedLabel}</span>
                              <span className="hidden sm:inline">•</span>
                              <span>Profit: {profitLabel}</span>
                              <span className="hidden sm:inline">•</span>
                              <span>Receivable: {receivableLabel}</span>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>

                      {expanded && group.rows.map(({ inv, metrics }) => {

                  const participantList = Array.isArray(inv.dealParticipants) ? inv.dealParticipants : []
                  const isSoldDealForOwner = isSoldDealForOwnerView(inv)
                  const partnerClosed = Boolean(inv?.partnerClosed)

                  const partnerNames = userRole === 'OWNER'
                    ? participantList
                        .filter((p: any) => !ownerPersonId || p.personId !== ownerPersonId)
                        .map((p: any) => p.person?.name)
                        .filter(Boolean)
                    : []
                  const soldToLabel = partnerNames.length > 0 ? `Sold to: ${partnerNames.join(', ')}` : ''

                  return (
                    <TableRow
                      key={inv.id}
                      className="hover:bg-cyan-500/10 dark:hover:bg-cyan-500/20 transition-all duration-200 border-l-4 border-l-transparent hover:border-l-cyan-500 cursor-pointer"
                    >
                      <TableCell className="px-2 py-1.5 font-semibold text-gray-900 dark:text-slate-100 align-middle">
                        <button
                          type="button"
                          onClick={() => setDetailTarget(inv)}
                          className="block w-full text-left hover:text-cyan-500 dark:hover:text-cyan-400 transition-colors truncate"
                          title={inv.name}
                        >
                          {inv.name}
                        </button>
                        {soldToLabel && (
                          <div className="mt-0.5 text-[10px] font-medium text-blue-700">
                            {soldToLabel}
                          </div>
                        )}
                        {userRole === 'OWNER' && isSoldDealForOwner && (
                          <div className="mt-1 inline-flex items-center gap-2">
                            {!partnerClosed ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                                <span className="h-1.5 w-1.5 rounded-full bg-amber-600" />
                                Pending Partner Closure
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 animate-pulse" />
                                Ready to Receive
                              </span>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="px-2 py-1.5 text-gray-700 dark:text-slate-300 tabular-nums text-right whitespace-nowrap align-middle">
                        {formatCurrency(metrics.totalInvestment, metrics.currency)}
                      </TableCell>
                      <TableCell className="px-2 py-1.5 text-gray-700 dark:text-slate-300 tabular-nums text-right whitespace-nowrap align-middle">
                        {formatPercent(metrics.apr)}
                      </TableCell>
                      <TableCell className="px-2 py-1.5 text-gray-700 dark:text-slate-300 tabular-nums text-right whitespace-nowrap align-middle">
                        {formatPercent(metrics.aprAfterFees)}
                      </TableCell>
                      <TableCell className="px-2 py-1.5 text-gray-700 dark:text-slate-300 tabular-nums text-right whitespace-nowrap align-middle">
                        {metrics.periodMonths === null ? '—' : metrics.periodMonths.toFixed(1)}
                      </TableCell>
                      {userRole !== 'OWNER' && (
                        <TableCell className="px-2 py-1.5 text-gray-700 tabular-nums whitespace-nowrap align-middle">
                          {formatDate(metrics.acquiredAt || inv.startDate)}
                        </TableCell>
                      )}
                      <TableCell className="px-2 py-1.5 text-gray-700 tabular-nums whitespace-nowrap align-middle">
                        {formatDate(inv.maturityDate)}
                      </TableCell>
                      <TableCell className="px-2 py-1.5 text-gray-700 dark:text-slate-300 tabular-nums text-right whitespace-nowrap align-middle">
                    {metrics.daysRemaining === null ? (
                      '—'
                    ) : metrics.paymentStatus === 'delayed' ? (
                      <span className="text-red-600 font-semibold">
                        Delayed {Math.abs(metrics.daysRemaining)}d
                      </span>
                    ) : metrics.paymentStatus === 'early' ? (
                      <span className="text-emerald-600 font-semibold">
                        Early {metrics.daysRemaining}d
                      </span>
                    ) : (
                      metrics.daysRemaining
                    )}
                      </TableCell>
                      <TableCell className="px-2 py-1.5 text-gray-700 dark:text-slate-300 tabular-nums text-right whitespace-nowrap align-middle">
                        {formatCurrency(metrics.fees, metrics.currency)}
                      </TableCell>
                      {userRole !== 'OWNER' && (
                        <TableCell className="px-2 py-1.5 text-gray-700 dark:text-slate-300 tabular-nums text-right whitespace-nowrap align-middle">
                          {formatCurrency(Number(metrics.commissionPaid || 0), metrics.currency)}
                        </TableCell>
                      )}
                      <TableCell className="px-2 py-1.5 text-gray-700 dark:text-slate-300 tabular-nums text-right whitespace-nowrap align-middle">
                        {formatCurrency(metrics.netProfit, metrics.currency)}
                      </TableCell>
                      {userRole === 'OWNER' && ownerView === 'sold' && (
                        <TableCell className="px-2 py-1.5 text-gray-700 dark:text-slate-300 tabular-nums text-right whitespace-nowrap align-middle">
                          {formatCurrency(Number(metrics.commissionEarned || 0), metrics.currency)}
                        </TableCell>
                      )}
                      <TableCell className="px-2 py-1.5 text-gray-700 dark:text-slate-300 tabular-nums text-right whitespace-nowrap align-middle">
                        {formatCurrency(metrics.totalReceived, metrics.currency)}
                      </TableCell>
                      <TableCell className="px-2 py-1.5 text-gray-700 dark:text-slate-300 tabular-nums text-right whitespace-nowrap align-middle">
                        {formatCurrency(metrics.receivable, metrics.currency)}
                      </TableCell>
                      <TableCell className="px-2 py-1.5 whitespace-nowrap align-middle">
                    <span className={`px-2 py-1 inline-flex items-center text-[10px] leading-4 font-semibold rounded-full shadow-sm ${metrics.progress.className}`}>
                      <span className="w-2 h-2 bg-current rounded-full mr-2 opacity-70"></span>
                      {metrics.paymentStatus === 'delayed' ? 'Delayed ' : metrics.paymentStatus === 'early' ? 'Early ' : ''}
                      {metrics.progress.percent.toFixed(2)}%
                    </span>
                      </TableCell>
                      {userRole === 'OWNER' && (
                        <TableCell className="px-2 py-1.5 align-middle">
                          <div className="flex flex-nowrap items-center gap-1.5 whitespace-nowrap">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleEdit(inv)}
                              title="Edit"
                              aria-label="Edit"
                              className="h-8 w-8 px-0 py-0 shrink-0"
                            >
                              <Icon><EditIcon /></Icon>
                            </Button>

                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openWithdrawModal(inv)}
                              disabled={actionLoading}
                              title="Withdraw"
                              aria-label="Withdraw"
                              className="h-8 w-8 px-0 py-0 shrink-0"
                            >
                              <Icon><WithdrawIcon /></Icon>
                            </Button>

                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleReopen(inv)}
                              disabled={actionLoading}
                              title="Reopen"
                              aria-label="Reopen"
                              className="h-8 w-8 px-0 py-0 shrink-0"
                            >
                              <Icon><ReopenIcon /></Icon>
                            </Button>

                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openSellModal(inv)}
                              disabled={actionLoading}
                              title="Sell"
                              aria-label="Sell"
                              className="h-8 w-8 px-0 py-0 shrink-0"
                            >
                              <Icon><SellIcon /></Icon>
                            </Button>

                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => handleDelete(inv.id)}
                              disabled={deletingId === inv.id}
                              title={deletingId === inv.id ? 'Deleting…' : 'Delete'}
                              aria-label={deletingId === inv.id ? 'Deleting…' : 'Delete'}
                              className="h-8 w-8 px-0 py-0 shrink-0"
                            >
                              {deletingId === inv.id ? '…' : <Icon><TrashIcon /></Icon>}
                            </Button>
                          </div>
                        </TableCell>
                      )}

                      {userRole === 'PARTNER' && (
                        <TableCell className="px-2 py-1.5 align-middle">
                          <div className="flex flex-nowrap items-center gap-1.5 whitespace-nowrap">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleReceiveAndClose(inv, metrics)}
                              disabled={actionLoading}
                              title="Receive & Close"
                              aria-label="Receive & Close"
                              className="h-8 w-8 px-0 py-0 shrink-0"
                            >
                              <Icon><WithdrawIcon /></Icon>
                            </Button>

                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleReopen(inv)}
                              disabled={actionLoading}
                              title="Redo"
                              aria-label="Redo"
                              className="h-8 w-8 px-0 py-0 shrink-0"
                            >
                              <Icon><ReopenIcon /></Icon>
                            </Button>

                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleReturnToOwner(inv)}
                              disabled={actionLoading}
                              title="Return Sukuk"
                              aria-label="Return Sukuk"
                              className="h-8 w-8 px-0 py-0 shrink-0"
                            >
                              <Icon><SellIcon /></Icon>
                            </Button>

                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => handleDelete(inv.id)}
                              disabled={deletingId === inv.id}
                              title={deletingId === inv.id ? 'Deleting…' : 'Delete'}
                              aria-label={deletingId === inv.id ? 'Deleting…' : 'Delete'}
                              className="h-8 w-8 px-0 py-0 shrink-0"
                            >
                              {deletingId === inv.id ? '…' : <Icon><TrashIcon /></Icon>}
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  )
                })}
                    </>
                  )
                })}
                </TableBody>
                {totals && (
                  <TableFooter>
                    <TableRow>
                      <TableCell className="px-2 py-2 font-semibold text-gray-900">Total</TableCell>
                      <TableCell className="px-2 py-2 text-right font-semibold text-gray-900 tabular-nums whitespace-nowrap">
                        {formatCurrency(totals.investment, totals.currency)}
                      </TableCell>
                      <TableCell className="px-2 py-2">{null}</TableCell>
                      <TableCell className="px-2 py-2">{null}</TableCell>
                      <TableCell className="px-2 py-2">{null}</TableCell>
                      <TableCell className="px-2 py-2">{null}</TableCell>
                      {userRole !== 'OWNER' && <TableCell className="px-2 py-2">{null}</TableCell>}
                      <TableCell className="px-2 py-2">{null}</TableCell>
                      <TableCell className="px-2 py-2 text-right font-semibold text-gray-900 tabular-nums whitespace-nowrap">
                        {formatCurrency(totals.fees, totals.currency)}
                      </TableCell>
                      {userRole !== 'OWNER' && (
                        <TableCell className="px-2 py-2 text-right font-semibold text-gray-900 tabular-nums whitespace-nowrap">
                          {formatCurrency(totals.commissionPaid, totals.currency)}
                        </TableCell>
                      )}
                      <TableCell className="px-2 py-2 text-right font-semibold text-gray-900 tabular-nums whitespace-nowrap">
                        {formatCurrency(totals.profit, totals.currency)}
                      </TableCell>
                      {userRole === 'OWNER' && ownerView === 'sold' && (
                        <TableCell className="px-2 py-2 text-right font-semibold text-gray-900 tabular-nums whitespace-nowrap">
                          {formatCurrency(totals.commission, totals.currency)}
                        </TableCell>
                      )}
                      <TableCell className="px-2 py-2 text-right font-semibold text-gray-900 tabular-nums whitespace-nowrap">
                        {formatCurrency(totals.received, totals.currency)}
                      </TableCell>
                      <TableCell className="px-2 py-2 text-right font-semibold text-gray-900 tabular-nums whitespace-nowrap">
                        {formatCurrency(totals.receivable, totals.currency)}
                      </TableCell>
                      <TableCell className="px-2 py-2">{null}</TableCell>
                      {canActOnDeals && <TableCell className="px-2 py-2">{null}</TableCell>}
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
            </div>
          )}
        </>
      )}

      {/* Create Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Create New Sukuk"
      >
        <SukukForm
          mode="create"
          onSuccess={handleCreateSuccess}
          onCancel={() => setIsCreateModalOpen(false)}
        />
      </Modal>

      {/* Edit Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false)
          setEditingSukuk(null)
        }}
        title="Edit Sukuk"
      >
        {editingSukuk && (
          <SukukForm
            mode="edit"
            initialData={editingSukuk}
            onSuccess={handleEditSuccess}
            onCancel={() => {
              setIsEditModalOpen(false)
              setEditingSukuk(null)
            }}
          />
        )}
      </Modal>

      <Modal
        isOpen={Boolean(detailTarget)}
        onClose={() => setDetailTarget(null)}
        title="Sukuk Details"
      >
        {detailTarget && (() => {
          const metrics = isSoldDealForOwnerView(detailTarget)
            ? getSoldDealMetrics(detailTarget)
            : getMetrics(detailTarget)
          return (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-slate-500 dark:text-slate-400">Company</p>
                  <p className="font-semibold text-slate-900 dark:text-slate-100">{detailTarget.name}</p>
                </div>
                {/* ... */}
                <div>
                  <p className="text-slate-500 dark:text-slate-400">Platform</p>
                  <p className="font-semibold text-slate-900 dark:text-slate-100">{detailTarget.account?.name || '—'}</p>
                </div>
                <div>
                  <p className="text-slate-500 dark:text-slate-400">Type</p>
                  <p className="font-semibold text-slate-900 dark:text-slate-100">{detailTarget.category || '—'}</p>
                </div>
                <div>
                  <p className="text-slate-500 dark:text-slate-400">Total Investment</p>
                  <p className="font-semibold text-slate-900 dark:text-slate-100">
                    {formatCurrency(metrics.totalInvestment, metrics.currency)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500 dark:text-slate-400">APR</p>
                  <p className="font-semibold text-slate-900 dark:text-slate-100">{formatPercent(metrics.apr)}</p>
                </div>
                <div>
                  <p className="text-slate-500 dark:text-slate-400">APR After Fees</p>
                  <p className="font-semibold text-slate-900 dark:text-slate-100">{formatPercent(metrics.aprAfterFees)}</p>
                </div>
                <div>
                  <p className="text-slate-500 dark:text-slate-400">Start Date</p>
                  <p className="font-semibold text-slate-900 dark:text-slate-100">{formatDate(detailTarget.startDate)}</p>
                </div>
                <div>
                  <p className="text-slate-500 dark:text-slate-400">Maturity Date</p>
                  <p className="font-semibold text-slate-900 dark:text-slate-100">{formatDate(detailTarget.maturityDate)}</p>
                </div>
                <div>
                  <p className="text-slate-500 dark:text-slate-400">Investment Period (months)</p>
                  <p className="font-semibold text-slate-900 dark:text-slate-100">
                    {metrics.periodMonths === null ? '—' : metrics.periodMonths.toFixed(1)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500 dark:text-slate-400">Maturity Days Remaining</p>
                  <p className="font-semibold text-slate-900 dark:text-slate-100">
                    {metrics.daysRemaining === null
                      ? '—'
                      : metrics.paymentStatus === 'delayed'
                        ? `Delayed ${Math.abs(metrics.daysRemaining)}d`
                        : metrics.paymentStatus === 'early'
                          ? `Early ${metrics.daysRemaining}d`
                          : metrics.daysRemaining}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500 dark:text-slate-400">Fees</p>
                  <p className="font-semibold text-slate-900 dark:text-slate-100">
                    {formatCurrency(metrics.fees, metrics.currency)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500 dark:text-slate-400">Net Profit</p>
                  <p className="font-semibold text-slate-900 dark:text-slate-100">
                    {formatCurrency(metrics.netProfit, metrics.currency)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500 dark:text-slate-400">Total Received</p>
                  <p className="font-semibold text-slate-900 dark:text-slate-100">
                    {formatCurrency(metrics.totalReceived, metrics.currency)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500 dark:text-slate-400">Receivable</p>
                  <p className="font-semibold text-slate-900 dark:text-slate-100">
                    {formatCurrency(metrics.receivable, metrics.currency)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500 dark:text-slate-400">Status %</p>
                  <p className="font-semibold text-slate-900 dark:text-slate-100">
                    {(metrics.paymentStatus === 'delayed' ? 'Delayed ' : metrics.paymentStatus === 'early' ? 'Early ' : '')}
                    {metrics.progress.percent.toFixed(2)}%
                  </p>
                </div>
                <div>
                  <p className="text-slate-500 dark:text-slate-400">Payment Timing</p>
                  <p className="font-semibold capitalize text-slate-900 dark:text-slate-100">
                    {metrics.paymentStatus.replace('-', ' ')}
                  </p>
                </div>
              </div>
            </div>
          )
        })()}
      </Modal>

      <Modal
        isOpen={Boolean(withdrawTarget)}
        onClose={() => setWithdrawTarget(null)}
        title="Close Position"
      >
        <form onSubmit={handleWithdraw} className="space-y-4">
          {actionError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {actionError}
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
              Receipt Type
            </label>
            {withdrawTarget && (() => {
              const isSoldDealForOwner = isSoldDealForOwnerView(withdrawTarget.inv)

              if (userRole === 'OWNER' && isSoldDealForOwner) {
                return (
                  <div>
                    <div
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700 dark:border-white/10 dark:bg-slate-950/60 dark:text-slate-200"
                      title="Principal belongs to partner — cannot be received"
                    >
                      Profit
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                      Principal belongs to partner — cannot be received.
                    </div>
                  </div>
                )
              }

              return (
                <select
                  value={withdrawForm.type}
                  onChange={(e) =>
                    setWithdrawForm((prev) => ({
                      ...prev,
                      type: e.target.value as 'PRINCIPAL' | 'PROFIT' | 'BOTH',
                    }))
                  }
                  className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100"
                >
                  <option value="PRINCIPAL">Principal</option>
                  <option value="PROFIT">Profit</option>
                  <option value="BOTH">Principal + Profit</option>
                </select>
              )
            })()}
          </div>

          {withdrawTarget && (() => {
            const isSoldDealForOwner = isSoldDealForOwnerView(withdrawTarget.inv)
            const partnerClosed = Boolean(withdrawTarget.inv?.partnerClosed)
            if (userRole === 'OWNER' && isSoldDealForOwner && !partnerClosed) {
              return (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
                  <div className="font-semibold">Pending Partner Closure</div>
                  <div className="mt-0.5">Waiting for partner to close their position.</div>
                </div>
              )
            }
            return null
          })()}

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
              Date Received
            </label>
            <DateInput
              value={withdrawForm.date}
              onChange={(value) => setWithdrawForm((prev) => ({ ...prev, date: value }))}
              ariaLabel="Date received"
            />
          </div>

          {(withdrawForm.type === 'PRINCIPAL' || withdrawForm.type === 'BOTH') && (
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
                Principal Amount
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={withdrawForm.principalAmount}
                onChange={(e) =>
                  setWithdrawForm((prev) => ({ ...prev, principalAmount: e.target.value }))
                }
                className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100 dark:placeholder:text-slate-500"
              />
            </div>
          )}

          {(withdrawForm.type === 'PROFIT' || withdrawForm.type === 'BOTH') && (
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
                Profit Amount
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={withdrawForm.profitAmount}
                onChange={(e) =>
                  setWithdrawForm((prev) => ({ ...prev, profitAmount: e.target.value }))
                }
                className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100 dark:placeholder:text-slate-500"
              />
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
              Notes
            </label>
            <textarea
              rows={2}
              value={withdrawForm.notes}
              onChange={(e) => setWithdrawForm((prev) => ({ ...prev, notes: e.target.value }))}
              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
          </div>

          {withdrawTarget && (() => {
            const currencyLabel = withdrawTarget.inv?.account?.currency || 'SAR'
            const dateLabel = withdrawForm.date || formatDateInput(new Date())
            const hasPrincipal = withdrawForm.type === 'PRINCIPAL' || withdrawForm.type === 'BOTH'
            const hasProfit = withdrawForm.type === 'PROFIT' || withdrawForm.type === 'BOTH'
            const principalAmount = Number(withdrawForm.principalAmount || 0) || 0
            const profitAmount = Number(withdrawForm.profitAmount || 0) || 0

            const isSoldDealForOwner = isSoldDealForOwnerView(withdrawTarget.inv)
            const partnerClosed = Boolean(withdrawTarget.inv?.partnerClosed)
            const commissionAmount = isSoldDealForOwner
              ? Math.max(0, Number(withdrawTarget.metrics?.commissionEarned || 0))
              : 0

            if (!hasPrincipal && !hasProfit) return null

            return (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200">
                <p className="mb-1 font-semibold">You will receive:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  {hasPrincipal && (
                    <li>
                      Principal: {currencyLabel} {principalAmount.toFixed(2)} on {dateLabel}
                    </li>
                  )}
                  {hasProfit && (
                    <li>
                      Profit: {currencyLabel} {profitAmount.toFixed(2)} on {dateLabel}
                    </li>
                  )}
                  {userRole === 'OWNER' && isSoldDealForOwner && partnerClosed && commissionAmount > 0 && (
                    <li>
                      Commission: {currencyLabel} {commissionAmount.toFixed(2)}
                    </li>
                  )}
                </ul>
              </div>
            )
          })()}

          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setWithdrawTarget(null)} disabled={actionLoading}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={actionLoading || Boolean(withdrawTarget && (() => {
                const isSoldDealForOwner = isSoldDealForOwnerView(withdrawTarget.inv)
                const partnerClosed = Boolean(withdrawTarget.inv?.partnerClosed)
                return userRole === 'OWNER' && isSoldDealForOwner && !partnerClosed
              })())}
            >
              {actionLoading ? 'Processing...' : 'Confirm'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={Boolean(sellTarget)}
        onClose={() => setSellTarget(null)}
        title="Sell Sukuk to Partner"
      >
        <form onSubmit={handleSell} className="space-y-4">
          {actionError && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 border border-red-200">
              {actionError}
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">Partner</label>
            <select
              value={sellForm.buyerPersonId}
              onChange={(e) => setSellForm((prev) => ({ ...prev, buyerPersonId: e.target.value }))}
              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100"
              required
            >
              <option value="">Select partner</option>
              {partners.map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">Amount (Principal)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={sellForm.amount}
                onChange={(e) => setSellForm((prev) => ({ ...prev, amount: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100 dark:placeholder:text-slate-500"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
                {sellForm.paymentMode === 'SETTLE_DEBT' ? 'Settlement Amount (Debt)' : 'Sale Price (Cash)'}
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={sellForm.paymentMode === 'SETTLE_DEBT' ? sellForm.amount : sellForm.salePrice}
                onChange={(e) => setSellForm((prev) => ({ ...prev, salePrice: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100 dark:placeholder:text-slate-500"
                placeholder={sellForm.paymentMode === 'SETTLE_DEBT' ? 'Locked to amount' : 'Defaults to amount'}
                disabled={sellForm.paymentMode === 'SETTLE_DEBT'}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">Payment Mode</label>
              <select
                value={sellForm.paymentMode}
                onChange={(e) => setSellForm((prev) => ({ ...prev, paymentMode: e.target.value, debtId: '' }))}
                className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100"
              >
                <option value="CASH">Cash</option>
                <option value="SETTLE_DEBT">Settle Debt (no cash)</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">Debt</label>
              <select
                value={sellForm.debtId}
                onChange={(e) => setSellForm((prev) => ({ ...prev, debtId: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100"
                disabled={sellForm.paymentMode !== 'SETTLE_DEBT'}
                required={sellForm.paymentMode === 'SETTLE_DEBT'}
              >
                <option value="">Select debt</option>
                {(() => {
                  const partner = partners.find((p: any) => p.id === sellForm.buyerPersonId)
                  const partnerName = (partner?.name || '').toString().trim().toLowerCase()
                  const list = partnerName
                    ? debts.filter((d: any) => (d.lenderName || '').toString().trim().toLowerCase() === partnerName)
                    : debts

                  return list.map((d: any) => {
                    const paid = Array.isArray(d.payments)
                      ? d.payments.reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0)
                      : 0
                    const outstanding = Math.max(0, (Number(d.amount) || 0) - paid)
                    const label = `${d.lenderName} • Outstanding ${outstanding.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    return (
                      <option key={d.id} value={d.id}>
                        {label}
                      </option>
                    )
                  })
                })()}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">Commission Type</label>
              <select
                value={sellForm.commissionType}
                onChange={(e) => setSellForm((prev) => ({ ...prev, commissionType: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100"
              >
                <option value="FIXED">Fixed</option>
                <option value="PERCENT">Percentage (of partner gross profit)</option>
                <option value="AUTO">AUTO (cap partner at 10% APR)</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">Commission Value</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={sellForm.commissionValue}
                onChange={(e) => setSellForm((prev) => ({ ...prev, commissionValue: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100 dark:placeholder:text-slate-500"
                placeholder={sellForm.commissionType === 'PERCENT' ? 'e.g. 5' : sellForm.commissionType === 'AUTO' ? 'Leave 0 for auto' : 'e.g. 50'}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">Date</label>
            <DateInput
              value={sellForm.date}
              onChange={(value) => setSellForm((prev) => ({ ...prev, date: value }))}
              ariaLabel="Sell date"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">Notes</label>
            <textarea
              rows={2}
              value={sellForm.notes}
              onChange={(e) => setSellForm((prev) => ({ ...prev, notes: e.target.value }))}
              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
          </div>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setSellTarget(null)} disabled={actionLoading}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={actionLoading}>
              {actionLoading ? 'Processing...' : 'Sell'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Return to Owner Confirmation Modal */}
      <Modal
        isOpen={returnModalOpen}
        onClose={() => setReturnModalOpen(false)}
        title="Return Deal to Owner"
      >
        <div className="space-y-4">
          <div className="text-sm text-gray-700">
            <p className="mb-3">
              Are you sure you want to return <strong>{returnInvestment?.name}</strong> to the owner?
            </p>
            <ul className="space-y-1 text-xs">
              <li>• Your principal: <strong>SAR {formatCurrency(Number(returnInvestment?.myParticipation?.investedAmount || 0))}</strong></li>
              <li>• Sale price: <strong>SAR 0</strong> (returning at cost)</li>
              <li>• This action cannot be undone</li>
            </ul>
          </div>
          
          <div className="flex justify-end space-x-3 pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setReturnModalOpen(false)}
              disabled={actionLoading}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={confirmReturnToOwner}
              disabled={actionLoading}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {actionLoading ? 'Processing...' : 'Confirm Return'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
