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
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">All Sukuk Deals</h2>
          <p className="text-sm text-gray-500 mt-1">{sukuk.length} active investments</p>
        </div>
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
              <TableHead>Deal Name</TableHead>
              <TableHead>Account Type</TableHead>
              <TableHead>Principal</TableHead>
              <TableHead>Current Value</TableHead>
              <TableHead>Profit/Loss</TableHead>
              <TableHead>Return %</TableHead>
              <TableHead>Status</TableHead>
              {userRole === 'OWNER' && <TableHead>Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sukuk.map((inv: any) => {
              const principal = inv.myParticipation?.investedAmount || inv.principalAmount
              const current = inv.myParticipation?.currentValue || inv.currentValue
              const profit = inv.myParticipation?.profit || (inv.realizedProfit + inv.unrealizedProfit)
              const returnPct = principal > 0 ? ((current - principal) / principal * 100) : 0

              return (
                <TableRow key={inv.id} className="hover:bg-blue-50 transition-colors duration-150">
                  <TableCell className="font-semibold text-gray-900">
                    <div className="flex items-center space-x-2">
                      <span className="text-xl">📄</span>
                      <span>{inv.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                      {inv.account?.name}
                    </span>
                  </TableCell>
                  <TableCell className="font-semibold text-gray-700">
                    {inv.account?.currency} {principal.toLocaleString()}
                  </TableCell>
                  <TableCell className="font-semibold text-blue-600">
                    {inv.account?.currency} {current.toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <div className={`flex items-center space-x-1 font-bold ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      <span>{profit >= 0 ? '↑' : '↓'}</span>
                      <span>{inv.account?.currency} {Math.abs(profit).toLocaleString()}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className={`flex items-center space-x-1 font-bold ${returnPct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      <span>{returnPct >= 0 ? '↑' : '↓'}</span>
                      <span>{Math.abs(returnPct).toFixed(2)}%</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="px-3 py-1.5 inline-flex items-center text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800 shadow-sm">
                      <span className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></span>
                      Active
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
