import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(['OWNER'])
    const body = await req.json().catch(() => ({}))
    const investmentId = typeof body.investmentId === 'string' ? body.investmentId : ''
    if (!investmentId) {
      return NextResponse.json({ error: 'investmentId is required' }, { status: 400 })
    }

    const key = `NOTIFICATION:${user.id}:${investmentId}`
    const setting = await prisma.systemSetting.findUnique({ where: { key } })
    if (!setting) {
      return NextResponse.json({ success: true })
    }

    let nextValue = setting.value
    try {
      const v = JSON.parse(setting.value)
      v.readAt = new Date().toISOString()
      nextValue = JSON.stringify(v)
    } catch {
      nextValue = JSON.stringify({ readAt: new Date().toISOString() })
    }

    await prisma.systemSetting.update({
      where: { key },
      data: { value: nextValue },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Dismiss notification error:', error)

    let statusCode = 500
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') statusCode = 401
      else if (error.message === 'Forbidden') statusCode = 403
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to dismiss notification' },
      { status: statusCode }
    )
  }
}
