import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { requireAuth } from '@/lib/rbac'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { prisma } from '@/lib/db'

export default async function SettingsPage() {
  await requireAuth(['OWNER'])

  const recoveryAssumptions = await prisma.recoveryAssumption.findMany({
    orderBy: { status: 'asc' },
  })

  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      canEditAsPartner: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
        <p className="mt-2 text-gray-600">
          Manage system configuration and user permissions
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recovery Assumptions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {recoveryAssumptions.map((assumption) => (
              <div key={assumption.id} className="flex justify-between items-center p-4 bg-gray-50 rounded-lg">
                <div>
                  <h4 className="font-medium text-gray-900">{assumption.status}</h4>
                  <p className="text-sm text-gray-600">{assumption.description}</p>
                </div>
                <div className="text-right">
                  <div className="text-lg font-semibold text-gray-900">
                    {(assumption.recoveryRate * 100).toFixed(0)}%
                  </div>
                  <div className="text-xs text-gray-500">Recovery Rate</div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Users</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {users.map((u) => (
              <div key={u.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                <div>
                  <div className="font-medium text-gray-900">{u.name}</div>
                  <div className="text-sm text-gray-600">{u.email}</div>
                </div>
                <div className="flex items-center space-x-4">
                  <span className="px-3 py-1 text-xs font-semibold rounded-full bg-indigo-100 text-indigo-800">
                    {u.role}
                  </span>
                  {u.role === 'PARTNER' && u.canEditAsPartner && (
                    <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded">
                      Can Edit
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
