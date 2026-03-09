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
    monthlyContribution: initialData?.monthlyContribution || 0,
    totalMonths: initialData?.totalMonths || 12,
    bookingFee: initialData?.bookingFee ?? 0,
    rewardProgram: initialData?.rewardProgram ?? 'NONE',
    rewardAmount: initialData?.rewardAmount,
    receiptMonth: initialData?.receiptMonth,
    startDate: initialData?.startDate || new Date().toISOString().split('T')[0],
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
    if (formData.monthlyContribution <= 0) newErrors.monthlyContribution = 'Monthly contribution must be positive'
    if (formData.totalMonths <= 0) newErrors.totalMonths = 'Total months must be at least 1'
    if (!formData.startDate) newErrors.startDate = 'Start date is required'
    if (formData.receiptMonth && formData.receiptMonth > formData.totalMonths) {
      newErrors.receiptMonth = 'Receipt month cannot exceed total months'
    }
    
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
        <CardTitle className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          {initialData ? 'Edit Savings Plan' : 'Create New Savings Plan'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Account Selection */}
          <div>
            <label htmlFor="accountId" className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
              Account *
            </label>
            <select
              id="accountId"
              name="accountId"
              value={formData.accountId}
              onChange={handleChange}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100"
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
            <label htmlFor="name" className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
              Plan Name *
            </label>
            <input
              id="name"
              name="name"
              type="text"
              value={formData.name}
              onChange={handleChange}
              placeholder="e.g., Emergency Fund, Vacation Savings"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100 dark:placeholder:text-slate-500"
              required
            />
            {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name}</p>}
          </div>

          {/* Monthly Contribution */}
          <div>
            <label htmlFor="monthlyContribution" className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
              Monthly Contribution (SAR) *
            </label>
            <input
              id="monthlyContribution"
              name="monthlyContribution"
              type="number"
              step="0.01"
              min="0"
              value={formData.monthlyContribution}
              onChange={handleChange}
              placeholder="1000"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100 dark:placeholder:text-slate-500"
              required
            />
            {errors.monthlyContribution && <p className="mt-1 text-sm text-red-600">{errors.monthlyContribution}</p>}
          </div>

          {/* Total Months */}
          <div>
            <label htmlFor="totalMonths" className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
              Total Months *
            </label>
            <input
              id="totalMonths"
              name="totalMonths"
              type="number"
              min="1"
              value={formData.totalMonths}
              onChange={handleChange}
              placeholder="12"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100 dark:placeholder:text-slate-500"
              required
            />
            {errors.totalMonths && <p className="mt-1 text-sm text-red-600">{errors.totalMonths}</p>}
          </div>

          {/* Booking Fee (optional) */}
          <div>
            <label htmlFor="bookingFee" className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
              Booking Fee (SAR)
            </label>
            <input
              id="bookingFee"
              name="bookingFee"
              type="number"
              step="0.01"
              min="0"
              value={formData.bookingFee ?? ''}
              onChange={handleChange}
              placeholder="One-time booking fee"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              One-time fee for joining the ROSCA
            </p>
          </div>

          {/* Reward Amount (optional) */}
          <div>
            <label htmlFor="rewardAmount" className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
              Reward (SAR)
            </label>
            <input
              id="rewardAmount"
              name="rewardAmount"
              type="number"
              step="0.01"
              min="0"
              value={formData.rewardAmount ?? ''}
              onChange={handleChange}
              placeholder="0"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Optional: Fixed reward amount per month. Leave empty or 0 for no reward.
            </p>
            {errors.rewardAmount && <p className="mt-1 text-sm text-red-600">{errors.rewardAmount}</p>}
          </div>

          {/* Receipt Month (optional) */}
          <div>
            <label htmlFor="receiptMonth" className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
              Receipt Month (Early Receipt)
            </label>
            <input
              id="receiptMonth"
              name="receiptMonth"
              type="number"
              min="1"
              max={formData.totalMonths}
              value={formData.receiptMonth ?? ''}
              onChange={handleChange}
              placeholder={`1-${formData.totalMonths}`}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Optional: Month you want to receive the payout (1-{formData.totalMonths}). You'll pay back remaining months.
            </p>
            {errors.receiptMonth && <p className="mt-1 text-sm text-red-600">{errors.receiptMonth}</p>}
          </div>

          {/* Start Date */}
          <div>
            <label htmlFor="startDate" className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
              Start Date *
            </label>
            <input
              id="startDate"
              name="startDate"
              type="date"
              value={formData.startDate}
              onChange={handleChange}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100"
              required
            />
            {errors.startDate && <p className="mt-1 text-sm text-red-600">{errors.startDate}</p>}
          </div>

          {/* Notes */}
          <div>
            <label htmlFor="notes" className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
              Notes
            </label>
            <textarea
              id="notes"
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows={3}
              placeholder="Any additional notes about this savings plan..."
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
          </div>

          {/* Error Message */}
          {errors.submit && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-500/30 dark:bg-red-500/10">
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
