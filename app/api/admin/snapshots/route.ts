import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

export async function GET(req: NextRequest) {
  try {
    await requireAuth(['OWNER'])
    
    const url = new URL(req.url)
    const filter = url.searchParams.get('filter') || 'all'
    const takeRaw = Number(url.searchParams.get('take') || '200')
    const take = Number.isFinite(takeRaw) ? Math.min(500, Math.max(1, takeRaw)) : 200
    
    let whereClause: any = {}
    
    if (filter === 'hour') {
      whereClause.createdAt = { gte: new Date(Date.now() - 60 * 60 * 1000) }
    } else if (filter === 'day') {
      whereClause.createdAt = { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    } else if (filter === 'week') {
      whereClause.createdAt = { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    }

    const snapshots = await (prisma as any).snapshot.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        createdAt: true,
        label: true,
        trigger: true,
        restoredAt: true,
        userId: true,
      },
    })

    return NextResponse.json({ snapshots })
  } catch (error) {
    console.error('ADMIN SNAPSHOTS LIST ERROR:', error)
    return NextResponse.json({ error: 'Failed to fetch snapshots' }, { status: 500 })
  }
}
