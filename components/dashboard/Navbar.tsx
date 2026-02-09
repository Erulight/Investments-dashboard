'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'

interface NavItem {
  name: string
  href: string
  roles?: string[]
  module?: string  // Module permission required
  icon?: string
  children?: NavItem[]
}

const navigation: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: '📊' },
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

interface NavbarProps {
  user: {
    name: string
    email: string
    role: string
    permissions?: string | null
  }
}

function hasAccess(user: NavbarProps['user'], item: NavItem): boolean {
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

export function Navbar({ user }: NavbarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)

  const handleLogout = async () => {
    setLoading(true)
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
      router.push('/login')
      router.refresh()
    } catch (error) {
      console.error('Logout failed:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredNav = navigation
    .map(item => {
      if (!hasAccess(user, item)) {
        return null
      }
      
      // Filter children if item has children
      if (item.children) {
        const filteredChildren = item.children.filter(child => hasAccess(user, child))
        
        // Only show parent if it has accessible children
        if (filteredChildren.length === 0) {
          return null
        }
        
        return {
          ...item,
          children: filteredChildren
        }
      }
      
      return item
    })
    .filter(Boolean) as NavItem[]

  const isActiveLink = (href: string, children?: NavItem[]) => {
    if (pathname === href) return true
    if (pathname?.startsWith(href + '/')) return true
    if (children) {
      return children.some(child => pathname === child.href || pathname?.startsWith(child.href + '/'))
    }
    return false
  }

  return (
    <nav className="bg-slate-900 sticky top-0 z-50 shadow-lg">
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-14">
          <div className="flex items-center space-x-6">
            <div className="flex-shrink-0 flex items-center">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center text-white font-bold text-sm">
                  S
                </div>
                <div>
                  <h1 className="text-sm font-bold text-white tracking-wide">
                    Sukuk Portfolio
                  </h1>
                  <p className="text-[10px] text-slate-400 -mt-0.5">Investment Tracker</p>
                </div>
              </div>
            </div>
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
                        className={`inline-flex items-center px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150 ${
                          isActiveLink(item.href, item.children)
                            ? 'bg-white/15 text-white'
                            : 'text-slate-300 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        <span className="mr-1.5 text-sm">{item.icon}</span>
                        {item.name}
                        <svg className="ml-1 w-3 h-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      {openDropdown === item.name && (
                        <div className="absolute left-0 mt-1 w-52 rounded-lg shadow-xl bg-slate-800 ring-1 ring-white/10 overflow-hidden">
                          <div className="py-1">
                            {item.children.map((child) => (
                              <Link
                                key={child.name}
                                href={child.href}
                                className={`flex items-center px-3 py-2.5 text-xs font-medium transition-colors duration-100 ${
                                  pathname === child.href || pathname?.startsWith(child.href + '/')
                                    ? 'bg-white/10 text-white'
                                    : 'text-slate-300 hover:bg-white/5 hover:text-white'
                                }`}
                              >
                                <span className="mr-2.5 text-sm">{child.icon}</span>
                                {child.name}
                              </Link>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <Link
                      href={item.href}
                      className={`inline-flex items-center px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150 ${
                        isActiveLink(item.href)
                          ? 'bg-white/15 text-white'
                          : 'text-slate-300 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      <span className="mr-1.5 text-sm">{item.icon}</span>
                      {item.name}
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <div className="hidden sm:block text-right">
              <div className="text-xs font-semibold text-white">{user.name}</div>
              <div className="text-[10px] text-slate-400 capitalize">{user.role.toLowerCase()}</div>
            </div>
            <div className="w-8 h-8 bg-white/10 rounded-full flex items-center justify-center text-white text-xs font-semibold">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <button
              onClick={handleLogout}
              disabled={loading}
              className="px-3 py-1.5 text-xs font-medium rounded-md text-slate-300 bg-white/5 hover:bg-white/10 hover:text-white border border-white/10 disabled:opacity-50 transition-all duration-150"
            >
              {loading ? '...' : 'Logout'}
            </button>
          </div>
        </div>
      </div>
    </nav>
  )
}
