import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

export async function POST(req: NextRequest) {
  try {
    await requireAuth(['OWNER'])

    const result = await prisma.cashBucket.updateMany({
      where: {
        OR: [
          { label: 'Partner Commission' },
          { label: { startsWith: 'Debt •' } },
        ],
      } as any,
      data: {
        personId: null,
        excludeFromZakat: true,
      } as any,
    })

    return NextResponse.json({ success: true, updatedCount: result.count })
  } catch (error) {
    console.error('Cleanup non-partner buckets error:', error)

    let statusCode = 500
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') statusCode = 401
      if (error.message === 'Forbidden') statusCode = 403
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to cleanup buckets' },
      { status: statusCode }
    )
  }
}
