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

    console.log('RESTORE SNAPSHOT START:', { snapshotId })

    const result = await prisma.$transaction(async (tx: any) => {
      return await restoreSnapshot(tx, snapshotId)
    })

    console.log('RESTORE SNAPSHOT SUCCESS:', { snapshotId, changes: result.changes.length })

    return NextResponse.json({
      success: true,
      restored: result.restored,
      changes: result.changes,
    })
  } catch (error) {
    console.error('ADMIN RESTORE ERROR:', {
      snapshotId: (error as any)?.snapshotId,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      fullError: error,
    })
    
    if (error instanceof Error) {
      if (error.message === 'Snapshot not found') {
        return NextResponse.json({ error: 'Snapshot not found' }, { status: 404 })
      }
      if (error.message === 'Snapshot already restored') {
        return NextResponse.json({ error: 'Snapshot already restored' }, { status: 409 })
      }
      
      return NextResponse.json({ 
        error: `Failed to restore snapshot: ${error.message}` 
      }, { status: 500 })
    }

    return NextResponse.json({ 
      error: `Failed to restore snapshot: ${String(error)}` 
    }, { status: 500 })
  }
}
