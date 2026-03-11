export const DISPLAY_CURRENCY_KEY = 'DISPLAY_CURRENCY'

export type DisplayCurrency = 'SAR' | 'USD'
export const SAR_PER_USD = 3.75
export const NEW_SAR_SYMBOL = '\u20C1'

export const normalizeDisplayCurrency = (value?: string | null): DisplayCurrency => {
  const token = String(value || '').trim().toUpperCase()
  return token === 'USD' ? 'USD' : 'SAR'
}

export const getCurrencyLabel = (currency: DisplayCurrency) => {
  return currency === 'USD' ? 'Dollar' : 'Riyal'
}

export const getCurrencyPrefix = (currency: DisplayCurrency) => {
  return currency === 'USD' ? '$' : NEW_SAR_SYMBOL
}

export const convertCurrencyAmount = (
  value: number,
  fromCurrency: DisplayCurrency,
  toCurrency: DisplayCurrency,
) => {
  const amount = Number.isFinite(value) ? value : 0
  if (fromCurrency === toCurrency) return amount
  if (fromCurrency === 'SAR' && toCurrency === 'USD') return amount / SAR_PER_USD
  if (fromCurrency === 'USD' && toCurrency === 'SAR') return amount * SAR_PER_USD
  return amount
}

export const formatCurrencyAmount = (
  value: number,
  currency: DisplayCurrency,
  sourceCurrency: DisplayCurrency = 'SAR',
) => {
  const convertedAmount = convertCurrencyAmount(value, sourceCurrency, currency)
  const symbol = getCurrencyPrefix(currency)
  const amount = Number.isFinite(convertedAmount) ? convertedAmount : 0
  const formatted = amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `${formatted} ${symbol}`
}
