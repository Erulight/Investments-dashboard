'use client'

import { useEffect, useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/sukuk/SukukModal'

interface InvestmentType {
  type: string
  investmentCount: number
}

export function InvestmentTypeManager() {
  const [types, setTypes] = useState<InvestmentType[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [newType, setNewType] = useState('')

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<InvestmentType | null>(null)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [deleteLoading, setDeleteLoading] = useState(false)

  const loadTypes = async () => {
    try {
      const res = await fetch('/api/investment-types')
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to load types')
      setTypes(Array.isArray(data.types) ? data.types : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load types')
    }
  }

  useEffect(() => {
    loadTypes()
  }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newType.trim()) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/investment-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: newType.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to create type')
      setNewType('')
      await loadTypes()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create type')
    } finally {
      setLoading(false)
    }
  }

  const openDelete = (t: InvestmentType) => {
    setDeleteTarget(t)
    setDeleteConfirmText('')
    setDeletePassword('')
    setDeleteError('')
  }

  const closeDelete = () => {
    setDeleteTarget(null)
    setDeleteConfirmText('')
    setDeletePassword('')
    setDeleteError('')
  }

  const confirmDelete = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!deleteTarget) return
    setDeleteLoading(true)
    setDeleteError('')
    try {
      const res = await fetch('/api/investment-types', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: deleteTarget.type,
          confirmText: deleteConfirmText,
          password: deletePassword,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to delete type')
      await loadTypes()
      closeDelete()
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete type')
    } finally {
      setDeleteLoading(false)
    }
  }

  const hasInvestments = deleteTarget && deleteTarget.investmentCount > 0

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-bold text-gray-800">Investment Types</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Create form */}
        <form onSubmit={handleCreate} className="flex items-end gap-3">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-500 mb-1">New Type Name</label>
            <input
              type="text"
              required
              value={newType}
              onChange={(e) => setNewType(e.target.value.toUpperCase())}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 outline-none"
              placeholder="e.g., REAL_ESTATE"
            />
          </div>
          <Button type="submit" variant="primary" disabled={loading}>
            {loading ? 'Adding...' : 'Add Type'}
          </Button>
        </form>

        {error && <p className="text-xs text-red-600">{error}</p>}

        {/* Types list */}
        <div className="space-y-2">
          {types.length === 0 && (
            <p className="text-xs text-gray-400 py-2">No investment types found.</p>
          )}
          {types.map((t) => (
            <div
              key={t.type}
              className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
            >
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-gray-900">{t.type}</span>
                <span className="text-[11px] text-gray-400 tabular-nums">
                  {t.investmentCount} investment{t.investmentCount !== 1 ? 's' : ''}
                </span>
              </div>
              <Button
                size="sm"
                variant="danger"
                onClick={() => openDelete(t)}
              >
                Delete
              </Button>
            </div>
          ))}
        </div>
      </CardContent>

      {/* Delete modal */}
      <Modal
        isOpen={Boolean(deleteTarget)}
        onClose={closeDelete}
        title={`Delete Investment Type: ${deleteTarget?.type ?? ''}`}
      >
        <form onSubmit={confirmDelete} className="space-y-4">
          {hasInvestments ? (
            <>
              <div className="rounded-lg bg-red-50 border border-red-200 p-3">
                <div className="flex items-start gap-2">
                  <span className="text-red-500 text-lg leading-none mt-0.5">⚠</span>
                  <div>
                    <p className="text-sm font-semibold text-red-800">Warning: Existing Investments</p>
                    <p className="text-xs text-red-700 mt-1">
                      This type has <strong>{deleteTarget?.investmentCount}</strong> recorded
                      investment{deleteTarget?.investmentCount !== 1 ? 's' : ''}. Deleting it will
                      archive all associated accounts. This action cannot be easily undone.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Type <span className="font-bold text-gray-900">DELETE</span> to confirm
                </label>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none"
                  placeholder="DELETE"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Owner Password
                </label>
                <input
                  type="password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none"
                  placeholder="Enter your password"
                />
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-600">
              No investments recorded under <strong>{deleteTarget?.type}</strong>. You can delete
              this type directly.
            </p>
          )}

          {deleteError && <p className="text-xs text-red-600">{deleteError}</p>}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={closeDelete} disabled={deleteLoading}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="danger"
              disabled={deleteLoading || (hasInvestments && deleteConfirmText !== 'DELETE')}
            >
              {deleteLoading ? 'Deleting...' : hasInvestments ? 'Permanently Delete' : 'Delete'}
            </Button>
          </div>
        </form>
      </Modal>
    </Card>
  )
}
