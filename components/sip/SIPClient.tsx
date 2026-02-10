'use client'

import { useState } from 'react'
import { CreateSipInput } from '@/lib/validation'
import { SIPForm } from './SIPForm'

interface Investment {
  id: string
  name: string
  principalAmount: number
  currentValue: number
  startDate: string
  metadata?: string
  account: {
    id: string
    name: string
    type: string
    currency: string
  }
  myParticipation?: {
    investedAmount: number
    currentValue: number
  }
}

interface SIPClientProps {
  investments: Investment[]
  userRole: string
}

export function SIPClient({ investments, userRole }: SIPClientProps) {
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [currentInvestments, setCurrentInvestments] = useState(investments)

  // Helper to parse SIP metadata
  const parseSipMetadata = (inv: any) => {
    try {
      return JSON.parse(inv.metadata || '{}')
    } catch {
      return {}
    }
  }

  const handleCreateSip = async (data: CreateSipInput) => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/sip/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create SIP plan')
      }
      const newSip = await response.json()
      setCurrentInvestments((prev: Investment[]) => [newSip, ...prev])
      setShowCreateForm(false)
    } catch (error) {
      console.error('Create SIP error:', error)
      throw error
    } finally {
      setIsLoading(false)
    }
  }

  const handleInvestNow = async (sipId: string) => {
    const amount = prompt('Enter investment amount (SAR):')
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      return
    }

    try {
      const response = await fetch('/api/sip/invest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sipId, amount: parseFloat(amount) }),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to invest')
      }
      const updatedSip = await response.json()
      setCurrentInvestments((prev: Investment[]) => prev.map(inv => inv.id === sipId ? updatedSip : inv))
    } catch (error) {
      console.error('Invest error:', error)
      alert(error instanceof Error ? error.message : 'Failed to invest')
    }
  }

  const handleUpdateTotal = async (sipId: string) => {
    const newTotal = prompt('Enter new total amount (SAR):')
    if (!newTotal || isNaN(parseFloat(newTotal)) || parseFloat(newTotal) <= 0) {
      return
    }

    try {
      const response = await fetch('/api/sip/update-total', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sipId, totalAmount: parseFloat(newTotal) }),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to update total')
      }
      const updatedSip = await response.json()
      setCurrentInvestments((prev: Investment[]) => prev.map(inv => inv.id === sipId ? updatedSip : inv))
    } catch (error) {
      console.error('Update total error:', error)
      alert(error instanceof Error ? error.message : 'Failed to update total')
    }
  }

  // Filter only SIP investments
  const sipInvestments = currentInvestments.filter(inv => {
    const meta = parseSipMetadata(inv)
    return meta.type === 'SIP'
  })

  const totalTargetAmount = sipInvestments.reduce((sum, inv) => {
    const meta = parseSipMetadata(inv)
    return sum + (meta.totalAmount || 0)
  }, 0)

  const totalInvested = sipInvestments.reduce((sum, inv) => {
    const meta = parseSipMetadata(inv)
    return sum + (meta.investedAmount || inv.principalAmount || 0)
  }, 0)

  const currentValue = sipInvestments.reduce((sum, inv) => {
    const meta = parseSipMetadata(inv)
    return sum + (meta.currentValue || inv.currentValue || 0)
  }, 0)

  const totalReturn = currentValue - totalInvested
  const returnPercentage = totalInvested > 0 ? ((totalReturn / totalInvested) * 100) : 0

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Target Amount</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                SAR {totalTargetAmount.toLocaleString()}
              </p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <span className="text-xl">🎯</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Invested</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                SAR {totalInvested.toLocaleString()}
              </p>
            </div>
            <div className="w-12 h-12 bg-emerald-100 rounded-lg flex items-center justify-center">
              <span className="text-xl">💰</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Current Value</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                SAR {currentValue.toLocaleString()}
              </p>
            </div>
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <span className="text-xl">📊</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Return</p>
              <p className={`text-2xl font-bold mt-1 ${totalReturn >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {totalReturn >= 0 ? '+' : ''}SAR {totalReturn.toLocaleString()}
              </p>
              <p className={`text-xs mt-1 ${totalReturn >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {returnPercentage >= 0 ? '+' : ''}{returnPercentage.toFixed(2)}%
              </p>
            </div>
            <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${totalReturn >= 0 ? 'bg-emerald-100' : 'bg-red-100'}`}>
              <span className="text-xl">{totalReturn >= 0 ? '📈' : '📉'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Add New SIP Button */}
      {userRole === 'OWNER' && (
        <div className="flex justify-end">
          <button
            onClick={() => setShowCreateForm(true)}
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
          >
            + Add New SIP
          </button>
        </div>
      )}

      {/* SIP List */}
      {sipInvestments.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <div className="text-4xl mb-4">📈</div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No SIP Plans Yet</h3>
          <p className="text-gray-600">
            {userRole === 'OWNER' 
              ? 'Create your first SIP plan to start investing systematically.' 
              : 'Contact the owner to add SIP plans.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-6 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900">SIP Plans</h2>
            <p className="text-sm text-gray-600 mt-1">{sipInvestments.length} active plan{sipInvestments.length > 1 ? 's' : ''}</p>
          </div>
          <div className="divide-y divide-gray-100">
            {sipInvestments.map((inv) => {
              const meta = parseSipMetadata(inv)
              const invested = meta.investedAmount || inv.principalAmount || 0
              const current = meta.currentValue || inv.currentValue || 0
              const target = meta.totalAmount || 0
              const progress = target > 0 ? (invested / target) * 100 : 0
              const returns = current - invested
              const returnsPct = invested > 0 ? (returns / invested) * 100 : 0

              return (
                <div key={inv.id} className="p-6 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900">{inv.name}</h3>
                        <span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-xs font-medium rounded-full">
                          Active
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mb-4">
                        {inv.account.name} • Started {new Date(inv.startDate).toLocaleDateString()}
                      </p>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                        <div>
                          <p className="text-xs text-gray-500">Target</p>
                          <p className="text-sm font-semibold text-gray-900">SAR {target.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Invested</p>
                          <p className="text-sm font-semibold text-gray-900">SAR {invested.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Current</p>
                          <p className="text-sm font-semibold text-gray-900">SAR {current.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Returns</p>
                          <p className={`text-sm font-semibold ${returns >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {returns >= 0 ? '+' : ''}SAR {returns.toLocaleString()} ({returnsPct >= 0 ? '+' : ''}{returnsPct.toFixed(2)}%)
                          </p>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="mb-4">
                        <div className="flex justify-between text-xs text-gray-600 mb-1">
                          <span>Progress</span>
                          <span>{progress.toFixed(1)}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-emerald-600 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${Math.min(progress, 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    {userRole === 'OWNER' && (
                      <div className="flex flex-col gap-2 ml-4">
                        <button
                          onClick={() => handleInvestNow(inv.id)}
                          className="px-3 py-1.5 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 transition-colors"
                        >
                          Invest Now
                        </button>
                        <button
                          onClick={() => handleUpdateTotal(inv.id)}
                          className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
                        >
                          Update Total
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Create SIP Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-900">Create New SIP Plan</h2>
              <button
                onClick={() => setShowCreateForm(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            <SIPForm
              onSubmit={handleCreateSip}
              onCancel={() => setShowCreateForm(false)}
              isLoading={isLoading}
            />
          </div>
        </div>
      )}
    </div>
  )
}
