import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { requireAuth } from '@/lib/rbac'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { SukukPlatformManager } from '@/components/settings/SukukPlatformManager'
import { PortfolioReset } from '@/components/settings/PortfolioReset'
import { InvestmentTypeManager } from '@/components/settings/InvestmentTypeManager'
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
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-xl shadow-md p-6 text-white">
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-slate-400 mt-1">Manage system configuration and user permissions</p>
      </div>

      <InvestmentTypeManager />

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-bold text-gray-800">Recovery Assumptions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {recoveryAssumptions.map((assumption) => (
              <div key={assumption.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                <div>
                  <h4 className="text-sm font-medium text-gray-900">{assumption.status}</h4>
                  <p className="text-xs text-gray-500">{assumption.description}</p>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-gray-900">
                    {(assumption.recoveryRate * 100).toFixed(0)}%
                  </div>
                  <div className="text-[11px] text-gray-400">Recovery Rate</div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <SukukPlatformManager />

      <PortfolioReset />

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-bold text-gray-800">Users</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {users.map((u) => (
              <div key={u.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                <div>
                  <div className="text-sm font-medium text-gray-900">{u.name}</div>
                  <div className="text-xs text-gray-500">{u.email}</div>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="px-2 py-0.5 text-[11px] font-semibold rounded bg-slate-100 text-slate-700">
                    {u.role}
                  </span>
                  {u.role === 'PARTNER' && u.canEditAsPartner && (
                    <span className="px-2 py-0.5 text-[11px] font-medium bg-emerald-50 text-emerald-700 rounded">
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
