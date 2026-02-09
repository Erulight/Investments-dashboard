'use client'

import { useEffect, useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/sukuk/SukukModal'

interface SukukAccount {
  id: string
  name: string
  currency: string
  description?: string | null
}

export function SukukPlatformManager() {
  const [accounts, setAccounts] = useState<SukukAccount[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({
    name: '',
    currency: '',
    description: '',
  })
  const [deleteTarget, setDeleteTarget] = useState<SukukAccount | null>(null)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [form, setForm] = useState({
    name: '',
    currency: 'SAR',
    description: '',
  })

  const loadAccounts = async () => {
    setError('')
    try {
      const res = await fetch('/api/accounts?type=SUKUK')
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load accounts')
      }
      setAccounts(Array.isArray(data.accounts) ? data.accounts : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load accounts')
    }
  }

  useEffect(() => {
    loadAccounts()
  }, [])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          currency: form.currency,
          description: form.description,
          type: 'SUKUK',
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create account')
      }
      setForm({ name: '', currency: form.currency || 'SAR', description: '' })
      await loadAccounts()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create account')
    } finally {
      setLoading(false)
    }
  }

  const startEdit = (account: SukukAccount) => {
    setEditingId(account.id)
    setEditForm({
      name: account.name,
      currency: account.currency,
      description: account.description || '',
    })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditForm({ name: '', currency: '', description: '' })
  }

  const saveEdit = async () => {
    if (!editingId) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/accounts/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editForm.name,
          currency: editForm.currency,
          description: editForm.description,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update account')
      }
      await loadAccounts()
      cancelEdit()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update account')
    } finally {
      setLoading(false)
    }
  }

  const openDelete = (account: SukukAccount) => {
    setDeleteTarget(account)
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

  const confirmDelete = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!deleteTarget) return
    setDeleteLoading(true)
    setDeleteError('')
    try {
      const res = await fetch(`/api/accounts/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirmText: deleteConfirmText,
          password: deletePassword,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete account')
      }
      await loadAccounts()
      closeDelete()
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete account')
    } finally {
      setDeleteLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-bold text-gray-800">Sukuk Platforms</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-500 mb-1">Platform Name</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 outline-none"
              placeholder="e.g., Sukuk Capital"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Currency</label>
            <input
              type="text"
              required
              value={form.currency}
              onChange={(e) => setForm((prev) => ({ ...prev, currency: e.target.value.toUpperCase() }))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 outline-none"
              placeholder="SAR"
            />
          </div>
          <div className="md:col-span-4">
            <label className="block text-xs font-medium text-gray-500 mb-1">Description (optional)</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 outline-none"
              placeholder="Short description for this platform"
            />
          </div>
          <div className="md:col-span-4 flex items-center gap-3">
            <Button type="submit" variant="primary" disabled={loading}>
              {loading ? 'Adding...' : 'Add Platform'}
            </Button>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
        </form>

        <div className="space-y-3">
          {accounts.length === 0 && (
            <p className="text-sm text-gray-500">No Sukuk platforms yet.</p>
          )}
          {accounts.map((account) => (
            <div
              key={account.id}
              className="flex flex-col gap-1 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3"
            >
              {editingId === account.id ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
                      <input
                        type="text"
                        value={editForm.name}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Currency</label>
                      <input
                        type="text"
                        value={editForm.currency}
                        onChange={(e) =>
                          setEditForm((prev) => ({
                            ...prev,
                            currency: e.target.value.toUpperCase(),
                          }))
                        }
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 outline-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                    <input
                      type="text"
                      value={editForm.description}
                      onChange={(e) =>
                        setEditForm((prev) => ({ ...prev, description: e.target.value }))
                      }
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 outline-none"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="primary" size="sm" onClick={saveEdit} disabled={loading}>
                      {loading ? 'Saving...' : 'Save'}
                    </Button>
                    <Button variant="secondary" size="sm" onClick={cancelEdit} disabled={loading}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-medium text-gray-900">{account.name}</div>
                    <span className="text-xs font-semibold text-gray-600">{account.currency}</span>
                  </div>
                  <div className="text-xs text-gray-500">Account ID: {account.id}</div>
                  {account.description && (
                    <div className="text-sm text-gray-600">{account.description}</div>
                  )}
                  <div className="flex flex-wrap items-center gap-2 pt-2">
                    <Button size="sm" variant="secondary" onClick={() => startEdit(account)}>
                      Edit
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => openDelete(account)}>
                      Delete
                    </Button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </CardContent>
      <Modal
        isOpen={Boolean(deleteTarget)}
        onClose={closeDelete}
        title="Delete Sukuk Platform"
      >
        <form onSubmit={confirmDelete} className="space-y-4">
          <p className="text-sm text-gray-600">
            Deleting a platform will archive it (it won&apos;t appear in lists). Type
            <span className="font-semibold text-gray-900"> DELETE </span>
            or enter your owner password to confirm.
          </p>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Type DELETE</label>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Owner Password</label>
            <input
              type="password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none"
            />
          </div>
          {deleteError && <p className="text-sm text-red-600">{deleteError}</p>}
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="secondary" onClick={closeDelete} disabled={deleteLoading}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" disabled={deleteLoading}>
              {deleteLoading ? 'Deleting...' : 'Confirm Delete'}
            </Button>
          </div>
        </form>
      </Modal>
    </Card>
  )
}
