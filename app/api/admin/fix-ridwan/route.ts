import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

export async function POST(_req: NextRequest) {
  try {
    const user = await requireAuth(['OWNER'])
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const investmentId = 'cmmdw3grd0002rzun41d92g70'
    const receivableAmount = 527.3775216138329
    const interestRate = 10.518731988472622
    const fees = 52.737752161383284

    const updated = await prisma.investment.update({
      where: { id: investmentId },
      data: {
        receivableAmount,
        interestRate,
        fees,
      },
      select: { id: true, name: true, receivableAmount: true, interestRate: true, fees: true },
    })

    const dp = await prisma.dealParticipant.updateMany({
      where: { investmentId },
      data: {
        profit: receivableAmount,
        receivable: receivableAmount,
      },
    })

    return NextResponse.json({ success: true, investment: updated, dealParticipantsUpdated: dp.count })
  } catch (err) {
    console.error('fix-ridwan error:', err)
    return NextResponse.json({ error: 'Failed to apply fix' }, { status: 500 })
  }
}
