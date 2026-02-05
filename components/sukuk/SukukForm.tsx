'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import { createSukukSchema, type CreateSukukInput } from '@/lib/validation'

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
    principalAmount: initialData?.principalAmount || '',
    currentValue: initialData?.currentValue || '',
    startDate: initialData?.startDate ? new Date(initialData.startDate).toISOString().split('T')[0] : '',
    maturityDate: initialData?.maturityDate ? new Date(initialData.maturityDate).toISOString().split('T')[0] : '',
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
    const principal = parseFloat(formData.principalAmount || '0')
    const fees = parseFloat(formData.fees || '0')
    const receivable = parseFloat(formData.receivableAmount || '0')
    if (!principal || !formData.startDate || !formData.maturityDate) {
      setFormData((prev: any) => ({ ...prev, interestRate: '' }))
      return
    }
    const startDate = new Date(formData.startDate)
    const maturityDate = new Date(formData.maturityDate)
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
    const { name, value } = e.target
    setFormData((prev: any) => ({ ...prev, [name]: value }))
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
      const startDate = formData.startDate ? new Date(formData.startDate) : null
      const maturityDate = formData.maturityDate ? new Date(formData.maturityDate) : null
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
      const url = mode === 'create' 
        ? '/api/sukuk/create' 
        : `/api/sukuk/${initialData?.id}`
      
      const method = mode === 'create' ? 'POST' : 'PUT'

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

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-xl bg-red-50 p-4 border border-red-200">
          <div className="flex items-center">
            <span className="text-xl mr-2">⚠️</span>
            <p className="text-sm text-red-800 font-medium">{error}</p>
          </div>
        </div>
      )}

      {/* Basic Information */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">Basic Information</h3>
        
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
            Sukuk Name *
          </label>
          <input
            type="text"
            id="name"
            name="name"
            required
            value={formData.name}
            onChange={handleChange}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="e.g., ABC Corp Sukuk 2024"
          />
          {errors.name && <p className="text-sm text-red-600 mt-1">{errors.name}</p>}
        </div>

        <div>
          <label htmlFor="accountId" className="block text-sm font-medium text-gray-700 mb-1">
            Account *
          </label>
          <select
            id="accountId"
            name="accountId"
            required
            value={formData.accountId}
            onChange={handleChange}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
          >
            <option value="">Select a Sukuk account</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name} ({account.currency})
              </option>
            ))}
          </select>
          {errors.accountId && <p className="text-sm text-red-600 mt-1">{errors.accountId}</p>}
          {loadError && <p className="text-sm text-red-600 mt-1">{loadError}</p>}
          {!loadError && accounts.length === 0 && (
            <p className="text-sm text-gray-500 mt-1">No Sukuk accounts found.</p>
          )}
        </div>

        <div>
          <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-1">
            Category
          </label>
          <input
            type="text"
            id="category"
            name="category"
            value={formData.category}
            onChange={handleChange}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="e.g., Corporate, Sovereign"
          />
        </div>
      </div>

      {/* Financial Information */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">Financial Details</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="principalAmount" className="block text-sm font-medium text-gray-700 mb-1">
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
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="0.00"
            />
            {errors.principalAmount && <p className="text-sm text-red-600 mt-1">{errors.principalAmount}</p>}
          </div>

          <div>
            <label htmlFor="currentValue" className="block text-sm font-medium text-gray-700 mb-1">
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
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="0.00"
            />
            {errors.currentValue && <p className="text-sm text-red-600 mt-1">{errors.currentValue}</p>}
          </div>
        </div>

        <div>
          <label htmlFor="interestRate" className="block text-sm font-medium text-gray-700 mb-1">
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
            className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-700"
            placeholder="Auto-calculated"
          />
          {errors.interestRate && <p className="text-sm text-red-600 mt-1">{errors.interestRate}</p>}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="fees" className="block text-sm font-medium text-gray-700 mb-1">
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
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="0.00"
            />
            {errors.fees && <p className="text-sm text-red-600 mt-1">{errors.fees}</p>}
          </div>

          <div>
            <label htmlFor="totalReceived" className="block text-sm font-medium text-gray-700 mb-1">
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
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="0.00"
            />
            {errors.totalReceived && <p className="text-sm text-red-600 mt-1">{errors.totalReceived}</p>}
          </div>
        </div>

        <div>
          <label htmlFor="receivableAmount" className="block text-sm font-medium text-gray-700 mb-1">
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
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="0.00"
          />
          {errors.receivableAmount && <p className="text-sm text-red-600 mt-1">{errors.receivableAmount}</p>}
          <p className="text-xs text-gray-500 mt-1">
            Enter expected net profit after fees. APR will be calculated automatically.
          </p>
        </div>
      </div>

      {/* Dates */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">Timeline</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="startDate" className="block text-sm font-medium text-gray-700 mb-1">
              Start Date *
            </label>
            <input
              type="date"
              id="startDate"
              name="startDate"
              required
              value={formData.startDate}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {errors.startDate && <p className="text-sm text-red-600 mt-1">{errors.startDate}</p>}
          </div>

          <div>
            <label htmlFor="maturityDate" className="block text-sm font-medium text-gray-700 mb-1">
              Maturity Date
            </label>
            <input
              type="date"
              id="maturityDate"
              name="maturityDate"
              value={formData.maturityDate}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {errors.maturityDate && <p className="text-sm text-red-600 mt-1">{errors.maturityDate}</p>}
          </div>
        </div>
      </div>

      {/* Notes */}
      <div>
        <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
          Notes
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          value={formData.notes}
          onChange={handleChange}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="Additional notes..."
        />
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-end space-x-4 pt-4 border-t">
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
