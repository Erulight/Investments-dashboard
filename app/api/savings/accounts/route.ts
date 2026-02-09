import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { requireModuleAccess } from '@/lib/rbac'

export async function GET(req: NextRequest) {
  try {
    await requireModuleAccess('savings')
    const user = await getCurrentUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const accounts = await prisma.account.findMany({
      where: {
        type: 'CIRCLYS',
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        type: true,
        currency: true,
      },
      orderBy: { name: 'asc' },
    })

    return NextResponse.json(accounts)
  } catch (error) {
    console.error('Error fetching savings accounts:', error)
    return NextResponse.json({ error: 'Failed to fetch accounts' }, { status: 500 })
  }
}
