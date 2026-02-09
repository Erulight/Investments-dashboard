'use client'

import { useEffect, useState } from 'react'
import type { ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'

interface ModulePermissions {
  sukuk?: boolean
  crypto?: boolean
  sip?: boolean
  savings?: boolean
  'business-deals'?: boolean
  zakat?: boolean
  import?: boolean
  settings?: boolean
}

const modules = [
  { id: 'sukuk', label: 'Sukuk', icon: '💎' },
  { id: 'crypto', label: 'Crypto', icon: '₿' },
  { id: 'sip', label: 'SIP', icon: '📈' },
  { id: 'savings', label: 'Savings', icon: '💰' },
  { id: 'business-deals', label: 'Business Deals', icon: '🤝' },
  { id: 'zakat', label: 'Zakat', icon: '🧾' },
  { id: 'import', label: 'Import', icon: '📥' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
]

interface User {
  id: string
  email: string
  name: string
  role: string
  permissions: any
  createdAt: string
}

export function UserList() {
  const router = useRouter()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [editingUserId, setEditingUserId] = useState<string | null>(null)
  const [editLoading, setEditLoading] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [deleteLoadingUserId, setDeleteLoadingUserId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'PARTNER' as 'OWNER' | 'PARTNER' | 'VIEWER',
  })
  const [editPermissions, setEditPermissions] = useState<ModulePermissions>({
    sukuk: false,
    crypto: false,
    sip: false,
    savings: false,
    'business-deals': false,
    zakat: false,
    import: false,
    settings: false,
  })

  useEffect(() => {
    fetchUsers()
  }, [])

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/users')
      const data = await response.json()
      setUsers(data.users || [])
    } catch (error) {
      console.error('Failed to fetch users:', error)
    } finally {
      setLoading(false)
    }
  }

  const startEdit = (user: User) => {
    setEditError(null)
    setEditingUserId(user.id)
    setEditForm({
      name: user.name || '',
      email: user.email || '',
      password: '',
      role: (user.role as any) || 'PARTNER',
    })

    const basePermissions: ModulePermissions = {
      sukuk: false,
      crypto: false,
      sip: false,
      savings: false,
      'business-deals': false,
      zakat: false,
      import: false,
      settings: false,
    }

    if (user.permissions && typeof user.permissions === 'object') {
      setEditPermissions({
        ...basePermissions,
        ...(user.permissions as any),
      })
    } else {
      setEditPermissions(basePermissions)
    }
  }

  const cancelEdit = () => {
    setEditError(null)
    setEditingUserId(null)
    setEditLoading(false)
  }

  const deleteUser = async (user: User) => {
    if (deleteLoadingUserId) return

    setDeleteError(null)

    const ok = window.confirm(`Delete user "${user.name}"? This cannot be undone.`)
    if (!ok) return

    setDeleteLoadingUserId(user.id)

    try {
      const response = await fetch(`/api/users/${user.id}`, {
        method: 'DELETE',
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete user')
      }

      if (editingUserId === user.id) {
        cancelEdit()
      }

      await fetchUsers()
      router.refresh()
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete user')
    } finally {
      setDeleteLoadingUserId(null)
    }
  }

  const toggleEditPermission = (module: keyof ModulePermissions) => {
    setEditPermissions((prev: ModulePermissions) => ({
      ...prev,
      [module]: !prev[module],
    }))
  }

  const saveEdit = async (userId: string) => {
    setEditLoading(true)
    setEditError(null)

    try {
      const payload: any = {
        name: editForm.name,
        email: editForm.email,
        role: editForm.role,
        permissions: editPermissions,
      }

      if (editForm.password.trim().length > 0) {
        payload.password = editForm.password
      }

      const response = await fetch(`/api/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update user')
      }

      setEditingUserId(null)
      await fetchUsers()
      router.refresh()
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to update user')
    } finally {
      setEditLoading(false)
    }
  }

  const getPermissionBadges = (permissions: any) => {
    if (!permissions) return null
    
    const activePermissions = Object.entries(permissions)
      .filter(([_, value]) => value === true)
      .map(([key]) => key)
    
    if (activePermissions.length === 0) {
      return <span className="text-xs text-gray-400">No permissions</span>
    }
    
    return (
      <div className="flex flex-wrap gap-1">
        {activePermissions.map((perm) => (
          <span
            key={perm}
            className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded"
          >
            {perm}
          </span>
        ))}
      </div>
    )
  }

  if (loading) {
    return <div className="text-center py-8 text-gray-500">Loading users...</div>
  }

  if (users.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No users found. Create your first user above.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {deleteError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {deleteError}
        </div>
      )}
      {users.map((user: User) => (
        <div
          key={user.id}
          className="p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <div className="flex items-center space-x-3 mb-2">
                <h3 className="font-semibold text-gray-900">{user.name}</h3>
                <span className="px-3 py-1 text-xs font-semibold rounded-full bg-indigo-100 text-indigo-800">
                  {user.role}
                </span>
              </div>
              <p className="text-sm text-gray-600 mb-2">{user.email}</p>
              <div className="mt-2">
                <p className="text-xs text-gray-500 mb-1">Permissions:</p>
                {user.role === 'OWNER' ? (
                  <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded">
                    All Modules (Owner)
                  </span>
                ) : (
                  getPermissionBadges(user.permissions)
                )}
              </div>
            </div>
            <div className="flex flex-col items-end space-y-2">
              <div className="text-xs text-gray-400">
                {new Date(user.createdAt).toLocaleDateString()}
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => (editingUserId === user.id ? cancelEdit() : startEdit(user))}
                  disabled={deleteLoadingUserId === user.id}
                >
                  {editingUserId === user.id ? 'Cancel' : 'Edit'}
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  onClick={() => deleteUser(user)}
                  disabled={deleteLoadingUserId === user.id}
                >
                  {deleteLoadingUserId === user.id ? 'Deleting...' : 'Delete'}
                </Button>
              </div>
            </div>
          </div>

          {editingUserId === user.id && (
            <div className="mt-4 p-4 bg-white rounded-lg border border-gray-200">
              {editError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                  {editError}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Name
                  </label>
                  <input
                    type="text"
                    required
                    value={editForm.name}
                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                      setEditForm({ ...editForm, name: e.target.value })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    required
                    value={editForm.email}
                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                      setEditForm({ ...editForm, email: e.target.value })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    New Password (optional)
                  </label>
                  <input
                    type="password"
                    minLength={8}
                    value={editForm.password}
                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                      setEditForm({ ...editForm, password: e.target.value })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Leave blank to keep current"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Role
                  </label>
                  <select
                    value={editForm.role}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                      setEditForm({ ...editForm, role: e.target.value as any })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="PARTNER">Partner</option>
                    <option value="VIEWER">Viewer</option>
                    <option value="OWNER">Owner</option>
                  </select>
                </div>
              </div>

              {editForm.role !== 'OWNER' && (
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Module Permissions
                  </label>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {modules.map((module) => (
                      <label
                        key={module.id}
                        className="flex items-center space-x-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={editPermissions[module.id as keyof ModulePermissions] || false}
                          onChange={() =>
                            toggleEditPermission(module.id as keyof ModulePermissions)
                          }
                          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <span className="flex items-center space-x-2 text-sm font-medium text-gray-700">
                          <span>{module.icon}</span>
                          <span>{module.label}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-4 flex justify-end space-x-2">
                <Button type="button" variant="secondary" onClick={cancelEdit} disabled={editLoading}>
                  Cancel
                </Button>
                <Button type="button" onClick={() => saveEdit(user.id)} disabled={editLoading}>
                  {editLoading ? 'Saving...' : 'Save'}
                </Button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
