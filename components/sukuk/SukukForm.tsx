'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import { DateInput } from '@/components/ui/DateInput'
import { createSukukSchema, type CreateSukukInput } from '@/lib/validation'
import { formatDateInput, parseDateInput, toIsoDateInput } from '@/lib/date'

interface SukukFormProps {
  mode: 'create' | 'edit'
  initialData?: any
  onSuccess?: () => void
  onCancel?: () => void
}

export function SukukForm({ mode, initialData, onSuccess, onCancel }: SukukFormProps) {
  const [formData, setFormData] = useState<any>({
    accountId: initialData?.accountId || '',
    name: initialData?.name || '',
    category: initialData?.category || '',
    isIjarah: initialData?.isIjarah ?? false,
    principalAmount: initialData?.principalAmount || '',
    currentValue: initialData?.currentValue || '',
    startDate: formatDateInput(initialData?.startDate),
    maturityDate: formatDateInput(initialData?.maturityDate),
    interestRate: initialData?.interestRate || '',
    fees: initialData?.fees ?? '',
    totalReceived: initialData?.totalReceived ?? '',
    receivableAmount: initialData?.receivableAmount ?? '',
    notes: initialData?.notes || '',
  })
  
  const [accounts, setAccounts] = useState<any[]>([])
  const [participants, setParticipants] = useState<any[]>(
    initialData?.dealParticipants?.map((p: any) => ({
      personId: p.personId,
      investedAmount: p.investedAmount,
      sharePercentage: p.sharePercentage || '',
      notes: p.notes || '',
    })) || []
  )
  
  const [errors, setErrors] = useState<any>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [loadError, setLoadError] = useState('')
  const [receiptForm, setReceiptForm] = useState({
    source: 'PROFIT',
    amount: '',
    date: formatDateInput(new Date()),
    notes: '',
  })
  const [receiptHistory, setReceiptHistory] = useState<any[]>(initialData?.transactions ?? [])
  const [receiptLoading, setReceiptLoading] = useState(false)
  const [receiptError, setReceiptError] = useState('')
  const [receiptMessage, setReceiptMessage] = useState('')

  // Fetch accounts on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoadError('')
        const res = await fetch('/api/accounts?type=SUKUK')
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(data.error || 'Failed to load accounts')
        }
        const accountList = Array.isArray(data.accounts) ? data.accounts : []
        setAccounts(accountList)
        if (accountList.length === 1) {
          setFormData((prev: any) =>
            prev.accountId ? prev : { ...prev, accountId: accountList[0].id }
          )
        }
      } catch (err) {
        console.error('Failed to fetch accounts:', err)
        setLoadError('Failed to load accounts. Please refresh.')
      }
    }
    fetchData()
  }, [])

  useEffect(() => {
    if (Array.isArray(initialData?.transactions)) {
      setReceiptHistory(initialData.transactions)
    }
  }, [initialData?.transactions])

  useEffect(() => {
    const principal = parseFloat(formData.principalAmount || '0')
    const fees = parseFloat(formData.fees || '0')
    const receivable = parseFloat(formData.receivableAmount || '0')
    if (!principal || !formData.startDate || !formData.maturityDate) {
      setFormData((prev: any) => ({ ...prev, interestRate: '' }))
      return
    }
    const startDate = parseDateInput(formData.startDate)
    const maturityDate = parseDateInput(formData.maturityDate)
    if (!startDate || !maturityDate) {
      setFormData((prev: any) => ({ ...prev, interestRate: '' }))
      return
    }
    const periodMonths = (maturityDate.getFullYear() - startDate.getFullYear()) * 12
      + (maturityDate.getMonth() - startDate.getMonth())
      + (maturityDate.getDate() - startDate.getDate()) / 30
    const periodYears = periodMonths ? periodMonths / 12 : 0
    if (!periodYears) {
      setFormData((prev: any) => ({ ...prev, interestRate: '' }))
      return
    }
    const apr = ((receivable + fees) / principal / periodYears) * 100
    const next = Number.isFinite(apr) ? apr.toFixed(2) : ''
    setFormData((prev: any) => (prev.interestRate === next ? prev : { ...prev, interestRate: next }))
  }, [formData.principalAmount, formData.fees, formData.receivableAmount, formData.startDate, formData.maturityDate])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target
    const nextValue = name === 'isIjarah' && type === 'select-one'
      ? value === 'true'
      : value
    setFormData((prev: any) => ({ ...prev, [name]: nextValue }))
    // Clear error for this field
    if (errors[name]) {
      setErrors((prev: any) => ({ ...prev, [name]: undefined }))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setErrors({})
    setLoading(true)

    try {
      const parseOptionalNumber = (value: string) => (value === '' ? undefined : parseFloat(value))

      // Prepare data for validation
      const principalAmount = parseFloat(formData.principalAmount)
      const fees = parseOptionalNumber(formData.fees) ?? 0
      const receivableAmount = parseOptionalNumber(formData.receivableAmount)
      const startDate = formData.startDate ? parseDateInput(formData.startDate) : null
      const maturityDate = formData.maturityDate ? parseDateInput(formData.maturityDate) : null
      if (!startDate) {
        setErrors((prev: any) => ({ ...prev, startDate: 'Invalid date format' }))
        setError('Please fix the validation errors')
        return
      }
      if (formData.maturityDate && !maturityDate) {
        setErrors((prev: any) => ({ ...prev, maturityDate: 'Invalid date format' }))
        setError('Please fix the validation errors')
        return
      }
      const periodMonths = startDate && maturityDate
        ? (maturityDate.getFullYear() - startDate.getFullYear()) * 12
          + (maturityDate.getMonth() - startDate.getMonth())
          + (maturityDate.getDate() - startDate.getDate()) / 30
        : null
      const periodYears = periodMonths ? periodMonths / 12 : null
      const computedApr = receivableAmount !== undefined && periodYears && principalAmount > 0
        ? ((receivableAmount + fees) / principalAmount / periodYears) * 100
        : parseOptionalNumber(formData.interestRate)

      const submitData = {
        ...formData,
        principalAmount,
        currentValue: parseOptionalNumber(formData.currentValue),
        interestRate: computedApr,
        fees,
        totalReceived: parseOptionalNumber(formData.totalReceived),
        receivableAmount,
        isIjarah: Boolean(formData.isIjarah),
        startDate: toIsoDateInput(formData.startDate),
        maturityDate: formData.maturityDate ? toIsoDateInput(formData.maturityDate) : undefined,
        participants: participants.map(p => ({
          ...p,
          investedAmount: parseFloat(p.investedAmount),
          sharePercentage: p.sharePercentage ? parseFloat(p.sharePercentage) : undefined,
        })),
      }

      // Client-side validation
      const result = createSukukSchema.safeParse(submitData)
      if (!result.success) {
        const fieldErrors: any = {}
        result.error.issues.forEach((err) => {
          const path = err.path.join('.')
          fieldErrors[path] = err.message
        })
        setErrors(fieldErrors)
        setError('Please fix the validation errors')
        return
      }

      // Submit to API
      const isEditMode = Boolean(initialData?.id)
      const url = isEditMode
        ? `/api/sukuk/${initialData.id}`
        : '/api/sukuk/create'

      const method = isEditMode ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submitData),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || `Failed to ${mode} Sukuk`)
        if (data.details) {
          setErrors(data.details)
        }
        return
      }

      // Success
      if (onSuccess) {
        onSuccess()
      }
    } catch (err) {
      setError('An error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleReceipt = async (e?: React.FormEvent | React.MouseEvent) => {
    e?.preventDefault()
    if (mode !== 'edit' || !initialData?.id) return
    if (!receiptForm.amount) {
      setReceiptError('Amount is required')
      return
    }
    if (!receiptForm.date) {
      setReceiptError('Date is required')
      return
    }
    setReceiptLoading(true)
    setReceiptError('')
    setReceiptMessage('')
    try {
      const isoDate = toIsoDateInput(receiptForm.date)
      if (!isoDate) {
        setReceiptError('Invalid date format')
        setReceiptLoading(false)
        return
      }
      const res = await fetch(`/api/sukuk/${initialData.id}/withdraw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: receiptForm.source,
          amount: parseFloat(receiptForm.amount),
          date: isoDate,
          notes: receiptForm.notes,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || 'Failed to record receipt')
      }
      const updated = data.investment
      setFormData((prev: any) => ({
        ...prev,
        totalReceived: updated?.totalReceived ?? prev.totalReceived,
        principalAmount: updated?.principalAmount ?? prev.principalAmount,
        currentValue: updated?.currentValue ?? prev.currentValue,
      }))
      const entry = {
        id: `local-${Date.now()}`,
        type: receiptForm.source === 'PROFIT' ? 'WITHDRAW_PROFIT' : 'WITHDRAW_PRINCIPAL',
        amount: Math.abs(parseFloat(receiptForm.amount)),
        date: isoDate,
        description: receiptForm.notes || null,
      }
      setReceiptHistory((prev) => [entry, ...prev])
      setReceiptForm((prev) => ({ ...prev, amount: '', notes: '' }))
      setReceiptMessage('Recorded')
    } catch (err) {
      setReceiptError(err instanceof Error ? err.message : 'Failed to record receipt')
    } finally {
      setReceiptLoading(false)
    }
  }

  const addParticipant = () => {
    setParticipants([...participants, { personId: '', investedAmount: '', sharePercentage: '', notes: '' }])
  }

  const removeParticipant = (index: number) => {
    setParticipants(participants.filter((_, i) => i !== index))
  }

  const updateParticipant = (index: number, field: string, value: string) => {
    const updated = [...participants]
    updated[index] = { ...updated[index], [field]: value }
    setParticipants(updated)
  }

  const receiptRows = receiptHistory
    .filter((tx) => tx.type === 'WITHDRAW_PROFIT' || tx.type === 'WITHDRAW_PRINCIPAL')
    .slice()
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-xl bg-red-50 p-4 border border-red-200">
          <div className="flex items-center">
            <span className="text-xl mr-2">⚠️</span>
            <p className="text-sm text-red-800 font-medium dark:text-red-200">{error}</p>
          </div>
        </div>
      )}

      {/* Basic Information */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Basic Information</h3>
        
        <div>
          <label htmlFor="name" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
            Sukuk Name *
          </label>
          <input
            type="text"
            id="name"
            name="name"
            required
            value={formData.name}
            onChange={handleChange}
            className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100 dark:placeholder:text-slate-500"
            placeholder="e.g., ABC Corp Sukuk 2024"
          />
          {errors.name && <p className="text-sm text-red-600 mt-1 dark:text-red-200">{errors.name}</p>}
        </div>

        <div>
          <label htmlFor="accountId" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
            Account *
          </label>
          <select
            id="accountId"
            name="accountId"
            required
            value={formData.accountId}
            onChange={handleChange}
            className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100"
          >
            <option value="">Select a Sukuk account</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name} ({account.currency})
              </option>
            ))}
          </select>
          {errors.accountId && <p className="text-sm text-red-600 mt-1 dark:text-red-200">{errors.accountId}</p>}
          {loadError && <p className="text-sm text-red-600 mt-1 dark:text-red-200">{loadError}</p>}
          {!loadError && accounts.length === 0 && (
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">No Sukuk accounts found.</p>
          )}
        </div>

        <div>
          <label htmlFor="category" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
            Category
          </label>
          <input
            type="text"
            id="category"
            name="category"
            value={formData.category}
            onChange={handleChange}
            className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100 dark:placeholder:text-slate-500"
            placeholder="e.g., Corporate, Sovereign"
          />
        </div>
        <div>
          <label htmlFor="isIjarah" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
            Sukuk Type
          </label>
          <select
            id="isIjarah"
            name="isIjarah"
            value={String(formData.isIjarah)}
            onChange={handleChange}
            className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100"
          >
            <option value="false">Standard (Zakat applies)</option>
            <option value="true">Ijarah (Zakat excluded)</option>
          </select>
        </div>
      </div>

      {/* Financial Information */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Financial Details</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="principalAmount" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
              Principal Amount *
            </label>
            <input
              type="number"
              id="principalAmount"
              name="principalAmount"
              required
              step="0.01"
              min="0"
              value={formData.principalAmount}
              onChange={handleChange}
              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100 dark:placeholder:text-slate-500"
              placeholder="0.00"
            />
            {errors.principalAmount && <p className="text-sm text-red-600 mt-1 dark:text-red-200">{errors.principalAmount}</p>}
          </div>

          <div>
            <label htmlFor="currentValue" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
              Current Value
            </label>
            <input
              type="number"
              id="currentValue"
              name="currentValue"
              step="0.01"
              min="0"
              value={formData.currentValue}
              onChange={handleChange}
              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100 dark:placeholder:text-slate-500"
              placeholder="0.00"
            />
            {errors.currentValue && <p className="text-sm text-red-600 mt-1 dark:text-red-200">{errors.currentValue}</p>}
          </div>
        </div>

        <div>
          <label htmlFor="interestRate" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
            APR Yearly (auto)
          </label>
          <input
            type="number"
            id="interestRate"
            name="interestRate"
            step="0.01"
            min="0"
            max="100"
            value={formData.interestRate}
            readOnly
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-600 shadow-sm dark:border-white/10 dark:bg-slate-950/60 dark:text-slate-300"
            placeholder="Auto-calculated"
          />
          {errors.interestRate && <p className="text-sm text-red-600 mt-1 dark:text-red-200">{errors.interestRate}</p>}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="fees" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
              Fees
            </label>
            <input
              type="number"
              id="fees"
              name="fees"
              step="0.01"
              min="0"
              value={formData.fees}
              onChange={handleChange}
              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100 dark:placeholder:text-slate-500"
              placeholder="0.00"
            />
            {errors.fees && <p className="text-sm text-red-600 mt-1 dark:text-red-200">{errors.fees}</p>}
          </div>

          <div>
            <label htmlFor="totalReceived" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
              Total Received
            </label>
            <input
              type="number"
              id="totalReceived"
              name="totalReceived"
              step="0.01"
              min="0"
              value={formData.totalReceived}
              onChange={handleChange}
              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100 dark:placeholder:text-slate-500"
              placeholder="0.00"
            />
            {errors.totalReceived && <p className="text-sm text-red-600 mt-1 dark:text-red-200">{errors.totalReceived}</p>}
            {mode === 'edit' && (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Use receipts below for dated entries; this total will update automatically.
              </p>
            )}
          </div>
        </div>

        <div>
          <label htmlFor="receivableAmount" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
            Receivable (Net Profit)
          </label>
          <input
            type="number"
            id="receivableAmount"
            name="receivableAmount"
            step="0.01"
            min="0"
            value={formData.receivableAmount}
            onChange={handleChange}
            className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100 dark:placeholder:text-slate-500"
            placeholder="0.00"
          />
          {errors.receivableAmount && <p className="text-sm text-red-600 mt-1 dark:text-red-200">{errors.receivableAmount}</p>}
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Enter expected net profit after fees. APR will be calculated automatically.
          </p>
        </div>
      </div>

      {mode === 'edit' && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Record Receipts</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Log partial profit receipts with dates so maturity timing stays accurate.
          </p>
          <div className="space-y-3">
            {receiptError && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 border border-red-200 dark:bg-red-900/60 dark:border-red-900/60">
                {receiptError}
              </div>
            )}
            {receiptMessage && (
              <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700 border border-green-200">
                {receiptMessage}
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <select
                value={receiptForm.source}
                onChange={(e) => setReceiptForm((prev) => ({ ...prev, source: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100"
              >
                <option value="PROFIT">Profit</option>
                <option value="PRINCIPAL">Principal</option>
              </select>
              <input
                type="number"
                min="0"
                step="0.01"
                value={receiptForm.amount}
                onChange={(e) => setReceiptForm((prev) => ({ ...prev, amount: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100 dark:placeholder:text-slate-500"
                placeholder="Amount"
              />
              <DateInput
                value={receiptForm.date}
                onChange={(value) => setReceiptForm((prev) => ({ ...prev, date: value }))}
                ariaLabel="Receipt date"
              />
              <input
                type="text"
                value={receiptForm.notes}
                onChange={(e) => setReceiptForm((prev) => ({ ...prev, notes: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100 dark:placeholder:text-slate-500"
                placeholder="Notes (optional)"
              />
            </div>
            <div className="flex justify-end">
              <Button type="button" variant="primary" size="sm" disabled={receiptLoading} onClick={handleReceipt}>
                {receiptLoading ? 'Saving...' : 'Add Receipt'}
              </Button>
            </div>
          </div>

          {receiptRows.length > 0 && (
            <div className="rounded-xl border border-slate-200 dark:border-white/10">
              <div className="border-b border-slate-200 px-4 py-2 text-xs font-semibold text-slate-500 dark:border-white/10 dark:text-slate-400">
                Recent Receipts
              </div>
              <div className="divide-y divide-slate-100 text-xs dark:divide-white/10">
                {receiptRows.slice(0, 6).map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between px-4 py-2">
                    <div className="text-slate-700 dark:text-slate-200">
                      {new Date(tx.date).toLocaleDateString()} • {tx.type}
                    </div>
                    <div className="text-green-600">
                      +{Math.abs(tx.amount).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Dates */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Timeline</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="startDate" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
              Start Date *
            </label>
            <DateInput
              id="startDate"
              name="startDate"
              value={formData.startDate}
              onChange={(value) => setFormData((prev: any) => ({ ...prev, startDate: value }))}
              ariaLabel="Start Date"
              required
            />
            {errors.startDate && <p className="text-sm text-red-600 mt-1">{errors.startDate}</p>}
          </div>

          <div>
            <label htmlFor="maturityDate" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
              Maturity Date
            </label>
            <DateInput
              id="maturityDate"
              name="maturityDate"
              value={formData.maturityDate}
              onChange={(value) => setFormData((prev: any) => ({ ...prev, maturityDate: value }))}
              ariaLabel="Maturity Date"
            />
            {errors.maturityDate && <p className="text-sm text-red-600 mt-1">{errors.maturityDate}</p>}
          </div>
        </div>
      </div>

      {/* Notes */}
      <div>
        <label htmlFor="notes" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
          Notes
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          value={formData.notes}
          onChange={handleChange}
          className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100 dark:placeholder:text-slate-500"
          placeholder="Additional notes..."
        />
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-end space-x-4 border-t border-slate-200 pt-4 dark:border-white/10">
        {onCancel && (
          <Button
            type="button"
            variant="secondary"
            onClick={onCancel}
            disabled={loading}
          >
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          variant="primary"
          disabled={loading}
        >
          {loading ? 'Saving...' : mode === 'create' ? 'Create Sukuk' : 'Update Sukuk'}
        </Button>
      </div>
    </form>
  )
}
