import Link from 'next/link'
import { requireAuth } from '@/lib/rbac'
import { SukukPlatformManager } from '@/components/settings/SukukPlatformManager'
import { PortfolioReset } from '@/components/settings/PortfolioReset'
import { PartnerReset } from '@/components/settings/PartnerReset'
import { InvestmentTypeManager } from '@/components/settings/InvestmentTypeManager'
import { NisabSettings } from '@/components/settings/NisabSettings'
import { CurrencySettings } from '@/components/settings/CurrencySettings'
import { UserList } from '@/components/users/UserList'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

type NavTab = {
  id: string
  label: string
  icon: string
  description: string
}

const TABS: NavTab[] = [
  { id: 'investments', label: 'Investments',    icon: '📈', description: 'Types & platforms'   },
  { id: 'zakat',       label: 'Zakat & Nisab',  icon: '🕌', description: 'Thresholds & currency' },
  { id: 'recovery',    label: 'Recovery Rates', icon: '📊', description: 'Default recovery rates' },
  { id: 'maintenance', label: 'Maintenance',    icon: '🔧', description: 'Reset & housekeeping'  },
  { id: 'users',       label: 'Users & Access', icon: '👥', description: 'Users & permissions'   },
]

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-5 pb-4 border-b border-slate-200 dark:border-white/10">
      <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">{title}</h2>
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{description}</p>
    </div>
  )
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }> | { tab?: string }
}) {
  await requireAuth(['OWNER'])

  const params = searchParams instanceof Promise ? await searchParams : (searchParams ?? {})
  const activeTab = TABS.some(t => t.id === params?.tab) ? params!.tab! : 'investments'

  const recoveryAssumptions = activeTab === 'recovery'
    ? await prisma.recoveryAssumption.findMany({ orderBy: { status: 'asc' } })
    : []

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Settings</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            System configuration and user access management
          </p>
        </div>
        <span className="text-2xl opacity-60">⚙️</span>
      </div>

      <div className="flex gap-6">
        {/* Sidebar navigation */}
        <aside className="w-52 shrink-0">
          <nav className="space-y-1">
            {TABS.map((tab) => {
              const isActive = tab.id === activeTab
              return (
                <Link
                  key={tab.id}
                  href={`/settings?tab=${tab.id}`}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all ${
                    isActive
                      ? 'bg-slate-900 text-white shadow-sm dark:bg-white dark:text-slate-900'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-200'
                  }`}
                >
                  <span className="text-base leading-none">{tab.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold truncate leading-tight">{tab.label}</div>
                    <div className={`text-[10px] truncate mt-0.5 ${isActive ? 'text-slate-300 dark:text-slate-600' : 'text-slate-400'}`}>
                      {tab.description}
                    </div>
                  </div>
                </Link>
              )
            })}
          </nav>

          {/* Divider + quick links */}
          <div className="mt-6 pt-4 border-t border-slate-200 dark:border-white/10 space-y-1">
            <Link
              href="/settings/restore-points"
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-white/5 transition-colors"
            >
              <span>🔄</span>
              <span className="font-medium">Restore Points</span>
            </Link>
            <Link
              href="/users"
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-white/5 transition-colors"
            >
              <span>👤</span>
              <span className="font-medium">User Management</span>
            </Link>
          </div>
        </aside>

        {/* Main content panel */}
        <div className="flex-1 min-w-0 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900/50">

          {/* ── Investments ── */}
          {activeTab === 'investments' && (
            <div className="space-y-6">
              <SectionHeader
                title="Investment Types"
                description="Configure the categories of investments available in the system"
              />
              <InvestmentTypeManager />

              <div className="border-t border-slate-100 dark:border-white/10 pt-6">
                <SectionHeader
                  title="Sukuk Platforms"
                  description="Manage platform accounts used for Sukuk investments"
                />
                <SukukPlatformManager />
              </div>
            </div>
          )}

          {/* ── Zakat & Nisab ── */}
          {activeTab === 'zakat' && (
            <div className="space-y-6">
              <SectionHeader
                title="Nisab Threshold"
                description="Set the minimum wealth threshold that triggers Zakat obligation"
              />
              <NisabSettings />

              <div className="border-t border-slate-100 dark:border-white/10 pt-6">
                <SectionHeader
                  title="Display Currency"
                  description="Choose the currency used for displaying amounts across the dashboard"
                />
                <CurrencySettings />
              </div>
            </div>
          )}

          {/* ── Recovery Rates ── */}
          {activeTab === 'recovery' && (
            <div>
              <SectionHeader
                title="Recovery Assumptions"
                description="Default recovery rates applied to debts based on their repayment status"
              />
              <div className="rounded-lg border border-slate-200 dark:border-white/10 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-white/5 border-b border-slate-200 dark:border-white/10">
                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Description
                      </th>
                      <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Recovery Rate
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                    {recoveryAssumptions.map((a) => (
                      <tr key={a.id} className="hover:bg-slate-50 dark:hover:bg-white/3 transition-colors">
                        <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-200">
                          {a.status}
                        </td>
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                          {a.description || '—'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${
                            Number(a.recoveryRate) >= 0.8
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
                              : Number(a.recoveryRate) >= 0.5
                              ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400'
                              : 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400'
                          }`}>
                            {(Number(a.recoveryRate) * 100).toFixed(0)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                    {recoveryAssumptions.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-4 py-10 text-center text-sm text-slate-400">
                          No recovery assumptions configured
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Maintenance ── */}
          {activeTab === 'maintenance' && (
            <div className="space-y-6">
              <SectionHeader
                title="Maintenance"
                description="Reset operations and data housekeeping — use with caution"
              />

              <div className="space-y-4">
                <PartnerReset />
                <PortfolioReset />

                <div className="rounded-xl border border-blue-100 bg-blue-50/50 dark:border-blue-500/20 dark:bg-blue-500/5 p-5">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-500/20 text-xl">
                        🔄
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          Restore Points
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          Roll back to a previous state if something went wrong
                        </div>
                      </div>
                    </div>
                    <Link
                      href="/settings/restore-points"
                      className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-white dark:bg-blue-500/10 dark:border-blue-500/30 px-3 py-1.5 text-xs font-semibold text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/20 transition-colors"
                    >
                      Manage →
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Users & Access ── */}
          {activeTab === 'users' && (
            <div>
              <SectionHeader
                title="Users & Access"
                description="Manage user accounts and configure role-based permissions"
              />
              <UserList />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
