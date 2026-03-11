const pad = (value: number) => value.toString().padStart(2, '0')

export const parseDateInput = (value?: string | null) => {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null

  // Handle YYYY-MM-DD format (with or without time component)
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    const dateOnly = trimmed.slice(0, 10)
    const date = new Date(`${dateOnly}T00:00:00`)
    if (Number.isNaN(date.getTime())) return null
    return date
  }

  const match = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/)
  if (!match) return null
  const day = Number(match[1])
  const month = Number(match[2])
  const yearToken = String(match[3])
  const year = yearToken.length === 2 ? 2000 + Number(yearToken) : Number(yearToken)
  const date = new Date(year, month - 1, day)
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null
  }
  return date
}

export const formatDateInput = (value?: string | Date | null) => {
  if (!value) return ''
  const date = value instanceof Date ? value : parseDateInput(String(value))
  if (!date) return ''
  return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${String(date.getFullYear()).slice(-2)}`
}

export const toIsoDateInput = (value?: string | null) => {
  const date = parseDateInput(value || '')
  if (!date) return null
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export const formatGregorianDate = (value?: string | Date | null) => {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${String(date.getFullYear()).slice(-2)}`
}

export const formatDisplayDate = (value?: string | Date | null, fallback = '-') => {
  if (!value) return fallback
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return fallback
  return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${String(date.getFullYear()).slice(-2)}`
}

export const formatHijriDate = (value?: string | Date | null) => {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  try {
    return new Intl.DateTimeFormat('ar-SA-u-ca-islamic', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(date)
  } catch {
    return ''
  }
}

export const formatGregorianAndHijriDate = (value?: string | Date | null) => {
  const g = formatGregorianDate(value)
  const h = formatHijriDate(value)
  if (!g && !h) return ''
  if (g && h) return `${g} • ${h}`
  return g || h
}
