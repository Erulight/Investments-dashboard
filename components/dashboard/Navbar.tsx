'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

type Role = 'OWNER' | 'PARTNER'

interface UserMini {
  name: string
  email: string
  role: Role
  permissions?: string | null
}

interface NavChild {
  name: string
  href: string
  icon?: string
  module?: string
  roles?: Role[]
}

interface NavItem extends NavChild {
  children?: NavChild[]
}

const navigation: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: '📊' },
  { name: 'Cash Ledger', href: '/cash-ledger', roles: ['OWNER', 'PARTNER'], icon: '📒' },
  { name: 'Debts', href: '/debts', roles: ['OWNER'], icon: '🧾' },
  { name: 'Zakat', href: '/zakat', module: 'zakat', icon: '🧾' },
  { 
    name: 'Investments', 
    href: '/investments', 
    icon: '💼',
    children: [
      { name: 'Sukuk', href: '/sukuk', module: 'sukuk', icon: '💎' },
      { name: 'Crypto', href: '/crypto', module: 'crypto', icon: '₿' },
      { name: 'Business Deals', href: '/business-deals', module: 'business-deals', icon: '🤝' },
      { name: 'SIP', href: '/sip', module: 'sip', icon: '📈' },
      { name: 'Savings', href: '/savings', module: 'savings', icon: '💰' },
    ]
  },
  { name: 'Import', href: '/import', module: 'import', icon: '📥' },
  { name: 'Users', href: '/users', roles: ['OWNER'], icon: '👥' },
  { name: 'Settings', href: '/settings', module: 'settings', icon: '⚙️' },
]

function hasAccess(user: UserMini, item: NavChild) {
  // Check role-based access
  if (item.roles && !item.roles.includes(user.role)) {
    return false
  }
  
  // OWNER has access to everything
  if (user.role === 'OWNER') {
    return true
  }
  
  // If no module permission is required, allow access
  if (!item.module) {
    return true
  }
  
  // Check module permission
  if (!user.permissions) {
    return false
  }
  
  try {
    const permissions = JSON.parse(user.permissions)
    return permissions[item.module] === true
  } catch {
    return false
  }
}

interface NotificationItem {
  key: string
  investmentId: string
  message: string
  createdAt: string
  amounts?: { profit?: number; commission?: number }
}

interface NavbarProps {
  user: UserMini
  activeAccountTypes: string[]
  notifications: NotificationItem[]
}

export function Navbar({ user, activeAccountTypes, notifications }: NavbarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  const [isDark, setIsDark] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [dismissLoading, setDismissLoading] = useState<string | null>(null)
  const [notifError, setNotifError] = useState('')

  useEffect(() => {
    if (typeof document === 'undefined') return
    setIsDark(document.documentElement.classList.contains('dark'))
  }, [])

  const toggleTheme = () => {
    const nextIsDark = !isDark
    setIsDark(nextIsDark)
    if (typeof document !== 'undefined') {
      if (nextIsDark) document.documentElement.classList.add('dark')
      else document.documentElement.classList.remove('dark')
    }
    try {
      localStorage.setItem('theme', nextIsDark ? 'dark' : 'light')
    } catch {}
  }

  const handleLogout = async () => {
    setLoading(true)
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
      if (typeof window !== 'undefined') {
        window.location.href = '/login'
      }
      router.refresh()
    } catch (error) {
      console.error('Logout failed:', error)
    } finally {
      setLoading(false)
    }
  }

  const normalizeType = (s: unknown) =>
    String(s ?? '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '-')
      .replace(/_/g, '-')

  const activeTypes = new Set((Array.isArray(activeAccountTypes) ? activeAccountTypes : []).map(normalizeType))

  const moduleToAccountType: Record<string, string> = {
    'business-deals': 'BUSINESS-DEALS',
  }

  const isActiveInvestmentType = (item: NavChild) => {
    if (!item.module) return true
    const expected = moduleToAccountType[item.module]
    if (!expected) return true
    if (!Array.isArray(activeAccountTypes)) return true
    const normalizedExpected = normalizeType(expected)
    if (activeTypes.has(normalizedExpected)) return true
    // Backward-compat: allow spaces if existing DB types used spaces
    const spaced = normalizeType(expected.replace(/-/g, ' '))
    return activeTypes.has(spaced)
  }

  const filteredNav: NavItem[] = navigation
    .filter((item) => hasAccess(user, item))
    .map((item): NavItem | null => {
      if (item.children) {
        const filteredChildren = item.children
          .filter((child) => hasAccess(user, child))
          .filter((child) => isActiveInvestmentType(child))

        if (filteredChildren.length === 0) {
          return null
        }

        return { ...item, children: filteredChildren }
      }
      return item
    })
    .filter((x): x is NavItem => Boolean(x))

  const isActiveLink = (href: string, children?: NavChild[]) => {
    if (pathname === href) return true
    if (pathname?.startsWith(href + '/')) return true
    if (children) {
      return children.some((child) => pathname === child.href || pathname?.startsWith(child.href + '/'))
    }
    return false
  }

  const sortedNotifications = useMemo(() => {
    if (!Array.isArray(notifications)) return []
    return [...notifications].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [notifications])

  const unreadCount = sortedNotifications.length

  const handleDismissNotification = async (investmentId: string) => {
    if (dismissLoading) return
    setDismissLoading(investmentId)
    setNotifError('')
    try {
      const res = await fetch('/api/notifications/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ investmentId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || 'Failed to dismiss')
      }
      router.refresh()
    } catch (error) {
      setNotifError(error instanceof Error ? error.message : 'Failed to dismiss')
    } finally {
      setDismissLoading(null)
    }
  }

  const roleLabel = user.role === 'OWNER' ? 'Owner' : 'Partner'
  const roleBadgeClass =
    user.role === 'OWNER'
      ? 'bg-slate-900 text-white border border-slate-700'
      : 'bg-emerald-500/15 text-emerald-300 border border-emerald-400/40'

  return (
    <nav className="sticky top-0 z-[9999] pointer-events-auto shadow-md border-b border-slate-200/70 dark:border-slate-800/70 bg-white/95 dark:bg-slate-900/95 backdrop-blur">
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          {/* Left: Logo + App name */}
          <div className="flex items-center space-x-3 lg:space-x-6">
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-md p-1.5 text-slate-700 dark:text-slate-200 hover:bg-slate-900/5 dark:hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-slate-500 md:hidden"
              aria-label="Toggle navigation menu"
              onClick={() => setMobileOpen((prev) => !prev)}
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth="2">
                {mobileOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>

            <div className="flex-shrink-0 flex items-center">
              <div className="flex items-center space-x-2.5">
                <div className="flex items-center gap-2">
                  <img src="/legacy-loop-logo.png" alt="Legacy Loop" className="h-8 w-8" />
                  <div>
                    <div className="font-bold text-sm text-slate-900 dark:text-white">Legacy Loop</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">Smart Investment Platform</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Center: Nav links (desktop) */}
            <div className="hidden md:flex md:space-x-1">
              {filteredNav.map((item) => (
                <div
                  key={item.name}
                  className="relative"
                  onMouseEnter={() => item.children && setOpenDropdown(item.name)}
                  onMouseLeave={() => setOpenDropdown(null)}
                >
                  {item.children ? (
                    <>
                      <button
                        className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-150 border ${
                          isActiveLink(item.href, item.children)
                            ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                            : 'bg-transparent border-transparent text-slate-700 dark:text-slate-300 hover:bg-slate-900/5 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        <span className="mr-1.5 text-sm">{item.icon}</span>
                        {item.name}
                        <svg className="ml-1 w-3 h-3 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      {openDropdown === item.name && (
                        <div className="absolute left-0 mt-1 w-56 rounded-lg shadow-xl bg-white dark:bg-slate-900 ring-1 ring-black/10 dark:ring-white/10 overflow-hidden z-[10000]">
                          <div className="py-1">
                            {item.children.map((child) => (
                              <a
                                key={child.name}
                                href={child.href}
                                className={`flex items-center px-3 py-2.5 text-xs font-medium transition-colors duration-100 ${
                                  pathname === child.href || pathname?.startsWith(child.href + '/')
                                    ? 'bg-slate-900/5 dark:bg-white/10 text-slate-900 dark:text-white'
                                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-900/5 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white'
                                }`}
                              >
                                <span className="mr-2.5 text-sm">{child.icon}</span>
                                {child.name}
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <a
                      href={item.href}
                      className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-150 border-b-2 ${
                        isActiveLink(item.href)
                          ? 'border-slate-900 dark:border-white text-slate-900 dark:text-white'
                          : 'border-transparent text-slate-700 dark:text-slate-300 hover:border-slate-400/60 dark:hover:border-white/40 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <span className="mr-1.5 text-sm">{item.icon}</span>
                      {item.name}
                    </a>
                  )}
                </div>
              ))}
            </div>

            </div>

            {/* Right: User info, notifications, theme, logout */}
          <div className="flex items-center space-x-2 sm:space-x-3">
            {/* Notification bell */}
            <div className="relative">
              <button
                type="button"
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs bg-slate-900/5 dark:bg-white/10 text-slate-700 dark:text-slate-200 hover:bg-slate-900/10 dark:hover:bg-white/15 transition-colors relative"
                aria-label="Notifications"
                onClick={() => setNotificationsOpen((prev) => !prev)}
              >
                <span className="text-sm">🔔</span>
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-600 text-[10px] font-bold text-white flex items-center justify-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
              {notificationsOpen && unreadCount > 0 && (
                <div className="absolute right-0 mt-2 w-80 max-w-xs sm:max-w-sm rounded-lg bg-white dark:bg-slate-900 shadow-xl ring-1 ring-black/10 dark:ring-white/10 z-[10000]">
                  <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                      Notifications
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      {unreadCount} pending
                    </span>
                  </div>
                  <div className="max-h-80 overflow-y-auto py-1">
                    {sortedNotifications.map((n) => (
                      <div key={n.key} className="px-3 py-2.5 border-b border-slate-100 dark:border-slate-800 last:border-b-0">
                        <div className="text-xs text-slate-800 dark:text-slate-100 mb-1">
                          {n.message}
                        </div>
                        {n.amounts && (n.amounts.profit || n.amounts.commission) && (
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                            {n.amounts.profit && (
                              <span>SAR {n.amounts.profit.toLocaleString(undefined, { maximumFractionDigits: 2 })} profit</span>
                            )}
                            {n.amounts.profit && n.amounts.commission && <span> • </span>}
                            {n.amounts.commission && (
                              <span>
                                SAR {n.amounts.commission.toLocaleString(undefined, { maximumFractionDigits: 2 })} commission
                              </span>
                            )}
                          </div>
                        )}
                        <div className="flex items-center justify-between gap-2 mt-1">
                          <button
                            type="button"
                            onClick={() => {
                              setNotificationsOpen(false)
                              const from = encodeURIComponent(pathname || '/')
                              const receive = encodeURIComponent(n.investmentId)
                              if (typeof window !== 'undefined') {
                                window.location.href = `/sukuk?receive=${receive}&from=${from}`
                              }
                            }}
                            className="flex-1 inline-flex items-center justify-center rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-700"
                          >
                            Receive Now
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDismissNotification(n.investmentId)}
                            disabled={dismissLoading === n.investmentId}
                            className="inline-flex items-center justify-center rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60"
                          >
                            {dismissLoading === n.investmentId ? 'Dismissing…' : 'Dismiss'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  {notifError && (
                    <div className="px-3 py-2 text-[11px] text-red-600 bg-red-50 dark:bg-red-950/40 border-t border-red-200/80 dark:border-red-800/60">
                      {notifError}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* User info & role badge */}
            <div className="hidden sm:flex flex-col items-end mr-1">
              <div className="text-xs font-semibold text-slate-900 dark:text-white leading-tight">
                {user.name}
              </div>
              <div className="mt-0.5 flex items-center gap-1.5">
                <span className="hidden md:inline text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-[120px]">
                  {user.email}
                </span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${roleBadgeClass}`}>
                  {roleLabel}
                </span>
              </div>
            </div>

            {/* Theme toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold bg-slate-900/5 dark:bg-white/10 text-slate-900 dark:text-white hover:bg-slate-900/10 dark:hover:bg-white/15 transition-colors"
              aria-label="Toggle theme"
              title={isDark ? 'Switch to light' : 'Switch to dark'}
            >
              {isDark ? '☀️' : '🌙'}
            </button>

            {/* Avatar */}
            <div className="hidden sm:flex w-8 h-8 bg-slate-900/10 dark:bg-white/10 rounded-full items-center justify-center text-slate-900 dark:text-white text-xs font-semibold">
              {user.name.charAt(0).toUpperCase()}
            </div>

            {/* Logout */}
            <button
              onClick={handleLogout}
              disabled={loading}
              className="hidden sm:inline-flex px-3 py-1.5 text-xs font-medium rounded-md text-slate-700 dark:text-slate-300 bg-slate-900/5 dark:bg-white/5 hover:bg-slate-900/10 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white border border-black/10 dark:border-white/10 disabled:opacity-50 transition-all duration-150"
            >
              {loading ? '...' : 'Logout'}
            </button>
          </div>
        </div>

        {/* Mobile nav */}
        {mobileOpen && (
          <div className="md:hidden pb-2 border-t border-slate-200 dark:border-slate-800 mt-1">
            <div className="pt-2 space-y-1">
              {filteredNav.map((item) => (
                <div key={item.name} className="flex flex-col">
                  <a
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium ${
                      isActiveLink(item.href, item.children)
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-700 dark:text-slate-200 hover:bg-slate-900/5 dark:hover:bg-white/10'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-sm">{item.icon}</span>
                      {item.name}
                    </span>
                    {item.children && (
                      <span className="text-[10px] text-slate-500 dark:text-slate-400">{item.children.length}</span>
                    )}
                  </a>
                  {item.children && (
                    <div className="ml-7 mt-1 space-y-0.5">
                      {item.children.map((child) => (
                        <a
                          key={child.name}
                          href={child.href}
                          onClick={() => setMobileOpen(false)}
                          className={`flex items-center px-3 py-1.5 rounded-md text-[11px] font-medium ${
                            isActiveLink(child.href)
                              ? 'bg-slate-900/10 text-slate-900 dark:text-white'
                              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-900/5 dark:hover:bg-white/10'
                          }`}
                        >
                          <span className="mr-2 text-sm">{child.icon}</span>
                          {child.name}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </nav>
  )
}
