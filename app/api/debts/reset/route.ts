import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

export async function POST() {
  try {
    await requireAuth(['OWNER'])

    const result = await prisma.debt.updateMany({
      where: { isArchived: false },
      data: { isArchived: true },
    })

    return NextResponse.json({ success: true, archivedCount: result.count })
  } catch (error) {
    console.error('Debts reset error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to reset debts' },
      { status: 500 }
    )
  }
}
