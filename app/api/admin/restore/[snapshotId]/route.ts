import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'
import { restoreSnapshot } from '@/lib/snapshot'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ snapshotId: string }> }
) {
  try {
    await requireAuth(['OWNER'])
    const { snapshotId } = await params

    if (!snapshotId) {
      return NextResponse.json({ error: 'Snapshot ID is required' }, { status: 400 })
    }

    const result = await prisma.$transaction(async (tx: any) => {
      return await restoreSnapshot(tx, snapshotId)
    })

    return NextResponse.json({
      success: true,
      restored: result.restored,
      changes: result.changes,
    })
  } catch (error) {
    console.error('ADMIN RESTORE ERROR:', error)
    
    if (error instanceof Error) {
      if (error.message === 'Snapshot not found') {
        return NextResponse.json({ error: 'Snapshot not found' }, { status: 404 })
      }
      if (error.message === 'Snapshot already restored') {
        return NextResponse.json({ error: 'Snapshot already restored' }, { status: 409 })
      }
    }

    return NextResponse.json({ error: 'Failed to restore snapshot' }, { status: 500 })
  }
}
