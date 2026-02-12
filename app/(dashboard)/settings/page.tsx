import { requireAuth } from '@/lib/rbac'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { SukukPlatformManager } from '@/components/settings/SukukPlatformManager'
import { PortfolioReset } from '@/components/settings/PortfolioReset'
import { InvestmentTypeManager } from '@/components/settings/InvestmentTypeManager'
import { NisabSettings } from '@/components/settings/NisabSettings'
import { UserList } from '@/components/users/UserList'
import { prisma } from '@/lib/db'

export default async function SettingsPage() {
  await requireAuth(['OWNER'])

  const recoveryAssumptions = await prisma.recoveryAssumption.findMany({
    orderBy: { status: 'asc' },
  })

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-xl shadow-md p-6 text-white">
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-slate-400 mt-1">Manage system configuration and user permissions</p>
      </div>

      <InvestmentTypeManager />

      <NisabSettings />

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
          <UserList />
        </CardContent>
      </Card>
    </div>
  )
}
