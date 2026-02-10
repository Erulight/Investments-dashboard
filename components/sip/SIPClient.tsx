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
      setCurrentInvestments(prev => [newSip, ...prev])
      setShowCreateForm(false)
    } catch (error) {
      console.error('Create SIP error:', error)
      throw error
    } finally {
      setIsLoading(false)
    }
  }

  // Filter only SIP investments
  const sipInvestments = currentInvestments.filter(inv => {
    const meta = parseSipMetadata(inv)
    return meta.type === 'SIP'
  })

  const totalMonthlyAmount = sipInvestments.reduce((sum, inv) => {
    const meta = parseSipMetadata(inv)
    return sum + (meta.totalMonthlyAmount || 0)
  }, 0)

  const totalInvested = sipInvestments.reduce((sum, inv) => {
    const meta = parseSipMetadata(inv)
    return sum + (meta.totalInvested || 0)
  }, 0)

  const currentValue = sipInvestments.reduce((sum, inv) => {
    const meta = parseSipMetadata(inv)
    return sum + (meta.currentValue || 0)
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
              <p className="text-sm font-medium text-gray-600">Monthly SIP Amount</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                SAR {totalMonthlyAmount.toLocaleString()}
              </p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
              <span className="text-xl">📊</span>
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
            <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center">
              <span className="text-xl">💰</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Current Value</p>
              <p className="text-2xl font-bold text-emerald-600 mt-1">
                SAR {currentValue.toLocaleString()}
              </p>
            </div>
            <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center">
              <span className="text-xl">📈</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Returns</p>
              <p className={`text-2xl font-bold mt-1 ${totalReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {totalReturn >= 0 ? '+' : ''}SAR {totalReturn.toLocaleString()}
              </p>
              <p className={`text-xs mt-1 ${totalReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {returnPercentage >= 0 ? '+' : ''}{returnPercentage.toFixed(2)}%
              </p>
            </div>
            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
              totalReturn >= 0 ? 'bg-green-100' : 'bg-red-100'
            }`}>
              <span className="text-xl">{totalReturn >= 0 ? '📊' : '📉'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* SIP Plans List */}
      {sipInvestments.length > 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-6 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">SIP Plans</h2>
                <p className="text-sm text-gray-600 mt-1">
                  {sipInvestments.length} active plan{sipInvestments.length !== 1 ? 's' : ''}
                </p>
              </div>
              {userRole === 'OWNER' && (
                <button
                  onClick={() => setShowCreateForm(true)}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors flex items-center space-x-2"
                >
                  <span>+</span>
                  <span>Add New SIP</span>
                </button>
              )}
            </div>
          </div>
          <div className="p-6">
            <div className="space-y-6">
              {sipInvestments.map((sip) => {
                const meta = parseSipMetadata(sip)
                const allocations = meta.allocations || []
                
                return (
                  <div key={sip.id} className="border border-gray-200 rounded-lg p-4 hover:border-emerald-300 transition-colors">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">{sip.name}</h3>
                        <p className="text-sm text-gray-600">
                          Account: {sip.account?.name} ({sip.account?.type})
                        </p>
                        <p className="text-sm text-gray-600">
                          Started: {new Date(sip.startDate).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-gray-600">Monthly Amount</p>
                        <p className="text-xl font-bold text-emerald-600">
                          SAR {meta.totalMonthlyAmount?.toLocaleString() || 0}
                        </p>
                      </div>
                    </div>
                    
                    {/* Allocations */}
                    <div className="mt-4">
                      <h4 className="text-sm font-semibold text-gray-700 mb-2">Allocations</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {allocations.map((alloc: any, i: number) => (
                          <div key={i} className="bg-gray-50 rounded p-3">
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="font-medium text-gray-900">{alloc.company}</p>
                                <p className="text-sm text-gray-600">{alloc.category}</p>
                                {alloc.notes && (
                                  <p className="text-xs text-gray-500 mt-1">{alloc.notes}</p>
                                )}
                              </div>
                              <div className="text-right">
                                <p className="font-semibold text-emerald-600">
                                  SAR {alloc.amount?.toLocaleString() || 0}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {alloc.percentage?.toFixed(1) || '0.0'}%
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    {/* Performance */}
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <p className="text-gray-600">Total Invested</p>
                          <p className="font-semibold text-gray-900">
                            SAR {meta.totalInvested?.toLocaleString() || 0}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-600">Current Value</p>
                          <p className="font-semibold text-emerald-600">
                            SAR {meta.currentValue?.toLocaleString() || 0}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-600">Returns</p>
                          <p className={`font-semibold ${
                            (meta.currentValue || 0) - (meta.totalInvested || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                          }`}>
                            SAR {((meta.currentValue || 0) - (meta.totalInvested || 0)).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">📊</span>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No SIP plans yet</h3>
          <p className="text-gray-600 mb-6">Start by creating your first Systematic Investment Plan</p>
          {userRole === 'OWNER' && (
            <button
              onClick={() => setShowCreateForm(true)}
              className="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors inline-flex items-center space-x-2"
            >
              <span>+</span>
              <span>Create Your First SIP</span>
            </button>
          )}
        </div>
      )}

      {/* Create SIP Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">Create New SIP Plan</h2>
              <p className="text-sm text-gray-600 mt-1">Set up your systematic investment plan with multiple allocations</p>
            </div>
            <div className="p-6">
              <SIPForm
                onSubmit={handleCreateSip}
                onCancel={() => setShowCreateForm(false)}
                isLoading={isLoading}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
