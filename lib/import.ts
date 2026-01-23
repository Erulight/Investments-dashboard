import { parse } from 'csv-parse/sync'

export interface CSVRow {
  [key: string]: string
}

export interface ImportError {
  row: number
  field: string
  value: string
  message: string
}

export function parseCSV(content: string): { data: CSVRow[]; errors: ImportError[] } {
  const errors: ImportError[] = []
  
  try {
    const records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as CSVRow[]
    
    records.forEach((row, index) => {
      Object.entries(row).forEach(([field, value]) => {
        if (value.includes('#NUM!') || value.includes('#VALUE!') || value.includes('#REF!')) {
          errors.push({
            row: index + 2,
            field,
            value,
            message: 'Invalid Excel error value',
          })
        }
      })
    })
    
    return { data: records, errors }
  } catch (error) {
    throw new Error(`Failed to parse CSV: ${error}`)
  }
}

export function validateDate(value: string): Date | null {
  if (!value || value.trim() === '') return null
  
  const date = new Date(value)
  if (isNaN(date.getTime())) return null
  
  return date
}

export function validateNumber(value: string): number | null {
  if (!value || value.trim() === '') return null
  
  const num = parseFloat(value.replace(/,/g, ''))
  if (isNaN(num)) return null
  
  return num
}
