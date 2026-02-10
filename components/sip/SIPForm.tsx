'use client'

import { useState, useEffect } from 'react'
import { CreateSipInput } from '@/lib/validation'

interface Account {
  id: string
  name: string
  type: string
  currency: string
}

interface SIPFormProps {
  onSubmit: (data: CreateSipInput) => Promise<void>
  onCancel: () => void
  isLoading?: boolean
  initialData?: Partial<CreateSipInput>
}

export function SIPForm({ onSubmit, onCancel, isLoading = false, initialData }: SIPFormProps) {
  const [formData, setFormData] = useState<CreateSipInput>({
    accountId: initialData?.accountId || '',
    name: initialData?.name || '',
    totalAmount: initialData?.totalAmount || 0,
    startDate: initialData?.startDate || new Date().toISOString().split('T')[0],
    notes: initialData?.notes || '',
  })

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [accounts, setAccounts] = useState<Account[]>([])

  useEffect(() => {
    fetchAccounts()
  }, [])

  const fetchAccounts = async () => {
    try {
      const response = await fetch('/api/sip/accounts')
      if (response.ok) {
        const data = await response.json()
        setAccounts(data)
      }
    } catch (error) {
      console.error('Failed to fetch accounts:', error)
    }
  }

  const handleChange = (field: keyof CreateSipInput, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    // Clear error for this field when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }))
    }
  }

  const validateForm = () => {
    const newErrors: Record<string, string> = {}
    
    if (!formData.accountId) {
      newErrors.accountId = 'Account is required'
    }
    
    if (!formData.name.trim()) {
      newErrors.name = 'SIP name is required'
    }
    
    if (!formData.totalAmount || formData.totalAmount <= 0) {
      newErrors.totalAmount = 'Total amount must be greater than 0'
    }
    
    if (!formData.startDate) {
      newErrors.startDate = 'Start date is required'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm()) {
      return
    }

    try {
      await onSubmit(formData)
    } catch (error) {
      setErrors({ submit: error instanceof Error ? error.message : 'Failed to create SIP plan' })
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Account Selection */}
      <div>
        <label htmlFor="accountId" className="block text-sm font-medium text-gray-700 mb-2">
          Investment Account *
        </label>
        <select
          id="accountId"
          value={formData.accountId}
          onChange={(e) => handleChange('accountId', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          required
        >
          <option value="">Select an account</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name} ({account.type})
            </option>
          ))}
        </select>
        {errors.accountId && <p className="mt-1 text-sm text-red-600">{errors.accountId}</p>}
      </div>

      {/* SIP Name */}
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
          SIP Plan Name *
        </label>
        <input
          id="name"
          type="text"
          value={formData.name}
          onChange={(e) => handleChange('name', e.target.value)}
          placeholder="e.g., Retirement Fund, Education Savings"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          required
        />
        {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name}</p>}
      </div>

      {/* Total Amount */}
      <div>
        <label htmlFor="totalAmount" className="block text-sm font-medium text-gray-700 mb-2">
          Target Amount (SAR) *
        </label>
        <input
          id="totalAmount"
          type="number"
          min="0"
          step="0.01"
          value={formData.totalAmount || ''}
          onChange={(e) => handleChange('totalAmount', parseFloat(e.target.value) || 0)}
          placeholder="100000"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          required
        />
        {errors.totalAmount && <p className="mt-1 text-sm text-red-600">{errors.totalAmount}</p>}
      </div>

      {/* Start Date */}
      <div>
        <label htmlFor="startDate" className="block text-sm font-medium text-gray-700 mb-2">
          Start Date *
        </label>
        <input
          id="startDate"
          type="date"
          value={formData.startDate}
          onChange={(e) => handleChange('startDate', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          required
        />
        {errors.startDate && <p className="mt-1 text-sm text-red-600">{errors.startDate}</p>}
      </div>

      {/* Notes */}
      <div>
        <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-2">
          Notes (Optional)
        </label>
        <textarea
          id="notes"
          value={formData.notes}
          onChange={(e) => handleChange('notes', e.target.value)}
          placeholder="Any additional notes about this SIP plan..."
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
        />
      </div>

      {/* Form Actions */}
      <div className="flex justify-end space-x-3 pt-4 border-t">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isLoading}
          className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isLoading ? 'Creating...' : 'Create SIP Plan'}
        </button>
      </div>

      {errors.submit && <p className="mt-2 text-sm text-red-600">{errors.submit}</p>}
    </form>
  )
}
