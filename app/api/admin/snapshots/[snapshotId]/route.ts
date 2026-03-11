import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ snapshotId: string }> }
) {
  try {
    await requireAuth(['OWNER'])

    const { snapshotId } = await params

    if (!snapshotId) {
      return NextResponse.json({ error: 'Snapshot ID is required' }, { status: 400 })
    }

    const snapshot = await prisma.snapshot.findUnique({
      where: { id: snapshotId },
    })

    if (!snapshot) {
      return NextResponse.json({ error: 'Snapshot not found' }, { status: 404 })
    }

    await prisma.snapshot.delete({
      where: { id: snapshotId },
    })

    return NextResponse.json({
      success: true,
      message: 'Snapshot deleted successfully',
    })
  } catch (error) {
    console.error('ADMIN SNAPSHOT DELETE ERROR:', error)
    return NextResponse.json({ error: 'Failed to delete snapshot' }, { status: 500 })
  }
}
