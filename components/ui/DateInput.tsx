import { useRef } from 'react'
import { formatDateInput, toIsoDateInput } from '@/lib/date'

const normalizeDateInput = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 8)
  if (digits.length <= 2) return digits
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
}

type DateInputProps = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  ariaLabel?: string
  disabled?: boolean
}

export function DateInput({
  value,
  onChange,
  placeholder = 'DD/MM/YYYY',
  className = '',
  ariaLabel,
  disabled,
}: DateInputProps) {
  const pickerRef = useRef<HTMLInputElement>(null)

  const openPicker = () => {
    if (disabled) return
    const iso = toIsoDateInput(value)
    if (pickerRef.current) {
      pickerRef.current.value = iso || ''
      if (typeof pickerRef.current.showPicker === 'function') {
        pickerRef.current.showPicker()
      } else {
        pickerRef.current.focus()
      }
    }
  }

  return (
    <div className={`relative flex items-center ${className}`}>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(normalizeDateInput(e.target.value))}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
        placeholder={placeholder}
        aria-label={ariaLabel}
        disabled={disabled}
      />
      <button
        type="button"
        onClick={openPicker}
        className="absolute right-2 text-gray-400 hover:text-gray-600"
        aria-label="Open calendar"
        disabled={disabled}
      >
        📅
      </button>
      <input
        ref={pickerRef}
        type="date"
        className="sr-only"
        onChange={(e) => onChange(formatDateInput(e.target.value))}
        tabIndex={-1}
      />
    </div>
  )
}
