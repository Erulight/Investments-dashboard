import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'
import { cleanupOldSnapshots } from '@/lib/snapshot'

export async function POST(_req: NextRequest) {
  try {
    await requireAuth(['OWNER'])

    const deletedCount = await prisma.$transaction(async (tx: any) => {
      return await cleanupOldSnapshots(tx)
    })

    return NextResponse.json({
      success: true,
      deletedCount,
    })
  } catch (error) {
    console.error('ADMIN SNAPSHOTS CLEANUP ERROR:', error)
    return NextResponse.json({ error: 'Failed to cleanup snapshots' }, { status: 500 })
  }
}
