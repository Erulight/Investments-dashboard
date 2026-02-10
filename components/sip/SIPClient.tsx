'use client'

import { useState } from 'react'
import { CreateSipInput } from '@/lib/validation'
import { SIPForm } from './SIPForm'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table'

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

  const formatCurrency = (value: number) => {
    const amount = Number.isFinite(value) ? value : 0
    return `SAR ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
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

  const handleDeleteSip = async (sipId: string) => {
    const confirmed = window.confirm('Delete this SIP? This action cannot be undone.')
    if (!confirmed) return

    try {
      const response = await fetch(`/api/sip/${sipId}`, { method: 'DELETE' })
      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.error || 'Failed to delete SIP')
      }
      setCurrentInvestments((prev: Investment[]) => prev.filter(inv => inv.id !== sipId))
    } catch (error) {
      console.error('Delete SIP error:', error)
      alert(error instanceof Error ? error.message : 'Failed to delete SIP')
    }
  }

  // Filter only SIP investments
  const sipInvestments = currentInvestments.filter(inv => {
    const meta = parseSipMetadata(inv)
    return meta.type === 'SIP'
  })

  return (
    <div className="space-y-6">
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
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <Table className="text-xs table-auto min-w-[1100px]">
            <TableHeader className="sticky top-0 bg-gray-50">
              <TableRow>
                <TableHead className="px-2 py-1.5 whitespace-nowrap">Platform</TableHead>
                <TableHead className="px-2 py-1.5 whitespace-nowrap">ETF</TableHead>
                <TableHead className="px-2 py-1.5 whitespace-nowrap">Risk Level</TableHead>
                <TableHead className="px-2 py-1.5 whitespace-nowrap text-right">Total Invested</TableHead>
                <TableHead className="px-2 py-1.5 whitespace-nowrap text-right">APR Yearly</TableHead>
                <TableHead className="px-2 py-1.5 whitespace-nowrap">Date Started</TableHead>
                <TableHead className="px-2 py-1.5 whitespace-nowrap text-right">Expected Profit</TableHead>
                <TableHead className="px-2 py-1.5 whitespace-nowrap text-right">Expected Actual</TableHead>
                <TableHead className="px-2 py-1.5 whitespace-nowrap text-right">Expected APR</TableHead>
                <TableHead className="px-2 py-1.5 whitespace-nowrap text-right">Actual APR</TableHead>
                <TableHead className="px-2 py-1.5 whitespace-nowrap text-right">Total So Far</TableHead>
                {userRole === 'OWNER' && (
                  <TableHead className="px-2 py-1.5 whitespace-nowrap">Actions</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sipInvestments.map((inv: Investment) => {
                const meta = parseSipMetadata(inv)
                const invested = meta.investedAmount || inv.principalAmount || 0
                const current = meta.currentValue || inv.currentValue || 0
                const target = meta.totalAmount || 0
                const expectedProfit = target > 0 ? Math.max(0, target - invested) : 0

                return (
                  <TableRow key={inv.id} className="hover:bg-blue-50">
                    <TableCell className="px-2 py-1.5 font-semibold text-gray-900 whitespace-nowrap">
                      {inv.account?.name || '-'}
                    </TableCell>
                    <TableCell className="px-2 py-1.5 font-semibold text-gray-900 whitespace-nowrap">
                      {inv.name}
                    </TableCell>
                    <TableCell className="px-2 py-1.5 whitespace-nowrap text-gray-700">
                      {meta.riskLevel || '-'}
                    </TableCell>
                    <TableCell className="px-2 py-1.5 whitespace-nowrap text-right tabular-nums text-gray-900">
                      {formatCurrency(invested)}
                    </TableCell>
                    <TableCell className="px-2 py-1.5 whitespace-nowrap text-right tabular-nums text-gray-700">
                      {meta.aprYearly ? `${Number(meta.aprYearly).toFixed(2)}%` : '-'}
                    </TableCell>
                    <TableCell className="px-2 py-1.5 whitespace-nowrap text-gray-700">
                      {new Date(inv.startDate).toLocaleDateString('en-CA')}
                    </TableCell>
                    <TableCell className="px-2 py-1.5 whitespace-nowrap text-right tabular-nums text-gray-700">
                      {expectedProfit > 0 ? formatCurrency(expectedProfit) : '-'}
                    </TableCell>
                    <TableCell className="px-2 py-1.5 whitespace-nowrap text-right tabular-nums text-gray-900">
                      {formatCurrency(current)}
                    </TableCell>
                    <TableCell className="px-2 py-1.5 whitespace-nowrap text-right tabular-nums text-gray-700">
                      {meta.expectedAprYearly ? `${Number(meta.expectedAprYearly).toFixed(2)}%` : '-'}
                    </TableCell>
                    <TableCell className="px-2 py-1.5 whitespace-nowrap text-right tabular-nums text-gray-700">
                      {meta.actualAprYearly ? `${Number(meta.actualAprYearly).toFixed(2)}%` : '-'}
                    </TableCell>
                    <TableCell className="px-2 py-1.5 whitespace-nowrap text-right tabular-nums font-semibold text-gray-900">
                      {formatCurrency(current)}
                    </TableCell>
                    {userRole === 'OWNER' && (
                      <TableCell className="px-2 py-1.5 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleInvestNow(inv.id)}
                            className="px-2 py-1 bg-emerald-600 text-white text-xs rounded hover:bg-emerald-700 transition-colors"
                          >
                            Invest
                          </button>
                          <button
                            onClick={() => handleUpdateTotal(inv.id)}
                            className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors"
                          >
                            Update
                          </button>
                          <button
                            onClick={() => handleDeleteSip(inv.id)}
                            className="px-2 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700 transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
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
