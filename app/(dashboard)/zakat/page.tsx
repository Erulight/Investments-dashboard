import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { RuleBasedZakatDashboard } from '@/components/zakat/RuleBasedZakatDashboard'
import { 
  calculateZakat, 
  createInvestmentRecord, 
  adjustForRollingInvestments,
  InvestmentRecord,
  ZakatCalculationResult,
  SukukType
} from '@/lib/zakat'

export const dynamic = 'force-dynamic'

const NISAB_KEY = 'NISAB_VALUE'
const DEFAULT_NISAB = 55000

interface ZakatInvestmentRow {
  investment_id: string
  investment_name: string
  sukuk_type: SukukType
  principal_amount: number
  hawl_start_date: Date
  hawl_completed: boolean
  days_held: number
  zakat_amount: number
  reason: string
  distributions_count: number
  total_distributions: number
  status: 'EXEMPT' | 'PENDING' | 'DUE' | 'PAID'
  last_payment?: {
    id: string
    date: string
    amount: number
  }
}

// Helper function to get user's annual Zakat date
const getUserZakatAnnualDate = async (userId: string): Promise<Date> => {
  const setting = await prisma.systemSetting.findUnique({
    where: { key: `USER_ZAKAT_DATE:${userId}` }
  })
  
  if (setting?.value) {
    return new Date(setting.value)
  }
  
  // Default to current date if not set
  const now = new Date()
  const defaultDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  
  // Save the default date
  await prisma.systemSetting.upsert({
    where: { key: `USER_ZAKAT_DATE:${userId}` },
    update: { value: defaultDate.toISOString() },
    create: {
      key: `USER_ZAKAT_DATE:${userId}`,
      value: defaultDate.toISOString(),
      description: 'User annual Zakat calculation date'
    }
  })
  
  return defaultDate
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

  // Get Nisab value
  const nisabSetting = await prisma.systemSetting.findUnique({ where: { key: NISAB_KEY } })
  const nisabRaw = nisabSetting ? Number(nisabSetting.value) : DEFAULT_NISAB
  const nisabValue = Number.isFinite(nisabRaw) && nisabRaw > 0 ? nisabRaw : DEFAULT_NISAB

  // Get user's annual Zakat date
  const userZakatAnnualDate = await getUserZakatAnnualDate(user.id)
  const currentDate = new Date()

  // Fetch Sukuk investments for rule-based Zakat calculation
  const investments = await prisma.investment.findMany({
    where: {
      account: { type: 'SUKUK' },
      ...(user.role === 'PARTNER' && user.personId ? {
        dealParticipants: {
          some: { personId: user.personId }
        }
      } : {})
    },
    include: {
      transactions: {
        where: {
          type: { in: ['WITHDRAW_PROFIT', 'WITHDRAW_PRINCIPAL', 'ROLLBACK_PRINCIPAL', 'SELL_RECEIPT'] },
          ...(user.role === 'PARTNER' && user.personId ? { personId: user.personId } : {})
        },
        orderBy: { date: 'asc' }
      },
      dealParticipants: user.role === 'PARTNER' && user.personId ? {
        where: { personId: user.personId }
      } : true,
      // TODO: Uncomment after running prisma generate and migrate
      // zakatPayments: {
      //   orderBy: { date: 'desc' },
      //   take: 1
      // }
    }
  })

  // Convert database investments to InvestmentRecord format for rule-based calculation
  const investmentRecords: InvestmentRecord[] = investments.map((inv: any) => {
    // Get distributions (cash receipts) from transactions
    const distributions = (inv.transactions || [])
      .filter((tx: any) => ['WITHDRAW_PROFIT', 'WITHDRAW_PRINCIPAL', 'ROLLBACK_PRINCIPAL', 'SELL_RECEIPT'].includes(tx.type))
      .map((tx: any) => ({
        receipt_date: new Date(tx.date),
        amount: Math.abs(tx.amount),
        is_spent_before_zakat_date: false // We'll assume not spent for now
      }))

    // Get principal amount based on user role
    let principalAmount = 0
    let fundsOwnershipDate = new Date(inv.startDate)
    
    if (user.role === 'PARTNER' && user.personId) {
      const participation = (inv.dealParticipants || []).find((dp: any) => dp.personId === user.personId)
      if (participation) {
        principalAmount = participation.investedAmount
        fundsOwnershipDate = participation.acquiredAt ? new Date(participation.acquiredAt) : new Date(inv.startDate)
      }
    } else {
      principalAmount = inv.principalAmount || 0
    }

    return createInvestmentRecord({
      id: inv.id,
      name: inv.name,
      isIjarah: inv.isIjarah,
      startDate: inv.startDate,
      maturityDate: inv.maturityDate,
      principalAmount,
      fundsOwnershipDate,
      distributions,
      isDefaulted: false, // We'll assume not defaulted for now
      redemptionAmount: 0
    }, userZakatAnnualDate)
  })

  // Apply Rule 14: Rolling Short-Term Investments adjustment
  const adjustedRecords = adjustForRollingInvestments(investmentRecords)

  // Calculate Zakat using the comprehensive rule engine
  const calculationResult = calculateZakat(adjustedRecords, currentDate)

  // Calculate total zakatable wealth for Nisab check
  const totalZakatableWealth = adjustedRecords.reduce((sum, record) => {
    return sum + record.principal_amount
  }, 0)

  // Check if Nisab threshold is met
  const thresholdMet = totalZakatableWealth >= nisabValue
  const zakatEnabled = thresholdMet

  // Convert calculation results to dashboard format
  const investmentRows: ZakatInvestmentRow[] = calculationResult.breakdown.map(breakdown => {
    const investment = investments.find((inv: any) => inv.id === breakdown.investment_id)!
    // TODO: Uncomment after running prisma generate and migrate
    // const lastPayment = investment.zakatPayments?.[0]
    const lastPayment = null // Temporary until schema is migrated
    
    // Determine status based on Zakat amount and payment history
    let status: 'EXEMPT' | 'PENDING' | 'DUE' | 'PAID' = 'EXEMPT'
    if (breakdown.zakat_amount > 0) {
      status = lastPayment ? 'PAID' : 'DUE'
    } else if (breakdown.hawl_completed) {
      status = 'PENDING'
    }

    return {
      investment_id: breakdown.investment_id,
      investment_name: breakdown.investment_name,
      sukuk_type: breakdown.sukuk_type,
      principal_amount: adjustedRecords.find(r => r.investment_id === breakdown.investment_id)?.principal_amount || 0,
      hawl_start_date: breakdown.hawl_start_date,
      hawl_completed: breakdown.hawl_completed,
      days_held: breakdown.days_held,
      zakat_amount: breakdown.zakat_amount,
      reason: breakdown.reason,
      distributions_count: breakdown.distributions_subject_to_zakat.length,
      total_distributions: breakdown.distributions_subject_to_zakat.reduce((sum, dist) => sum + dist.amount, 0),
      status,
      last_payment: lastPayment ? {
        id: (lastPayment as any).id,
        date: (lastPayment as any).date.toISOString().split('T')[0],
        amount: (lastPayment as any).amount
      } : undefined
    }
  })

  return (
    <RuleBasedZakatDashboard
      investments={investmentRows}
      calculationResult={calculationResult}
      nisabValue={nisabValue}
      totalZakatableWealth={totalZakatableWealth}
      userZakatAnnualDate={userZakatAnnualDate}
      zakatEnabled={zakatEnabled}
    />
  )
}
