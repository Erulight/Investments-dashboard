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
    notes: initialData?.notes || '',
  })
  
  const [accounts, setAccounts] = useState<any[]>([])
  const [persons, setPersons] = useState<any[]>([])
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

  // Fetch accounts and persons on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        // For now, we'll skip fetching accounts/persons
        // In a real implementation, you'd fetch these from API endpoints
        setAccounts([])
        setPersons([])
      } catch (err) {
        console.error('Failed to fetch form data:', err)
      }
    }
    fetchData()
  }, [])

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
      // Prepare data for validation
      const submitData = {
        ...formData,
        principalAmount: parseFloat(formData.principalAmount),
        currentValue: formData.currentValue ? parseFloat(formData.currentValue) : undefined,
        interestRate: formData.interestRate ? parseFloat(formData.interestRate) : undefined,
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
            Account ID *
          </label>
          <input
            type="text"
            id="accountId"
            name="accountId"
            required
            value={formData.accountId}
            onChange={handleChange}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Account ID (you'll need to get this from your accounts)"
          />
          {errors.accountId && <p className="text-sm text-red-600 mt-1">{errors.accountId}</p>}
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
              Principal Amount * (SAR)
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
              Current Value (SAR)
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
            Interest Rate (%)
          </label>
          <input
            type="number"
            id="interestRate"
            name="interestRate"
            step="0.01"
            min="0"
            max="100"
            value={formData.interestRate}
            onChange={handleChange}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="0.00"
          />
          {errors.interestRate && <p className="text-sm text-red-600 mt-1">{errors.interestRate}</p>}
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
