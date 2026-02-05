export const ZAKAT_RATE = 0.025
export const HIJRI_YEAR_DAYS = 354

export type ZakatMode = 'PDF' | 'STANDARD'
export type NisabRef = 'Gold' | 'Silver'

export interface ZakatSettings {
  mode: ZakatMode
  zakatDate: string
  nisabRef: NisabRef
  nisabValue: number
  includeLiabilities: boolean
  liabilities: number
  treatSukukProfitAsCash: boolean
  cashBalance: number
}

export interface ZakatPayout {
  id: string
  date: string | Date
  amount: number
  type: string
  description?: string | null
}

export interface ZakatSukukDeal {
  id: string
  platform: string
  company: string
  sukukType?: string | null
  principalInvested: number
  startDate: string | Date | null
  maturityDate: string | Date | null
  profitModel: 'Periodic payouts' | 'Bullet payout at maturity'
  payouts: ZakatPayout[]
}

export interface ZakatDealResult {
  dealId: string
  zakatDue: number
  zakatableBase: number
  reason: string
}

export interface ZakatTypeResult {
  type: string
  zakatableBase: number
  zakatDue: number
  method: string
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

const addDays = (date: Date, days: number) => {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

const toStartOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate())

export const calcSukukZakatPdf = (
  deals: ZakatSukukDeal[],
  settings: ZakatSettings
) => {
  const results: ZakatDealResult[] = []
  let totalDue = 0
  let totalBase = 0
  const zakatDate = toDate(settings.zakatDate)

  deals.forEach((deal) => {
    const startDate = toDate(deal.startDate)
    const hawlDate = startDate ? addDays(startDate, HIJRI_YEAR_DAYS) : null

    let dealDue = 0
    let dealBase = 0
    let reason = 'No payouts received'

    deal.payouts.forEach((payout) => {
      const payoutDate = toDate(payout.date)
      if (!payoutDate || !hawlDate) return

      const amount = Math.abs(payout.amount)
      const receivedAfterHawl = toStartOfDay(payoutDate) >= toStartOfDay(hawlDate)
      const isProfit = payout.type.includes('PROFIT')

      if (settings.treatSukukProfitAsCash && isProfit && zakatDate) {
        const hawlMetByZakat = toStartOfDay(zakatDate) >= toStartOfDay(hawlDate)
        const receivedByZakatDate = toStartOfDay(payoutDate) <= toStartOfDay(zakatDate)
        if (hawlMetByZakat && receivedByZakatDate) {
          dealBase += amount
          dealDue += amount * ZAKAT_RATE
          reason = 'Profit received before zakat date → 2.5%'
        } else if (dealBase === 0) {
          reason = 'Profit received before hawl → 0'
        }
        return
      }

      if (receivedAfterHawl) {
        dealBase += amount
        dealDue += amount * ZAKAT_RATE
        reason = 'Received after hawl → 2.5% of received'
      } else if (dealBase === 0) {
        reason = 'Received before hawl → 0'
      }
    })

    totalBase += dealBase
    totalDue += dealDue
    results.push({
      dealId: deal.id,
      zakatDue: dealDue,
      zakatableBase: dealBase,
      reason,
    })
  })

  return { totalDue, totalBase, results }
}

export const calcSukukZakatStandard = (base: number) => ({
  zakatableBase: base,
  zakatDue: base * ZAKAT_RATE,
})

export const calcSimpleZakat = (base: number) => ({
  zakatableBase: base,
  zakatDue: base * ZAKAT_RATE,
})

export const calcTotalZakat = (
  results: ZakatTypeResult[],
  settings: ZakatSettings
) => {
  const totalAssets = results.reduce((sum, item) => sum + item.zakatableBase, 0)
  const totalDueRaw = results.reduce((sum, item) => sum + item.zakatDue, 0)
  const liabilities = settings.includeLiabilities ? settings.liabilities : 0
  const netBase = Math.max(0, totalAssets - liabilities)
  const aboveNisab = netBase >= settings.nisabValue
  const liabilityZakat = liabilities * ZAKAT_RATE
  const totalDue = aboveNisab ? Math.max(0, totalDueRaw - liabilityZakat) : 0

  return {
    totalAssets,
    liabilities,
    netBase,
    totalDue,
    aboveNisab,
  }
}
