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
  id?: string
  name?: string
  required?: boolean
  disabled?: boolean
}

export function DateInput({
  value,
  onChange,
  placeholder = 'DD/MM/YYYY',
  className = '',
  ariaLabel,
  id,
  name,
  required,
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
        id={id}
        name={name}
        type="text"
        value={value}
        onChange={(e) => onChange(normalizeDateInput(e.target.value))}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition-colors focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-emerald-400 dark:focus:ring-emerald-400/20"
        placeholder={placeholder}
        aria-label={ariaLabel}
        required={required}
        disabled={disabled}
      />
      <button
        type="button"
        onClick={openPicker}
        className="absolute right-2 rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-500 dark:hover:bg-white/5 dark:hover:text-slate-300"
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
