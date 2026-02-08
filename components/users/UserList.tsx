'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

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
      {users.map((user) => (
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
            <div className="text-xs text-gray-400">
              {new Date(user.createdAt).toLocaleDateString()}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
