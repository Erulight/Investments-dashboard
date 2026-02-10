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
  initialData?: Partial<CreateSipInput>
  isLoading?: boolean
}

export function SIPForm({ onSubmit, onCancel, initialData, isLoading }: SIPFormProps) {
  const [formData, setFormData] = useState<CreateSipInput>({
    accountId: initialData?.accountId || '',
    name: initialData?.name || '',
    totalAmount: initialData?.totalAmount || 0,
    startDate: initialData?.startDate || new Date().toISOString().split('T')[0],
    notes: initialData?.notes || '',
  })

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [accounts, setAccounts] = useState<Account[]>([])
  const [accountsLoading, setAccountsLoading] = useState(true)

  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        const response = await fetch('/api/sip/accounts')
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

  const handleChange = (field: keyof CreateSipInput, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Basic validation
    const newErrors: Record<string, string> = {}
    if (!formData.accountId) newErrors.accountId = 'Account is required'
    if (!formData.name) newErrors.name = 'SIP name is required'
    if (formData.totalAmount <= 0) newErrors.totalAmount = 'Total amount must be positive'
    if (!formData.startDate) newErrors.startDate = 'Start date is required'
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    try {
      await onSubmit(formData)
    } catch (error) {
      console.error('Submit error:', error)
      setErrors({ submit: 'Failed to save SIP plan' })
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Account Selection */}
      <div>
        <label htmlFor="accountId" className="block text-sm font-medium text-gray-700 mb-2">
          Account *
        </label>
        <select
          id="accountId"
          value={formData.accountId}
          onChange={(e) => handleChange('accountId', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          required
        >
          <option value="">Select an account</option>
          {accounts.map((acc) => (
            <option key={acc.id} value={acc.id}>
              {acc.name} ({acc.type}) - {acc.currency}
            </option>
          ))}
        </select>
        {errors.accountId && <p className="mt-1 text-sm text-red-600">{errors.accountId}</p>}
      </div>

      {/* SIP Name */}
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
          SIP Name *
        </label>
        <input
          id="name"
          type="text"
          value={formData.name}
          onChange={(e) => handleChange('name', e.target.value)}
          placeholder="e.g., Malaa SIP Portfolio"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          required
        />
        {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name}</p>}
      </div>

      {/* Total Amount */}
      <div>
        <label htmlFor="totalAmount" className="block text-sm font-medium text-gray-700 mb-2">
          Total Amount (SAR) *
        </label>
        <input
          id="totalAmount"
          type="number"
          step="0.01"
          min="0"
          value={formData.totalAmount}
          onChange={(e) => handleChange('totalAmount', parseFloat(e.target.value) || 0)}
          placeholder="10000"
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
          Notes
        </label>
        <textarea
          id="notes"
          value={formData.notes}
          onChange={(e) => handleChange('notes', e.target.value)}
          rows={3}
          placeholder="Any additional notes about this SIP plan..."
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
          onChange={(e) => handleChange('totalMonthlyAmount', parseFloat(e.target.value) || 0)}
          placeholder="5000"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          required
        />
        {errors.totalMonthlyAmount && <p className="mt-1 text-sm text-red-600">{errors.totalMonthlyAmount}</p>}
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

      {/* Allocations */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <label className="block text-sm font-medium text-gray-700">
            Allocations *
          </label>
          <button
            type="button"
            onClick={addAllocation}
            className="px-3 py-1 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 transition-colors"
          >
            + Add Allocation
          </button>
        </div>
        
        {errors.allocations && <p className="mb-2 text-sm text-red-600">{errors.allocations}</p>}
        
        <div className="space-y-3">
          {formData.allocations.map((allocation, index) => (
            <div key={index} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Company *</label>
                  <input
                    type="text"
                    value={allocation.company}
                    onChange={(e) => handleAllocationChange(index, 'company', e.target.value)}
                    placeholder="e.g., Malaa"
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                  />
                  {errors[`allocation_${index}_company`] && (
                    <p className="mt-1 text-xs text-red-600">{errors[`allocation_${index}_company`]}</p>
                  )}
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Category *</label>
                  <input
                    type="text"
                    value={allocation.category}
                    onChange={(e) => handleAllocationChange(index, 'category', e.target.value)}
                    placeholder="e.g., Stocks, Bonds, Real Estate"
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                  />
                  {errors[`allocation_${index}_category`] && (
                    <p className="mt-1 text-xs text-red-600">{errors[`allocation_${index}_category`]}</p>
                  )}
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Amount (SAR) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={allocation.amount || ''}
                    onChange={(e) => handleAllocationChange(index, 'amount', parseFloat(e.target.value) || 0)}
                    placeholder="0"
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                  />
                  {errors[`allocation_${index}_amount`] && (
                    <p className="mt-1 text-xs text-red-600">{errors[`allocation_${index}_amount`]}</p>
                  )}
                </div>
                
                <div className="flex items-end space-x-2">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-600 mb-1">%</label>
                    <div className="px-2 py-1 text-sm bg-gray-100 rounded text-gray-700">
                      {allocation.percentage?.toFixed(1) || '0.0'}%
                    </div>
                  </div>
                  {formData.allocations.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeAllocation(index)}
                      className="px-2 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700 transition-colors"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
              
              <div className="mt-2">
                <input
                  type="text"
                  value={allocation.notes || ''}
                  onChange={(e) => handleAllocationChange(index, 'notes', e.target.value)}
                  placeholder="Optional notes for this allocation..."
                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>
            </div>
          ))}
        </div>
        
        {/* Allocation Summary */}
        <div className="mt-4 p-3 bg-blue-50 rounded-lg">
          <div className="flex justify-between text-sm">
            <span>Total Allocated:</span>
            <span className={`font-semibold ${remaining === 0 ? 'text-green-600' : 'text-red-600'}`}>
              SAR {totalAllocated.toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between text-sm mt-1">
            <span>Remaining:</span>
            <span className={`font-semibold ${remaining === 0 ? 'text-green-600' : 'text-red-600'}`}>
              SAR {remaining.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* Notes */}
      <div>
        <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-2">
          Notes
        </label>
        <textarea
          id="notes"
          value={formData.notes}
          onChange={(e) => handleChange('notes', e.target.value)}
          rows={3}
          placeholder="Any additional notes about this SIP plan..."
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
          disabled={isLoading || remaining !== 0}
          className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isLoading ? 'Creating...' : 'Create SIP Plan'}
        </button>
      </div>

      {errors.submit && <p className="mt-2 text-sm text-red-600">{errors.submit}</p>}
    </form>
  )
}
