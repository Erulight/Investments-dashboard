export const DISPLAY_CURRENCY_KEY = 'DISPLAY_CURRENCY'

export type DisplayCurrency = 'SAR' | 'USD'

export const normalizeDisplayCurrency = (value?: string | null): DisplayCurrency => {
  const token = String(value || '').trim().toUpperCase()
  return token === 'USD' ? 'USD' : 'SAR'
}

export const getCurrencyLabel = (currency: DisplayCurrency) => {
  return currency === 'USD' ? 'Dollar' : 'Riyal'
}

export const getCurrencyPrefix = (currency: DisplayCurrency) => {
  return currency === 'USD' ? '$' : 'SAR'
}

export const formatCurrencyAmount = (value: number, currency: DisplayCurrency) => {
  const amount = Number.isFinite(value) ? value : 0
  const formatted = amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `${getCurrencyPrefix(currency)} ${formatted}`
}
