'use client'

import { useState } from 'react'
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

export function CreateUserForm() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'PARTNER' as 'OWNER' | 'PARTNER' | 'VIEWER',
  })
  
  const [permissions, setPermissions] = useState<ModulePermissions>({
    sukuk: false,
    crypto: false,
    sip: false,
    savings: false,
    'business-deals': false,
    zakat: false,
    import: false,
    settings: false,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          permissions,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create user')
      }

      setSuccess('User created successfully!')
      
      // Reset form
      setFormData({
        name: '',
        email: '',
        password: '',
        role: 'PARTNER',
      })
      setPermissions({
        sukuk: false,
        crypto: false,
        sip: false,
        savings: false,
        'business-deals': false,
        zakat: false,
        import: false,
        settings: false,
      })
      
      // Refresh the page to show new user
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user')
    } finally {
      setLoading(false)
    }
  }

  const togglePermission = (module: keyof ModulePermissions) => {
    setPermissions(prev => ({
      ...prev,
      [module]: !prev[module],
    }))
  }

  const selectAllPermissions = () => {
    const allSelected = Object.values(permissions).every(v => v === true)
    const newValue = !allSelected
    
    setPermissions({
      sukuk: newValue,
      crypto: newValue,
      sip: newValue,
      savings: newValue,
      'business-deals': newValue,
      zakat: newValue,
      import: newValue,
      settings: newValue,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}
      
      {success && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-green-700">
          {success}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Name
          </label>
          <input
            type="text"
            required
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="John Doe"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Email
          </label>
          <input
            type="email"
            required
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="user@example.com"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Password
          </label>
          <input
            type="password"
            required
            minLength={8}
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Minimum 8 characters"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Role
          </label>
          <select
            value={formData.role}
            onChange={(e) => setFormData({ ...formData, role: e.target.value as any })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="PARTNER">Partner</option>
            <option value="VIEWER">Viewer</option>
            <option value="OWNER">Owner</option>
          </select>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <label className="block text-sm font-medium text-gray-700">
            Module Permissions
          </label>
          <button
            type="button"
            onClick={selectAllPermissions}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            {Object.values(permissions).every(v => v === true) ? 'Deselect All' : 'Select All'}
          </button>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {modules.map((module) => (
            <label
              key={module.id}
              className="flex items-center space-x-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
            >
              <input
                type="checkbox"
                checked={permissions[module.id as keyof ModulePermissions] || false}
                onChange={() => togglePermission(module.id as keyof ModulePermissions)}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="flex items-center space-x-2 text-sm font-medium text-gray-700">
                <span>{module.icon}</span>
                <span>{module.label}</span>
              </span>
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-gray-500">
          Select which modules this user can access. OWNER role will have access to all modules regardless of selections.
        </p>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={loading}>
          {loading ? 'Creating...' : 'Create User'}
        </Button>
      </div>
    </form>
  )
}
