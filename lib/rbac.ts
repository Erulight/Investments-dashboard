import { getCurrentUser, Role } from './auth'
import { NextRequest, NextResponse } from 'next/server'

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
