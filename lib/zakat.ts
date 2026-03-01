// Zakat Calculation Engine based on 16 comprehensive rules
// This implements Islamic Zakat calculations for Sukuk investments

export type SukukType = 'IJARAH' | 'MURABAHA'

export interface Distribution {
  receipt_date: Date
  amount: number
  is_spent_before_zakat_date?: boolean
}

export interface InvestmentRecord {
  // Rule 15: Required fields per investment record
  sukuk_type: SukukType
  funds_ownership_date: Date
  investment_date: Date
  user_zakat_annual_date: Date
  distributions: Distribution[]
  redemption_date?: Date
  redemption_amount?: number
  is_defaulted: boolean
  
  // Additional fields for calculations
  principal_amount: number
  investment_id: string
  name: string
}

export interface ZakatCalculationResult {
  total_zakat_due: number
  breakdown: {
    investment_id: string
    investment_name: string
    sukuk_type: SukukType
    zakat_amount: number
    reason: string
    distributions_subject_to_zakat: Distribution[]
    hawl_start_date: Date
    hawl_completed: boolean
    days_held: number
  }[]
  rules_applied: string[]
}

// Rule 5: Hijri calendar utilities (354 days = 1 lunar year)
const HIJRI_YEAR_DAYS = 354

export function addHijriDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

export function diffHijriDays(startDate: Date, endDate: Date): number {
  const diffMs = endDate.getTime() - startDate.getTime()
  return Math.floor(diffMs / (1000 * 60 * 60 * 24))
}

export function hasCompletedHijriYear(startDate: Date, currentDate: Date): boolean {
  return diffHijriDays(startDate, currentDate) >= HIJRI_YEAR_DAYS
}

// Rule 4: Hawl Start Date calculation
export function calculateHawlStartDate(record: InvestmentRecord): Date {
  // Hawl starts from the EARLIER of: (a) date funds were first owned, OR (b) date funds were invested
  return record.funds_ownership_date <= record.investment_date 
    ? record.funds_ownership_date 
    : record.investment_date
}

// Rule 1: Sukuk Type Gate
export function applySukukTypeGate(record: InvestmentRecord): { passes: boolean; reason: string } {
  if (record.sukuk_type === 'IJARAH') {
    return { passes: false, reason: 'Rule 1: Ijarah sukuk - Zakat = 0' }
  }
  if (record.sukuk_type === 'MURABAHA') {
    return { passes: true, reason: 'Rule 1: Murabaha sukuk - proceed with calculation' }
  }
  return { passes: false, reason: 'Rule 1: Unknown sukuk type' }
}

// Rule 2: Duration Gate
export function applyDurationGate(record: InvestmentRecord, currentDate: Date): { passes: boolean; reason: string } {
  const hawlStartDate = calculateHawlStartDate(record)
  const daysHeld = diffHijriDays(hawlStartDate, currentDate)
  
  if (daysHeld < HIJRI_YEAR_DAYS) {
    return { 
      passes: false, 
      reason: `Rule 2: Investment period ${daysHeld} days < 354 days (1 lunar year) - Zakat = 0` 
    }
  }
  
  return { 
    passes: true, 
    reason: `Rule 2: Investment period ${daysHeld} days >= 354 days - proceed with calculation` 
  }
}

// Rule 11: Early Settlement
export function applyEarlySettlementRule(record: InvestmentRecord): { passes: boolean; reason: string } {
  if (record.redemption_date) {
    const hawlStartDate = calculateHawlStartDate(record)
    const daysHeldUntilRedemption = diffHijriDays(hawlStartDate, record.redemption_date)
    
    if (daysHeldUntilRedemption < HIJRI_YEAR_DAYS) {
      return { 
        passes: false, 
        reason: `Rule 11: Early settlement before 1 full year (${daysHeldUntilRedemption} days) - Zakat = 0` 
      }
    }
  }
  
  return { passes: true, reason: 'Rule 11: No early settlement issue' }
}

// Rule 13: Default/Liquidation
export function applyDefaultRule(record: InvestmentRecord): { passes: boolean; reason: string } {
  if (record.is_defaulted) {
    return { 
      passes: false, 
      reason: 'Rule 13: Company defaulted and paid late after multi-year delay - Zakat = 0' 
    }
  }
  
  return { passes: true, reason: 'Rule 13: No default issue' }
}

// Rules 7-10: Distribution Rules
export function categorizeDistributions(
  record: InvestmentRecord, 
  currentDate: Date
): {
  preZakatDate: Distribution[]
  postZakatDate: Distribution[]
  spentDistributions: Distribution[]
  futureDistributions: Distribution[]
} {
  const preZakatDate: Distribution[] = []
  const postZakatDate: Distribution[] = []
  const spentDistributions: Distribution[] = []
  const futureDistributions: Distribution[] = []
  
  record.distributions.forEach(dist => {
    // Rule 10: Future Unpaid Distributions - skip if receipt_date is in future
    if (dist.receipt_date > currentDate) {
      futureDistributions.push(dist)
      return
    }
    
    // Rule 9: Spent Distributions
    if (dist.is_spent_before_zakat_date) {
      spentDistributions.push(dist)
      return
    }
    
    // Rule 7 & 8: Pre/Post Zakat Date Distributions
    if (dist.receipt_date < record.user_zakat_annual_date) {
      preZakatDate.push(dist)
    } else {
      postZakatDate.push(dist)
    }
  })
  
  return { preZakatDate, postZakatDate, spentDistributions, futureDistributions }
}

// Rule 6: Zakat Trigger - only on actual cash receipt
export function getDistributionsSubjectToZakat(
  record: InvestmentRecord,
  currentDate: Date
): { distributions: Distribution[]; reason: string } {
  const hawlStartDate = calculateHawlStartDate(record)
  const categorized = categorizeDistributions(record, currentDate)
  
  const subjectToZakat: Distribution[] = []
  let reason = ''
  
  // Rule 8: Post-Zakat-Date Distributions - apply Zakat immediately if hawl has passed
  categorized.postZakatDate.forEach(dist => {
    if (hasCompletedHijriYear(hawlStartDate, dist.receipt_date)) {
      subjectToZakat.push(dist)
    }
  })
  
  // Rule 7: Pre-Zakat-Date Distributions - add to total wealth pool, apply Zakat only if still held on Zakat date
  // For simplicity, we assume they're still held unless marked as spent
  categorized.preZakatDate.forEach(dist => {
    if (hasCompletedHijriYear(hawlStartDate, record.user_zakat_annual_date)) {
      subjectToZakat.push(dist)
    }
  })
  
  if (subjectToZakat.length === 0) {
    if (categorized.spentDistributions.length > 0) {
      reason = 'Rule 9: All distributions were spent before Zakat date'
    } else if (categorized.futureDistributions.length > 0) {
      reason = 'Rule 10: No distributions received yet (future unpaid)'
    } else {
      reason = 'Rule 6: No cash receipts trigger Zakat yet'
    }
  } else {
    reason = `Rule 6: Zakat triggered on ${subjectToZakat.length} cash receipts`
  }
  
  return { distributions: subjectToZakat, reason }
}

// Rule 3: Zakat Rate (Always 2.5% on distributed cash amount)
export function calculateZakatAmount(distributionAmount: number): number {
  return distributionAmount * 0.025 // 2.5%
}

// Main Zakat calculation function
export function calculateZakat(
  records: InvestmentRecord[],
  currentDate: Date = new Date()
): ZakatCalculationResult {
  const breakdown: ZakatCalculationResult['breakdown'] = []
  const rulesApplied: string[] = []
  let totalZakatDue = 0
  
  records.forEach(record => {
    const hawlStartDate = calculateHawlStartDate(record)
    const daysHeld = diffHijriDays(hawlStartDate, currentDate)
    const hawlCompleted = hasCompletedHijriYear(hawlStartDate, currentDate)
    
    // Apply gates in order
    const sukukGate = applySukukTypeGate(record)
    if (!sukukGate.passes) {
      breakdown.push({
        investment_id: record.investment_id,
        investment_name: record.name,
        sukuk_type: record.sukuk_type,
        zakat_amount: 0,
        reason: sukukGate.reason,
        distributions_subject_to_zakat: [],
        hawl_start_date: hawlStartDate,
        hawl_completed: hawlCompleted,
        days_held: daysHeld
      })
      rulesApplied.push(sukukGate.reason)
      return
    }
    
    const durationGate = applyDurationGate(record, currentDate)
    if (!durationGate.passes) {
      breakdown.push({
        investment_id: record.investment_id,
        investment_name: record.name,
        sukuk_type: record.sukuk_type,
        zakat_amount: 0,
        reason: durationGate.reason,
        distributions_subject_to_zakat: [],
        hawl_start_date: hawlStartDate,
        hawl_completed: hawlCompleted,
        days_held: daysHeld
      })
      rulesApplied.push(durationGate.reason)
      return
    }
    
    const earlySettlement = applyEarlySettlementRule(record)
    if (!earlySettlement.passes) {
      breakdown.push({
        investment_id: record.investment_id,
        investment_name: record.name,
        sukuk_type: record.sukuk_type,
        zakat_amount: 0,
        reason: earlySettlement.reason,
        distributions_subject_to_zakat: [],
        hawl_start_date: hawlStartDate,
        hawl_completed: hawlCompleted,
        days_held: daysHeld
      })
      rulesApplied.push(earlySettlement.reason)
      return
    }
    
    const defaultRule = applyDefaultRule(record)
    if (!defaultRule.passes) {
      breakdown.push({
        investment_id: record.investment_id,
        investment_name: record.name,
        sukuk_type: record.sukuk_type,
        zakat_amount: 0,
        reason: defaultRule.reason,
        distributions_subject_to_zakat: [],
        hawl_start_date: hawlStartDate,
        hawl_completed: hawlCompleted,
        days_held: daysHeld
      })
      rulesApplied.push(defaultRule.reason)
      return
    }
    
    // Get distributions subject to Zakat
    const { distributions, reason } = getDistributionsSubjectToZakat(record, currentDate)
    
    // Calculate Zakat on distributions (Rule 3 & Rule 16: gross amounts)
    const totalDistributionAmount = distributions.reduce((sum, dist) => sum + dist.amount, 0)
    const zakatAmount = calculateZakatAmount(totalDistributionAmount)
    
    breakdown.push({
      investment_id: record.investment_id,
      investment_name: record.name,
      sukuk_type: record.sukuk_type,
      zakat_amount: zakatAmount,
      reason: zakatAmount > 0 
        ? `Rule 3: 2.5% on SAR ${totalDistributionAmount.toLocaleString()} distributed cash`
        : reason,
      distributions_subject_to_zakat: distributions,
      hawl_start_date: hawlStartDate,
      hawl_completed: hawlCompleted,
      days_held: daysHeld
    })
    
    totalZakatDue += zakatAmount
    rulesApplied.push(sukukGate.reason, durationGate.reason, reason)
  })
  
  return {
    total_zakat_due: totalZakatDue,
    breakdown,
    rules_applied: [...new Set(rulesApplied)] // Remove duplicates
  }
}

// Rule 14: Rolling Short-Term Investments
export function adjustForRollingInvestments(records: InvestmentRecord[]): InvestmentRecord[] {
  // Group by investment series (same name pattern)
  const groups = new Map<string, InvestmentRecord[]>()
  
  records.forEach(record => {
    // Simple grouping by base name (remove dates/numbers)
    const baseName = record.name.replace(/\d{4}-\d{2}|\d{1,2}-month|short-term/gi, '').trim()
    if (!groups.has(baseName)) {
      groups.set(baseName, [])
    }
    groups.get(baseName)!.push(record)
  })
  
  const adjustedRecords: InvestmentRecord[] = []
  
  groups.forEach((groupRecords, baseName) => {
    if (groupRecords.length <= 1) {
      // Single investment, no rolling
      adjustedRecords.push(...groupRecords)
      return
    }
    
    // Sort by investment date
    groupRecords.sort((a, b) => a.investment_date.getTime() - b.investment_date.getTime())
    
    // Rule 14: For rolling short-term, hawl starts from ORIGINAL funds ownership date
    const originalFundsDate = groupRecords[0].funds_ownership_date
    
    adjustedRecords.push(...groupRecords.map(record => ({
      ...record,
      funds_ownership_date: originalFundsDate // Use original date for hawl calculation
    })))
  })
  
  return adjustedRecords
}

// Utility function to create investment record from database data
export function createInvestmentRecord(
  investmentData: any,
  userZakatAnnualDate: Date
): InvestmentRecord {
  return {
    sukuk_type: investmentData.isIjarah ? 'IJARAH' : 'MURABAHA',
    funds_ownership_date: new Date(investmentData.fundsOwnershipDate || investmentData.startDate),
    investment_date: new Date(investmentData.startDate),
    user_zakat_annual_date: userZakatAnnualDate,
    distributions: (investmentData.distributions || []).map((dist: any) => ({
      receipt_date: new Date(dist.date),
      amount: Math.abs(dist.amount),
      is_spent_before_zakat_date: dist.isSpent || false
    })),
    redemption_date: investmentData.maturityDate ? new Date(investmentData.maturityDate) : undefined,
    redemption_amount: investmentData.redemptionAmount || 0,
    is_defaulted: investmentData.isDefaulted || false,
    principal_amount: investmentData.principalAmount || 0,
    investment_id: investmentData.id,
    name: investmentData.name || 'Unknown Investment'
  }
}
