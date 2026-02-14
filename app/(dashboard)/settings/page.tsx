import type { ReactNode } from 'react'
import { requireAuth } from '@/lib/rbac'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { SukukPlatformManager } from '@/components/settings/SukukPlatformManager'
import { PortfolioReset } from '@/components/settings/PortfolioReset'
import { InvestmentTypeManager } from '@/components/settings/InvestmentTypeManager'
import { NisabSettings } from '@/components/settings/NisabSettings'
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
    <div className="space-y-3">
      {sections.map((section) => (
        <details key={section.id} className="border border-slate-200 rounded-lg bg-white">
          <summary className="px-4 py-3 text-left cursor-pointer select-none hover:bg-slate-50">
            <div className="text-sm font-semibold text-slate-900">{section.title}</div>
            {section.description && (
              <div className="text-xs text-slate-500 mt-0.5">{section.description}</div>
            )}
          </summary>
          <div className="px-4 pb-4">
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
      description: 'Zakat thresholds and haul assumptions',
      content: <NisabSettings />,
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
      content: <PortfolioReset />,
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
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-xl shadow-md p-6 text-white">
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-slate-400 mt-1">Manage system configuration and user permissions</p>
      </div>

      <Accordion sections={sections} />
    </div>
  )
}
