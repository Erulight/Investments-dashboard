'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { CreateSavingsInput } from '@/lib/validation'

interface Account {
  id: string
  name: string
  type: string
  currency: string
}

interface SavingsFormProps {
  onSubmit: (data: CreateSavingsInput) => Promise<void>
  onCancel: () => void
  initialData?: Partial<CreateSavingsInput>
  isLoading?: boolean
}

export function SavingsForm({ onSubmit, onCancel, initialData, isLoading }: SavingsFormProps) {
  const [formData, setFormData] = useState<CreateSavingsInput>({
    accountId: initialData?.accountId || '',
    name: initialData?.name || '',
    principalAmount: initialData?.principalAmount || 0,
    currentValue: initialData?.currentValue,
    startDate: initialData?.startDate || new Date().toISOString().split('T')[0],
    interestRate: initialData?.interestRate,
    notes: initialData?.notes || '',
    participants: initialData?.participants || [],
  })

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [accounts, setAccounts] = useState<Account[]>([])
  const [accountsLoading, setAccountsLoading] = useState(true)

  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        const response = await fetch('/api/savings/accounts')
        if (response.ok) {
          const data = await response.json()
          setAccounts(data)
        }
      } catch (error) {
        console.error('Failed to fetch accounts:', error)
      } finally {
        setAccountsLoading(false)
      }
    }
    fetchAccounts()
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? (value === '' ? 0 : Number(value)) : value,
    }))
    // Clear error for this field
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Basic validation
    const newErrors: Record<string, string> = {}
    if (!formData.accountId) newErrors.accountId = 'Account is required'
    if (!formData.name) newErrors.name = 'Plan name is required'
    if (formData.principalAmount <= 0) newErrors.principalAmount = 'Principal amount must be positive'
    if (!formData.startDate) newErrors.startDate = 'Start date is required'
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    try {
      await onSubmit(formData)
    } catch (error) {
      console.error('Submit error:', error)
      setErrors({ submit: 'Failed to save savings plan' })
    }
  }

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle className="text-2xl font-bold text-gray-900">
          {initialData ? 'Edit Savings Plan' : 'Create New Savings Plan'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Account Selection */}
          <div>
            <label htmlFor="accountId" className="block text-sm font-medium text-gray-700 mb-2">
              Account *
            </label>
            <select
              id="accountId"
              name="accountId"
              value={formData.accountId}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              required
              disabled={accountsLoading}
            >
              <option value="">
                {accountsLoading ? 'Loading accounts...' : 'Select an account'}
              </option>
              {accounts
                .filter(acc => acc.type === 'CIRCLYS')
                .map(acc => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({acc.currency})
                  </option>
                ))}
            </select>
            {errors.accountId && <p className="mt-1 text-sm text-red-600">{errors.accountId}</p>}
          </div>

          {/* Plan Name */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
              Plan Name *
            </label>
            <input
              id="name"
              name="name"
              type="text"
              value={formData.name}
              onChange={handleChange}
              placeholder="e.g., Emergency Fund, Vacation Savings"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              required
            />
            {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name}</p>}
          </div>

          {/* Principal Amount */}
          <div>
            <label htmlFor="principalAmount" className="block text-sm font-medium text-gray-700 mb-2">
              Principal Amount (SAR) *
            </label>
            <input
              id="principalAmount"
              name="principalAmount"
              type="number"
              step="0.01"
              min="0"
              value={formData.principalAmount}
              onChange={handleChange}
              placeholder="10000"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              required
            />
            {errors.principalAmount && <p className="mt-1 text-sm text-red-600">{errors.principalAmount}</p>}
          </div>

          {/* Current Value (optional) */}
          <div>
            <label htmlFor="currentValue" className="block text-sm font-medium text-gray-700 mb-2">
              Current Value (SAR)
            </label>
            <input
              id="currentValue"
              name="currentValue"
              type="number"
              step="0.01"
              min="0"
              value={formData.currentValue ?? ''}
              onChange={handleChange}
              placeholder="Leave empty to use principal amount"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            />
            <p className="mt-1 text-sm text-gray-500">
              Leave empty to use principal amount as current value
            </p>
          </div>

          {/* Start Date */}
          <div>
            <label htmlFor="startDate" className="block text-sm font-medium text-gray-700 mb-2">
              Start Date *
            </label>
            <input
              id="startDate"
              name="startDate"
              type="date"
              value={formData.startDate}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              required
            />
            {errors.startDate && <p className="mt-1 text-sm text-red-600">{errors.startDate}</p>}
          </div>

          {/* Interest Rate (optional) */}
          <div>
            <label htmlFor="interestRate" className="block text-sm font-medium text-gray-700 mb-2">
              Annual Interest Rate (%)
            </label>
            <input
              id="interestRate"
              name="interestRate"
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={formData.interestRate ?? ''}
              onChange={handleChange}
              placeholder="e.g., 4.5"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            />
            <p className="mt-1 text-sm text-gray-500">
              Optional: Annual interest rate for tracking purposes
            </p>
          </div>

          {/* Notes */}
          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-2">
              Notes
            </label>
            <textarea
              id="notes"
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows={3}
              placeholder="Any additional notes about this savings plan..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>

          {/* Error Message */}
          {errors.submit && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{errors.submit}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end space-x-3 pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={onCancel}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={isLoading || accountsLoading}
            >
              {isLoading ? 'Saving...' : (initialData ? 'Update Plan' : 'Create Plan')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
