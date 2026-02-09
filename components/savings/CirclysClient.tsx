'use client'

import { useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import { Button } from '@/components/ui/Button'
import { SavingsForm } from './SavingsForm'
import { CreateSavingsInput } from '@/lib/validation'

interface CirclysClientProps {
  initialInvestments: any[]
  userRole: string
}

export function CirclysClient({ initialInvestments, userRole }: CirclysClientProps) {
  const [investments, setInvestments] = useState(initialInvestments)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const totalInvested = investments.reduce((sum, inv) => {
    const principal = inv.myParticipation?.investedAmount || inv.principalAmount
    return sum + principal
  }, 0)

  const totalValue = investments.reduce((sum, inv) => {
    const current = inv.myParticipation?.currentValue || inv.currentValue
    return sum + current
  }, 0)

  const totalReturn = totalValue - totalInvested
  const returnPercentage = totalInvested > 0 ? ((totalReturn / totalInvested) * 100) : 0

  // Helper to parse ROSCA metadata
  const parseRoscaMetadata = (inv: any) => {
    try {
      return JSON.parse(inv.metadata || '{}')
    } catch {
      return {}
    }
  }

  const handleCreatePlan = async (data: CreateSavingsInput) => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/savings/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create savings plan')
      }
      const newPlan = await response.json()
      setInvestments(prev => [newPlan, ...prev])
      setShowCreateForm(false)
    } catch (error) {
      console.error('Create plan error:', error)
      throw error
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header Section */}
      <div className="bg-gradient-to-r from-emerald-600 to-cyan-600 rounded-2xl shadow-xl p-8 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold mb-2">Circlys Savings Plans</h1>
            <p className="text-lg text-emerald-100">
              Track your Circlys savings and interest
            </p>
          </div>
          <div className="hidden lg:block text-7xl">
            🔄
          </div>
        </div>

        {/* Summary Stats in Header */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
          <div className="bg-white/10 backdrop-blur-lg rounded-xl p-4 border border-white/20">
            <p className="text-sm text-emerald-100 mb-1">Total Savings</p>
            <p className="text-2xl font-bold">SAR {totalInvested.toLocaleString()}</p>
          </div>
          <div className="bg-white/10 backdrop-blur-lg rounded-xl p-4 border border-white/20">
            <p className="text-sm text-emerald-100 mb-1">Current Value</p>
            <p className="text-2xl font-bold">
              SAR {totalValue.toLocaleString()}
            </p>
          </div>
          <div className="bg-white/10 backdrop-blur-lg rounded-xl p-4 border border-white/20">
            <p className="text-sm text-emerald-100 mb-1">Interest Earned</p>
            <p className="text-2xl font-bold">
              SAR {totalReturn.toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {/* Investments List */}
      <div className="grid grid-cols-1 gap-6">
        {investments.length === 0 ? (
          <Card>
            <CardContent className="py-20 text-center">
              <div className="text-7xl mb-6">🔄</div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">No Circlys Plans Yet</h3>
              <p className="text-gray-500 text-lg">
                {userRole === 'OWNER' 
                  ? 'Start by creating your first Circlys savings plan.' 
                  : 'Contact the owner to add you to Circlys savings plans.'}
              </p>
              {userRole === 'OWNER' && (
                <Button
                  variant="primary"
                  className="mt-6"
                  onClick={() => setShowCreateForm(true)}
                >
                  + Create Your First Plan
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-2xl font-bold text-gray-900">All Circlys Plans</CardTitle>
                  <p className="text-sm text-gray-500 mt-1">{investments.length} active plans</p>
                </div>
                {userRole === 'OWNER' && (
                  <Button
                    variant="primary"
                    onClick={() => setShowCreateForm(true)}
                  >
                    + Add New Plan
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Plan Name</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Monthly</TableHead>
                    <TableHead>Total Months</TableHead>
                    <TableHead>Paid/Remaining</TableHead>
                    <TableHead>Receipt Month</TableHead>
                    <TableHead>Reward</TableHead>
                    <TableHead>Booking Fee</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {investments.map((inv: any) => {
                    const meta = parseRoscaMetadata(inv)
                    const principal = inv.myParticipation?.investedAmount || inv.principalAmount
                    const current = inv.myParticipation?.currentValue || inv.currentValue
                    const monthsPaid = meta.monthsPaid || 0
                    const remainingMonths = (meta.totalMonths || 0) - monthsPaid
                    const receiptMonth = meta.receiptMonth
                    const reward = meta.totalReward || 0
                    const bookingFee = meta.bookingFee || 0

                    return (
                      <TableRow key={inv.id} className="hover:bg-emerald-50 transition-colors duration-150">
                        <TableCell className="font-semibold text-gray-900">
                          <div className="flex items-center space-x-2">
                            <span className="text-xl">💵</span>
                            <span>{inv.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-medium">
                            {inv.account?.name}
                          </span>
                        </TableCell>
                        <TableCell className="font-semibold text-gray-700">
                          {inv.account?.currency} {meta.monthlyContribution?.toLocaleString() || 0}
                        </TableCell>
                        <TableCell className="font-semibold text-gray-700">
                          {meta.totalMonths || 0}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <span className="font-medium text-green-600">{monthsPaid}</span>
                            <span className="text-gray-400"> / </span>
                            <span className="font-medium text-gray-600">{remainingMonths}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {receiptMonth ? (
                            <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                              Month {receiptMonth}
                            </span>
                          ) : (
                            <span className="text-gray-400 text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {reward > 0 ? (
                            <span className="text-sm font-bold text-green-600">
                              +{inv.account?.currency} {reward.toLocaleString()}
                            </span>
                          ) : (
                            <span className="text-gray-400 text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {bookingFee > 0 ? (
                            <span className="text-sm font-medium text-red-600">
                              {inv.account?.currency} {bookingFee.toLocaleString()}
                            </span>
                          ) : (
                            <span className="text-gray-400 text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="px-3 py-1.5 inline-flex items-center text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800 shadow-sm">
                            <span className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></span>
                            {meta.status || 'Active'}
                          </span>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Create Plan Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <SavingsForm
              onSubmit={handleCreatePlan}
              onCancel={() => setShowCreateForm(false)}
              isLoading={isLoading}
            />
          </div>
        </div>
      )}
    </div>
  )
}
