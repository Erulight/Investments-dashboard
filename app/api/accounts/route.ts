import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

export async function GET(req: NextRequest) {
  try {
    await requireAuth(['OWNER'])

    const { searchParams } = new URL(req.url)
    const typeParam = searchParams.get('type')
    const type = typeParam ? typeParam.toUpperCase() : undefined

    const accounts = await prisma.account.findMany({
      where: {
        isActive: true,
        ...(type ? { type } : {}),
      },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        type: true,
        currency: true,
      },
    })

    return NextResponse.json({ accounts })
  } catch (error) {
    console.error('Accounts fetch error:', error)

    let statusCode = 500
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        statusCode = 401
      } else if (error.message === 'Forbidden') {
        statusCode = 403
      }
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load accounts' },
      { status: statusCode }
    )
  }
}
