import { getCurrentUser, Role } from './auth'
import { NextRequest, NextResponse } from 'next/server'

// Available modules in the system
export type Module = 
  | 'sukuk' 
  | 'crypto' 
  | 'sip' 
  | 'savings' 
  | 'business-deals'
  | 'zakat'
  | 'import'
  | 'settings'

export interface ModulePermissions {
  sukuk?: boolean
  crypto?: boolean
  sip?: boolean
  savings?: boolean
  'business-deals'?: boolean
  zakat?: boolean
  import?: boolean
  settings?: boolean
}

export async function requireAuth(allowedRoles?: Role[]) {
  const user = await getCurrentUser()
  
  if (!user) {
    throw new Error('Unauthorized')
  }
  
  if (allowedRoles && !allowedRoles.includes(user.role as Role)) {
    throw new Error('Forbidden')
  }
  
  return user
}

export async function canViewPartnerData(user: { id: string; role: string }, personId: string) {
  if (user.role === 'OWNER') return true
  
  const userWithPerson = await import('./db').then(({ prisma }) =>
    prisma.user.findUnique({
      where: { id: user.id },
      include: { person: true },
    })
  )
  
  return userWithPerson?.person?.id === personId
}

/**
 * Check if user has access to a specific module
 * OWNER always has access to all modules
 */
export function hasModuleAccess(user: { role: string; permissions: string | null }, module: Module): boolean {
  // OWNER has access to everything
  if (user.role === 'OWNER') {
    return true
  }
  
  // If no permissions are set, fall back to role-based access
  if (!user.permissions) {
    // VIEWER has no access by default
    return false
  }
  
  try {
    const permissions: ModulePermissions = JSON.parse(user.permissions)
    return permissions[module] === true
  } catch {
    return false
  }
}

/**
 * Get list of modules the user has access to
 */
export function getAccessibleModules(user: { role: string; permissions: string | null }): Module[] {
  if (user.role === 'OWNER') {
    return ['sukuk', 'crypto', 'sip', 'savings', 'business-deals', 'zakat', 'import', 'settings']
  }
  
  if (!user.permissions) {
    return []
  }
  
  try {
    const permissions: ModulePermissions = JSON.parse(user.permissions)
    return Object.entries(permissions)
      .filter(([_, hasAccess]) => hasAccess === true)
      .map(([module]) => module as Module)
  } catch {
    return []
  }
}

/**
 * Require access to a specific module
 */
export async function requireModuleAccess(module: Module) {
  const user = await requireAuth()
  
  if (!hasModuleAccess(user, module)) {
    throw new Error('Forbidden')
  }
  
  return user
}

export function withAuth(
  handler: (req: NextRequest, user: any) => Promise<NextResponse>,
  allowedRoles?: Role[]
) {
  return async (req: NextRequest) => {
    try {
      const user = await requireAuth(allowedRoles)
      return handler(req, user)
    } catch (error) {
      if (error instanceof Error && error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      if (error instanceof Error && error.message === 'Forbidden') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
  }
}
