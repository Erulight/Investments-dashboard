'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MonkeyMascot } from './MonkeyMascot'

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

type PermissionMap = Record<string, boolean>

const navigation: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: '📊' },
  { name: 'Cash Ledger', href: '/cash-ledger', roles: ['OWNER', 'PARTNER'], icon: '💵' },
  { name: 'Personal Ledger', href: '/personal-ledger', roles: ['OWNER'], icon: '📒' },
  { name: 'Debts', href: '/debts', roles: ['OWNER'], icon: '💳' },
  {
    name: 'Zakat',
    href: '/zakat',
    module: 'zakat',
    icon: '🕌',
    children: [
      { name: 'Dashboard', href: '/zakat', module: 'zakat', icon: '🕌' },
      { name: 'Audit', href: '/zakat/audit', module: 'zakat', icon: '📋' },
    ],
  },
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
  { 
    name: 'Settings', 
    href: '/settings', 
    icon: '⚙️',
    children: [
      { name: 'Users', href: '/users', roles: ['OWNER'], icon: '👥' },
      { name: 'Import', href: '/import', module: 'import', icon: '📥' },
      { name: 'General', href: '/settings', module: 'settings', icon: '⚙️' },
    ]
  },
]

const parsePermissionMap = (permissionsRaw?: string | null): PermissionMap => {
  if (!permissionsRaw) return {}
  try {
    const parsed = JSON.parse(permissionsRaw)
    if (!parsed || typeof parsed !== 'object') return {}
    return Object.entries(parsed).reduce((acc, [key, value]) => {
      if (typeof value === 'boolean') {
        acc[key] = value
      }
      return acc
    }, {} as PermissionMap)
  } catch {
    return {}
  }
}

function hasAccess(user: UserMini, item: NavChild, permissionMap: PermissionMap) {
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
  return permissionMap[item.module] === true
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
  const [hoveredNotificationType, setHoveredNotificationType] = useState<string | null>(null)
  const notifPanelRef = useRef<HTMLDivElement>(null)
  const [panelHeight, setPanelHeight] = useState(0)
  const [zakatHealth, setZakatHealth] = useState<'OK' | 'WARNINGS' | null>(null)

  const permissionMap = useMemo(() => parsePermissionMap(user.permissions), [user.permissions])

  useEffect(() => {
    if (typeof document === 'undefined') return
    setIsDark(document.documentElement.classList.contains('dark'))
  }, [])

  useEffect(() => {
    if (user.role !== 'OWNER') return
    fetch('/api/admin/zakat-health')
      .then((r) => r.json().catch(() => ({})))
      .then((d) => { if (d.status) setZakatHealth(d.status) })
      .catch(() => {})
  }, [user.role])

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
    .filter((item) => hasAccess(user, item, permissionMap))
    .map((item): NavItem | null => {
      if (item.children) {
        const filteredChildren = item.children
          .filter((child) => hasAccess(user, child, permissionMap))
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
      window.location.reload()
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
    <motion.nav 
      className="sticky top-0 z-[9999] pointer-events-auto shadow-xl border-b border-cyan-500/20 bg-gradient-to-r from-slate-900/95 to-slate-800/95 backdrop-blur-xl"
      initial={{ y: -40 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
    >
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          {/* Left: Logo + App name */}
          <div className="flex items-center space-x-3 lg:space-x-6">
            <motion.button
              type="button"
              className="inline-flex items-center justify-center rounded-md p-1.5 text-slate-200 hover:bg-cyan-500/20 focus:outline-none focus:ring-2 focus:ring-cyan-500 md:hidden"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
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
            </motion.button>

            <div className="flex-shrink-0 flex items-center">
              <div className="flex items-center space-x-2.5">
                <div className="flex items-center gap-2">
                  <img src="/legacy-loop-logo.png" alt="Legacy Loop" className="h-8 w-8" />
                  <div>
                    <div className="font-bold text-sm text-white">Legacy Loop</div>
                    <div className="text-xs text-cyan-400">Smart Investment Platform</div>
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
                      <motion.button
                        className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-150 border ${
                          isActiveLink(item.href, item.children)
                            ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white border-cyan-400 shadow-lg shadow-cyan-500/50'
                            : 'bg-transparent border-transparent text-slate-300 hover:bg-cyan-500/20 hover:text-white'
                        }`}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        <span className="mr-1.5 text-sm">{item.icon}</span>
                        {item.name}
                        {item.name === 'Zakat' && zakatHealth !== null && (
                          <span
                            className={`ml-1.5 inline-block w-2 h-2 rounded-full flex-shrink-0 ${zakatHealth === 'OK' ? 'bg-emerald-400' : 'bg-red-500'}`}
                            style={{ boxShadow: zakatHealth === 'OK' ? '0 0 4px rgba(52,211,153,0.8)' : '0 0 4px rgba(239,68,68,0.8)' }}
                            title={zakatHealth === 'OK' ? 'Zakat health: OK' : 'Zakat warnings detected'}
                          />
                        )}
                        <svg className="ml-1 w-3 h-3 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </motion.button>
                      {openDropdown === item.name && (
                        <motion.div 
                          className="absolute left-0 mt-1 w-56 rounded-lg shadow-xl bg-slate-800/95 backdrop-blur-xl ring-1 ring-cyan-500/30 overflow-hidden z-[10000]"
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.2 }}
                        >
                          <div className="py-1">
                            {item.children.map((child) => (
                              <a
                                key={child.name}
                                href={child.href}
                                className={`flex items-center px-3 py-2.5 text-xs font-medium transition-colors duration-100 ${
                                  pathname === child.href || pathname?.startsWith(child.href + '/')
                                    ? 'bg-cyan-500/20 text-white'
                                    : 'text-slate-300 hover:bg-cyan-500/10 hover:text-white'
                                }`}
                              >
                                <span className="mr-2.5 text-sm">{child.icon}</span>
                                {child.name}
                              </a>
                            ))}
                          </div>
                        </motion.div>
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
              {/* Monkey mascot */}
              <MonkeyMascot isOpen={notificationsOpen} hoveredType={hoveredNotificationType} panelHeight={panelHeight} />
              
              <motion.button
                type="button"
                className="relative w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-cyan-500/20 to-purple-500/20 border border-cyan-500/30 hover:border-cyan-400/60 transition-all duration-300 group"
                aria-label="Notifications"
                onClick={() => setNotificationsOpen((prev) => !prev)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <svg className="w-5 h-5 text-cyan-400 group-hover:text-cyan-300 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {unreadCount > 0 && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-gradient-to-r from-red-500 to-pink-500 text-[10px] font-bold text-white flex items-center justify-center shadow-lg shadow-red-500/50"
                  >
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </motion.span>
                )}
                <div className="absolute inset-0 rounded-xl bg-cyan-400/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </motion.button>
              <AnimatePresence>
              {notificationsOpen && unreadCount > 0 && (
                <motion.div
                  ref={notifPanelRef}
                  initial={{ opacity: 0, y: -20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -20, scale: 0.95 }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                  onAnimationComplete={() => {
                    if (notifPanelRef.current) {
                      setPanelHeight(notifPanelRef.current.offsetHeight)
                    }
                  }}
                  className="absolute right-0 mt-3 w-96 max-w-md rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border-2 border-cyan-500/30 shadow-2xl shadow-cyan-500/20 z-[10000] overflow-hidden"
                >
                  {/* Glow effects */}
                  <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 via-transparent to-purple-500/5 pointer-events-none" />
                  <div className="absolute -top-24 -right-24 w-48 h-48 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
                  <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
                  {/* Header */}
                  <div className="relative px-4 py-3 border-b border-cyan-500/20 bg-gradient-to-r from-slate-800/50 to-slate-900/50 backdrop-blur-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shadow-lg shadow-cyan-400/50" />
                        <span className="text-sm font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
                          Notifications
                        </span>
                      </div>
                      <span className="text-xs font-semibold text-cyan-400/80 px-2 py-1 rounded-full bg-cyan-400/10 border border-cyan-400/20">
                        {unreadCount} pending
                      </span>
                    </div>
                  </div>
                  <motion.div 
                    className="max-h-80 overflow-y-auto py-1"
                    initial={{ maxHeight: 0 }}
                    animate={{ maxHeight: 320 }}
                    exit={{ maxHeight: 0 }}
                    transition={{ duration: 0.4, delay: 0.1 }}
                  >
                    {sortedNotifications.map((n, idx) => {
                      const notifType = n.message.toLowerCase().includes('commission') ? 'commission' 
                        : n.message.toLowerCase().includes('maturity') || n.message.toLowerCase().includes('mature') ? 'maturity'
                        : n.message.toLowerCase().includes('zakat') ? 'zakat'
                        : n.message.toLowerCase().includes('partner') ? 'partner'
                        : 'default'
                      
                      return (
                      <motion.div 
                        key={n.key} 
                        className="relative px-4 py-3 border-b border-cyan-500/10 last:border-b-0 hover:bg-gradient-to-r hover:from-cyan-500/10 hover:to-purple-500/10 transition-all duration-300 cursor-pointer group"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.08 }}
                        onMouseEnter={() => setHoveredNotificationType(notifType)}
                        onMouseLeave={() => setHoveredNotificationType(null)}
                      >
                        {/* Notification type icon */}
                        <div className="absolute left-4 top-3 w-1 h-full bg-gradient-to-b from-cyan-400 to-purple-400 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
                        
                        <div className="text-sm font-medium text-slate-100 mb-1.5 group-hover:text-cyan-300 transition-colors">
                          {n.message}
                        </div>
                        {n.amounts && (n.amounts.profit || n.amounts.commission) && (
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            {n.amounts.profit && (
                              <span className="text-xs font-semibold text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded-lg border border-emerald-400/20">
                                💰 {n.amounts.profit.toLocaleString(undefined, { maximumFractionDigits: 2 })} SAR
                              </span>
                            )}
                            {n.amounts.commission && (
                              <span className="text-xs font-semibold text-amber-400 bg-amber-400/10 px-2 py-1 rounded-lg border border-amber-400/20">
                                💵 {n.amounts.commission.toLocaleString(undefined, { maximumFractionDigits: 2 })} SAR
                              </span>
                            )}
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <motion.button
                            type="button"
                            onClick={() => {
                              setNotificationsOpen(false)
                              const from = encodeURIComponent(pathname || '/')
                              const receive = encodeURIComponent(n.investmentId)
                              if (typeof window !== 'undefined') {
                                window.location.href = `/sukuk?receive=${receive}&from=${from}`
                              }
                            }}
                            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50 transition-all"
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                            </svg>
                            Receive
                          </motion.button>
                          <motion.button
                            type="button"
                            onClick={() => handleDismissNotification(n.investmentId)}
                            disabled={dismissLoading === n.investmentId}
                            className="inline-flex items-center justify-center rounded-xl border border-slate-600/50 bg-slate-800/50 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700/50 hover:border-slate-500/50 disabled:opacity-40 transition-all"
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                          >
                            {dismissLoading === n.investmentId ? '...' : '✕'}
                          </motion.button>
                        </div>
                      </motion.div>
                    )})}

                  </motion.div>
                  {notifError && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="px-4 py-2.5 text-xs font-medium text-red-400 bg-red-500/10 border-t border-red-500/20"
                    >
                      ⚠️ {notifError}
                    </motion.div>
                  )}
                </motion.div>
              )}
              </AnimatePresence>
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
    </motion.nav>
  )
}
