'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import { Button } from '@/components/ui/Button'
import { Modal } from './SukukModal'
import { SukukForm } from './SukukForm'

interface SukukListProps {
  initialSukuk: any[]
  userRole: string
}

export function SukukList({ initialSukuk, userRole }: SukukListProps) {
  const router = useRouter()
  const [sukuk, setSukuk] = useState(initialSukuk)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [editingSukuk, setEditingSukuk] = useState<any>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const isEmpty = sukuk.length === 0

  const openCreateModal = () => setIsCreateModalOpen(true)
  const asOfDate = new Date()
  const asOfLabel = asOfDate.toLocaleDateString()

  const toDate = (value?: string | Date | null) => {
    if (!value) return null
    if (value instanceof Date) return value
    if (typeof value === 'string') {
      const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
      if (match) {
        const [, year, month, day] = match
        return new Date(Number(year), Number(month) - 1, Number(day))
      }
    }
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return null
    return date
  }

  const formatDate = (value?: string | Date | null) => {
    const date = toDate(value)
    if (!date) return '-'
    return date.toLocaleDateString('en-CA')
  }

  const formatCurrency = (value: number, currency?: string) => {
    const amount = Number.isFinite(value) ? value : 0
    const formatted = amount.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
    return currency ? `${currency} ${formatted}` : formatted
  }

  const formatPercent = (value: number) => {
    const percent = Number.isFinite(value) ? value : 0
    return `${percent.toFixed(2)}%`
  }

  const getPeriodMonths = (start?: string | Date | null, end?: string | Date | null) => {
    const startDate = toDate(start)
    const endDate = toDate(end)
    if (!startDate || !endDate) return null
    const months = (endDate.getFullYear() - startDate.getFullYear()) * 12
      + (endDate.getMonth() - startDate.getMonth())
      + (endDate.getDate() - startDate.getDate()) / 30
    return Math.max(0, months)
  }

  const getDaysRemaining = (end?: string | Date | null) => {
    const endDate = toDate(end)
    if (!endDate) return null
    const asOf = new Date(asOfDate.getFullYear(), asOfDate.getMonth(), asOfDate.getDate())
    const endDay = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate())
    const diffMs = endDay.getTime() - asOf.getTime()
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
    return Math.max(0, diffDays)
  }

  const getStatus = (netProfit: number, totalReceived: number) => {
    if (netProfit > 0 && totalReceived >= netProfit) {
      return { label: 'Completed', className: 'bg-green-100 text-green-800' }
    }
    return { label: 'Pending', className: 'bg-yellow-100 text-yellow-800' }
  }

  const handleCreateSuccess = () => {
    setIsCreateModalOpen(false)
    router.refresh()
  }

  const handleEditSuccess = () => {
    setIsEditModalOpen(false)
    setEditingSukuk(null)
    router.refresh()
  }

  const handleEdit = (sukukItem: any) => {
    setEditingSukuk(sukukItem)
    setIsEditModalOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this Sukuk? This action cannot be undone.')) {
      return
    }

    setDeletingId(id)
    try {
      const res = await fetch(`/api/sukuk/${id}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'Failed to delete Sukuk')
        return
      }

      // Remove from local state
      setSukuk(sukuk.filter((s) => s.id !== id))
      router.refresh()
    } catch (error) {
      alert('An error occurred while deleting the Sukuk')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">All Sukuk Deals</h2>
          <p className="text-sm text-gray-500 mt-1">{sukuk.length} active investments</p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">As of {asOfLabel}</span>
          {userRole === 'OWNER' && (
            <Button
              onClick={openCreateModal}
              variant="primary"
              size="lg"
            >
              + Add New Deal
            </Button>
          )}
        </div>
      </div>

      {isEmpty ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50/60 p-10 text-center">
          <div className="text-6xl mb-4">💼</div>
          <h3 className="text-2xl font-bold text-gray-900 mb-2">No Sukuk Investments Yet</h3>
          <p className="text-gray-500 text-lg mb-6">
            {userRole === 'OWNER'
              ? 'Start by creating your first Sukuk investment.'
              : 'Contact the owner to add you to Sukuk investments.'}
          </p>
          {userRole === 'OWNER' && (
            <Button onClick={openCreateModal} variant="primary" size="lg">
              + Add New Deal
            </Button>
          )}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Platform</TableHead>
              <TableHead>Sukuk Type</TableHead>
              <TableHead>Company Name</TableHead>
              <TableHead>Total Investment</TableHead>
              <TableHead>APR</TableHead>
              <TableHead>APR After Fees</TableHead>
              <TableHead>Total Investment Period</TableHead>
              <TableHead>Maturity Date</TableHead>
              <TableHead>Maturity Days Remaining</TableHead>
              <TableHead>Fees</TableHead>
              <TableHead>Net Profit</TableHead>
              <TableHead>Total Received</TableHead>
              <TableHead>Receivable</TableHead>
              <TableHead>Status</TableHead>
              {userRole === 'OWNER' && <TableHead>Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sukuk.map((inv: any) => {
              const principal = inv.myParticipation?.investedAmount || inv.principalAmount
              const totalInvestment = Number.isFinite(principal) ? principal : 0
              const apr = Number.isFinite(inv.interestRate) ? inv.interestRate : 0
              const fees = Number.isFinite(inv.fees) ? inv.fees : 0
              const totalReceived = Number.isFinite(inv.totalReceived) ? inv.totalReceived : 0
              const periodMonths = getPeriodMonths(inv.startDate, inv.maturityDate)
              const periodYears = periodMonths ? periodMonths / 12 : 0
              const grossProfit = totalInvestment > 0 && apr > 0 && periodYears > 0
                ? totalInvestment * (apr / 100) * periodYears
                : 0
              const netProfit = grossProfit - fees
              const aprAfterFees = totalInvestment > 0 ? (netProfit / totalInvestment) * 100 : 0
              const receivable = Math.max(0, netProfit - totalReceived)
              const daysRemaining = getDaysRemaining(inv.maturityDate)
              const status = getStatus(netProfit, totalReceived)
              const currency = inv.account?.currency || ''

              return (
                <TableRow key={inv.id} className="hover:bg-blue-50 transition-colors duration-150">
                  <TableCell>
                    <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                      {inv.account?.name || '—'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-xs font-medium">
                      {inv.category || '—'}
                    </span>
                  </TableCell>
                  <TableCell className="font-semibold text-gray-900">
                    {inv.name}
                  </TableCell>
                  <TableCell className="font-semibold text-gray-700">
                    {formatCurrency(totalInvestment, currency)}
                  </TableCell>
                  <TableCell className="font-semibold text-blue-600">
                    {formatPercent(apr)}
                  </TableCell>
                  <TableCell className="font-semibold text-blue-600">
                    {formatPercent(aprAfterFees)}
                  </TableCell>
                  <TableCell className="font-semibold text-gray-700">
                    {periodMonths === null ? '—' : periodMonths.toFixed(1)}
                  </TableCell>
                  <TableCell className="font-semibold text-gray-700">
                    {formatDate(inv.maturityDate)}
                  </TableCell>
                  <TableCell className="font-semibold text-gray-700">
                    {daysRemaining === null ? '—' : daysRemaining}
                  </TableCell>
                  <TableCell className="font-semibold text-gray-700">
                    {formatCurrency(fees, currency)}
                  </TableCell>
                  <TableCell className="font-semibold text-gray-700">
                    {formatCurrency(netProfit, currency)}
                  </TableCell>
                  <TableCell className="font-semibold text-gray-700">
                    {formatCurrency(totalReceived, currency)}
                  </TableCell>
                  <TableCell className="font-semibold text-gray-700">
                    {formatCurrency(receivable, currency)}
                  </TableCell>
                  <TableCell>
                    <span className={`px-3 py-1.5 inline-flex items-center text-xs leading-5 font-semibold rounded-full shadow-sm ${status.className}`}>
                      <span className="w-2 h-2 bg-current rounded-full mr-2 opacity-70"></span>
                      {status.label}
                    </span>
                  </TableCell>
                  {userRole === 'OWNER' && (
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleEdit(inv)}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => handleDelete(inv.id)}
                          disabled={deletingId === inv.id}
                        >
                          {deletingId === inv.id ? 'Deleting...' : 'Delete'}
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}

      {/* Create Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Create New Sukuk"
      >
        <SukukForm
          mode="create"
          onSuccess={handleCreateSuccess}
          onCancel={() => setIsCreateModalOpen(false)}
        />
      </Modal>

      {/* Edit Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false)
          setEditingSukuk(null)
        }}
        title="Edit Sukuk"
      >
        {editingSukuk && (
          <SukukForm
            mode="edit"
            initialData={editingSukuk}
            onSuccess={handleEditSuccess}
            onCancel={() => {
              setIsEditModalOpen(false)
              setEditingSukuk(null)
            }}
          />
        )}
      </Modal>
    </>
  )
}
