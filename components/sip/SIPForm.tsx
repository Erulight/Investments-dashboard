'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/Button'
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
        <label htmlFor="accountId" className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
          Investment Account *
        </label>
        <select
          id="accountId"
          value={formData.accountId}
          onChange={(e) => handleChange('accountId', e.target.value)}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100"
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
        <label htmlFor="name" className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
          SIP Plan Name *
        </label>
        <input
          id="name"
          type="text"
          value={formData.name}
          onChange={(e) => handleChange('name', e.target.value)}
          placeholder="e.g., Retirement Fund, Education Savings"
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100 dark:placeholder:text-slate-500"
          required
        />
        {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name}</p>}
      </div>

      {/* Start Date */}
      <div>
        <label htmlFor="startDate" className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
          Start Date *
        </label>
        <input
          id="startDate"
          type="date"
          value={formData.startDate}
          onChange={(e) => handleChange('startDate', e.target.value)}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100"
          required
        />
        {errors.startDate && <p className="mt-1 text-sm text-red-600">{errors.startDate}</p>}
      </div>

      {/* Notes */}
      <div>
        <label htmlFor="notes" className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
          Notes (Optional)
        </label>
        <textarea
          id="notes"
          value={formData.notes}
          onChange={(e) => handleChange('notes', e.target.value)}
          placeholder="Any additional notes about this SIP plan..."
          rows={3}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100 dark:placeholder:text-slate-500"
        />
      </div>

      {/* Form Actions */}
      <div className="flex justify-end space-x-3 border-t border-slate-200 pt-4 dark:border-white/10">
        <Button
          type="button"
          variant="secondary"
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          variant="primary"
          disabled={isLoading}
        >
          {isLoading ? 'Creating...' : 'Create SIP Plan'}
        </Button>
      </div>

      {errors.submit && <p className="mt-2 text-sm text-red-600">{errors.submit}</p>}
    </form>
  )
}
