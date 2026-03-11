import type { ReactNode } from 'react'
import { requireAuth } from '@/lib/rbac'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { SukukPlatformManager } from '@/components/settings/SukukPlatformManager'
import { PortfolioReset } from '@/components/settings/PortfolioReset'
import { PartnerReset } from '@/components/settings/PartnerReset'
import { InvestmentTypeManager } from '@/components/settings/InvestmentTypeManager'
import { NisabSettings } from '@/components/settings/NisabSettings'
import { CurrencySettings } from '@/components/settings/CurrencySettings'
import { UserList } from '@/components/users/UserList'
import { prisma } from '@/lib/db'

type AccordionSection = {
  id: string
  title: string
  description?: string
  content: ReactNode
}

function Accordion({ sections }: { sections: AccordionSection[] }) {
  return (
    <div className="space-y-4">
      {sections.map((section) => (
        <details key={section.id} className="premium-card border-slate-700/50 overflow-hidden group">
          <summary className="px-6 py-4 text-left cursor-pointer select-none hover:bg-slate-700/30 transition-all">
            <div className="text-sm font-semibold text-slate-100">{section.title}</div>
            {section.description && (
              <div className="text-xs text-slate-400 mt-1">{section.description}</div>
            )}
          </summary>
          <div className="px-6 pb-6 pt-2 border-t border-slate-700/30">
            {section.content}
          </div>
        </details>
      ))}
    </div>
  )
}

export default async function SettingsPage() {
  await requireAuth(['OWNER'])

  const recoveryAssumptions = await prisma.recoveryAssumption.findMany({
    orderBy: { status: 'asc' },
  })

  const sections: AccordionSection[] = [
    {
      id: 'investments',
      title: 'Investments',
      description: 'Investment types and platform configuration',
      content: (
        <div className="space-y-4">
          <InvestmentTypeManager />
          <SukukPlatformManager />
        </div>
      ),
    },
    {
      id: 'zakat',
      title: 'Zakat & Nisab',
      description: 'Zakat thresholds and display currency',
      content: (
        <div className="space-y-4">
          <NisabSettings />
          <CurrencySettings />
        </div>
      ),
    },
    {
      id: 'recovery',
      title: 'Recovery Assumptions',
      description: 'Default recovery rates by status',
      content: (
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
      ),
    },
    {
      id: 'maintenance',
      title: 'Maintenance',
      description: 'Reset and housekeeping actions',
      content: (
        <div className="space-y-4">
          <PartnerReset />
          <PortfolioReset />
          <div className="border border-slate-200 rounded-lg p-4">
            <div className="flex items-center space-x-3">
              <span className="text-2xl">🔄</span>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Restore Points</h3>
                <p className="text-xs text-slate-500">Roll back to a previous state if something went wrong</p>
              </div>
            </div>
            <div className="mt-3">
              <a 
                href="/settings/restore-points"
                className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100"
              >
                Manage Restore Points
              </a>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'users',
      title: 'Users & Access',
      description: 'Manage users and permissions',
      content: <UserList />,
    },
  ]

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-slate-800/80 to-slate-900/80 backdrop-blur-sm rounded-xl shadow-md p-6 text-white border border-slate-700/50">
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-slate-400 mt-1">Manage system configuration and user permissions</p>
      </div>

      <Accordion sections={sections} />
    </div>
  )
}
