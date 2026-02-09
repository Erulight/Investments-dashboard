'use client'

import { useMemo, useState } from 'react'
import type { ChangeEvent, MouseEvent } from 'react'
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
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingInvestment, setEditingInvestment] = useState<any | null>(null)
  const [deleteLoadingId, setDeleteLoadingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string>('')
  const [payLoadingKey, setPayLoadingKey] = useState<string | null>(null)
  const [payErrorByKey, setPayErrorByKey] = useState<Record<string, string>>({})
  const [payAmountByKey, setPayAmountByKey] = useState<Record<string, string>>({})
  const [payRewardByKey, setPayRewardByKey] = useState<Record<string, string>>({})

  // Helper to parse ROSCA metadata
  const parseRoscaMetadata = (inv: any) => {
    try {
      return JSON.parse(inv.metadata || '{}')
    } catch {
      return {}
    }
  }

  const totalInvested = investments.reduce((sum: number, inv: any) => {
    const meta = parseRoscaMetadata(inv)
    const totalPaidFromMeta = Number(meta.totalPaid)
    const principal = Number.isFinite(totalPaidFromMeta)
      ? totalPaidFromMeta
      : (inv.myParticipation?.investedAmount || inv.principalAmount)
    return sum + (Number(principal) || 0)
  }, 0)

  const totalValue = investments.reduce((sum: number, inv: any) => {
    const meta = parseRoscaMetadata(inv)
    const totalPaidFromMeta = Number(meta.totalPaid)
    const totalRewardPaidFromMeta = Number(meta.totalRewardPaid)
    const hasMetaTotals = meta.totalPaid !== undefined || meta.totalRewardPaid !== undefined
    const valueFromMeta = (Number.isFinite(totalPaidFromMeta) ? totalPaidFromMeta : 0) +
      (Number.isFinite(totalRewardPaidFromMeta) ? totalRewardPaidFromMeta : 0)
    const current = hasMetaTotals
      ? valueFromMeta
      : (inv.myParticipation?.currentValue || inv.currentValue)
    return sum + (Number(current) || 0)
  }, 0)

  const totalReturn = totalValue - totalInvested

  const addMonths = (date: Date, months: number) => {
    const d = new Date(date)
    d.setMonth(d.getMonth() + months)
    return d
  }

  const formatMonthLabel = (date: Date) => {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    return `${monthNames[date.getMonth()]} ${date.getFullYear()}`
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
      setInvestments((prevInvestments: any[]) => [newPlan, ...prevInvestments])
      setShowCreateForm(false)
    } catch (error: any) {
      console.error('Create plan error:', error)
      throw error
    } finally {
      setIsLoading(false)
    }
  }

  const handleUpdatePlan = async (investmentId: string, data: CreateSavingsInput) => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/savings/${investmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.error || 'Failed to update savings plan')
      }
      const updated = await response.json()
      setInvestments((prev: any[]) => prev.map((inv: any) => (inv.id === updated.id ? updated : inv)))
      setEditingInvestment(null)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeletePlan = async (investmentId: string) => {
    setDeleteError('')
    setDeleteLoadingId(investmentId)
    try {
      const response = await fetch(`/api/savings/${investmentId}`, { method: 'DELETE' })
      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.error || 'Failed to delete plan')
      }
      setInvestments((prev: any[]) => prev.filter((inv: any) => inv.id !== investmentId))
      if (expandedId === investmentId) setExpandedId(null)
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Failed to delete plan')
    } finally {
      setDeleteLoadingId(null)
    }
  }

  const expandedInvestment = useMemo(() => {
    if (!expandedId) return null
    return investments.find((inv: any) => inv.id === expandedId) || null
  }, [expandedId, investments])

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
                    {userRole === 'OWNER' && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {investments.map((inv: any) => {
                    const meta = parseRoscaMetadata(inv)
                    const monthsPaid = meta.monthsPaid || 0
                    const remainingMonths = (meta.totalMonths || 0) - monthsPaid
                    const receiptMonth = meta.receiptMonth
                    const reward = meta.totalReward || 0
                    const bookingFee = meta.bookingFee || 0
                    const isExpanded = expandedId === inv.id

                    return (
                      <TableRow
                        key={inv.id}
                        className="hover:bg-emerald-50 transition-colors duration-150 cursor-pointer"
                        onClick={() =>
                          setExpandedId((prev: string | null) => (prev === inv.id ? null : inv.id))
                        }
                      >
                        <TableCell className="font-semibold text-gray-900">
                          <div className="flex items-center space-x-2">
                            <span className="text-xl">💵</span>
                            <span>{inv.name}</span>
                            <span className="text-xs text-gray-400">{isExpanded ? '▲' : '▼'}</span>
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
                        {userRole === 'OWNER' && (
                          <TableCell
                            className="text-right"
                            onClick={(e: MouseEvent<HTMLTableCellElement>) => e.stopPropagation()}
                          >
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="secondary"
                                onClick={() => setEditingInvestment(inv)}
                              >
                                Edit
                              </Button>
                              <Button
                                variant="danger"
                                disabled={deleteLoadingId === inv.id}
                                onClick={() => {
                                  const ok = window.confirm('Delete this plan? This will also delete any monthly zakat buckets created from its payments.')
                                  if (ok) void handleDeletePlan(inv.id)
                                }}
                              >
                                {deleteLoadingId === inv.id ? 'Deleting...' : 'Delete'}
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>

              {deleteError && (
                <div className="mt-3 text-sm text-red-600">{deleteError}</div>
              )}

              {expandedInvestment && (() => {
                const meta = parseRoscaMetadata(expandedInvestment)
                const totalMonths = Number(meta.totalMonths || 0)
                const startDate = new Date(expandedInvestment.startDate)
                const payments: Record<string, any> = meta.payments && typeof meta.payments === 'object' ? meta.payments : {}

                const rows = Array.from({ length: totalMonths }, (_, i) => {
                  const due = addMonths(startDate, i)
                  return {
                    monthIndex: i,
                    due,
                    label: formatMonthLabel(due),
                    payment: payments[String(i)] || null,
                  }
                })

                return (
                  <div className="mt-6 rounded-xl border border-gray-200 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-sm font-semibold text-gray-900">Monthly contributions</div>
                      <div className="text-xs text-gray-500">Click a plan row to collapse</div>
                    </div>

                    <div className="overflow-auto">
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs text-gray-500 border-b">
                            <th className="py-2 pr-3">Month</th>
                            <th className="py-2 pr-3">Due</th>
                            <th className="py-2 pr-3">Amount</th>
                            <th className="py-2 pr-3">Reward</th>
                            <th className="py-2 pr-3">Status</th>
                            <th className="py-2 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {rows.map((r) => {
                            const key = `${expandedInvestment.id}-${r.monthIndex}`
                            const isPaid = Boolean(r.payment?.bucketId)
                            const loading = payLoadingKey === key
                            const defaultAmount = meta.monthlyContribution ? String(meta.monthlyContribution) : ''
                            const amountValue = payAmountByKey[key] ?? (isPaid ? String(r.payment.amount || '') : defaultAmount)
                            const rewardValue = payRewardByKey[key] ?? (isPaid ? String(r.payment.reward || 0) : '0')

                            return (
                              <tr key={key} className="text-gray-700">
                                <td className="py-2 pr-3 whitespace-nowrap font-medium">{r.label}</td>
                                <td className="py-2 pr-3 whitespace-nowrap">
                                  {r.due.toISOString().split('T')[0]}
                                </td>
                                <td className="py-2 pr-3">
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    disabled={isPaid || userRole !== 'OWNER'}
                                    value={amountValue}
                                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                                      setPayAmountByKey((prev: Record<string, string>) => ({
                                        ...prev,
                                        [key]: e.target.value,
                                      }))
                                    }
                                    className="w-32 rounded-lg border border-gray-200 px-2 py-1 text-sm"
                                  />
                                </td>
                                <td className="py-2 pr-3">
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    disabled={isPaid || userRole !== 'OWNER'}
                                    value={rewardValue}
                                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                                      setPayRewardByKey((prev: Record<string, string>) => ({
                                        ...prev,
                                        [key]: e.target.value,
                                      }))
                                    }
                                    className="w-24 rounded-lg border border-gray-200 px-2 py-1 text-sm"
                                  />
                                </td>
                                <td className="py-2 pr-3 whitespace-nowrap">
                                  {isPaid ? (
                                    <span className="text-emerald-700 font-semibold">Paid</span>
                                  ) : (
                                    <span className="text-gray-500">Unpaid</span>
                                  )}
                                </td>
                                <td className="py-2 text-right whitespace-nowrap">
                                  {isPaid ? (
                                    userRole === 'OWNER' ? (
                                      <Button
                                        variant="secondary"
                                        disabled={loading}
                                        onClick={async () => {
                                          setPayErrorByKey((prev: Record<string, string>) => {
                                            const next = { ...prev }
                                            delete next[key]
                                            return next
                                          })
                                          setPayLoadingKey(key)
                                          try {
                                            const response = await fetch(
                                              `/api/savings/${expandedInvestment.id}/pay`,
                                              {
                                                method: 'DELETE',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ monthIndex: r.monthIndex }),
                                              }
                                            )
                                            if (!response.ok) {
                                              const data = await response.json().catch(() => ({}))
                                              throw new Error(data.error || 'Failed to undo payment')
                                            }
                                            const data = await response.json()
                                            setInvestments((prev: any[]) =>
                                              prev.map((inv: any) =>
                                                inv.id === expandedInvestment.id
                                                  ? data.investment
                                                  : inv
                                              )
                                            )
                                          } catch (e) {
                                            setPayErrorByKey((prev: Record<string, string>) => ({
                                              ...prev,
                                              [key]: e instanceof Error ? e.message : 'Failed to undo payment',
                                            }))
                                          } finally {
                                            setPayLoadingKey(null)
                                          }
                                        }}
                                      >
                                        {loading ? 'Undoing...' : 'Undo'}
                                      </Button>
                                    ) : (
                                      <span className="text-xs text-gray-500">Paid</span>
                                    )
                                  ) : userRole === 'OWNER' ? (
                                    <Button
                                      variant="primary"
                                      disabled={loading}
                                      onClick={async () => {
                                        setPayErrorByKey((prev: Record<string, string>) => {
                                          const next = { ...prev }
                                          delete next[key]
                                          return next
                                        })
                                        setPayLoadingKey(key)
                                        try {
                                          const response = await fetch(
                                            `/api/savings/${expandedInvestment.id}/pay`,
                                            {
                                              method: 'POST',
                                              headers: { 'Content-Type': 'application/json' },
                                              body: JSON.stringify({
                                                monthIndex: r.monthIndex,
                                                amount: Number(amountValue),
                                                reward: Number(rewardValue),
                                              }),
                                            }
                                          )
                                          if (!response.ok) {
                                            const data = await response.json().catch(() => ({}))
                                            throw new Error(data.error || 'Failed to pay month')
                                          }
                                          const data = await response.json()
                                          setInvestments((prev: any[]) =>
                                            prev.map((inv: any) =>
                                              inv.id === expandedInvestment.id
                                                ? data.investment
                                                : inv
                                            )
                                          )
                                        } catch (e) {
                                          setPayErrorByKey((prev: Record<string, string>) => ({
                                            ...prev,
                                            [key]: e instanceof Error ? e.message : 'Failed to pay month',
                                          }))
                                        } finally {
                                          setPayLoadingKey(null)
                                        }
                                      }}
                                    >
                                      {loading ? 'Paying...' : 'Pay'}
                                    </Button>
                                  ) : (
                                    <span className="text-xs text-gray-500">—</span>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>

                    {Object.keys(payErrorByKey).some((k) => k.startsWith(`${expandedInvestment.id}-`)) && (
                      <div className="mt-3 text-sm text-red-600">
                        {Object.entries(payErrorByKey)
                          .filter(([k]) => k.startsWith(`${expandedInvestment.id}-`))
                          .map(([, msg]) => msg)
                          .slice(0, 1)[0]}
                      </div>
                    )}
                  </div>
                )
              })()}
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

      {/* Edit Plan Modal */}
      {editingInvestment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <SavingsForm
              initialData={(() => {
                const meta = parseRoscaMetadata(editingInvestment)
                return {
                  accountId: editingInvestment.accountId,
                  name: editingInvestment.name,
                  monthlyContribution: meta.monthlyContribution || 0,
                  totalMonths: meta.totalMonths || 12,
                  bookingFee: meta.bookingFee ?? 0,
                  rewardProgram: meta.rewardProgram ?? 'NONE',
                  rewardAmount: meta.rewardAmount,
                  receiptMonth: meta.receiptMonth ?? undefined,
                  startDate: new Date(editingInvestment.startDate).toISOString().split('T')[0],
                  notes: editingInvestment.notes || '',
                  participants: [],
                }
              })()}
              onSubmit={(data) => handleUpdatePlan(editingInvestment.id, data)}
              onCancel={() => setEditingInvestment(null)}
              isLoading={isLoading}
            />
          </div>
        </div>
      )}
    </div>
  )
}
