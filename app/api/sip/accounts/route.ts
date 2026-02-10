import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { requireModuleAccess } from '@/lib/rbac'

export async function GET() {
  try {
    await requireModuleAccess('savings') // We'll reuse savings permissions for SIP
    const user = await getCurrentUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch accounts suitable for SIP investments
    // For now, we'll include all active accounts except CIRCLYS (which is for ROSCA)
    const accounts = await prisma.account.findMany({
      where: {
        isActive: true,
        type: {
          not: 'CIRCLYS', // Exclude Circlys accounts as they're for ROSCA savings
        },
      },
      select: {
        id: true,
        name: true,
        type: true,
        currency: true,
      },
      orderBy: {
        name: 'asc',
      },
    })

    return NextResponse.json(accounts)
  } catch (error) {
    console.error('Error fetching SIP accounts:', error)
    if (error instanceof Error && error.message === 'Module access denied') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }
    return NextResponse.json({ error: 'Failed to fetch accounts' }, { status: 500 })
  }
}
