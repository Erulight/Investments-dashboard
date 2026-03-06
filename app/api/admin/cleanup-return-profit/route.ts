import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

export async function POST(_req: NextRequest) {
  try {
    await requireAuth(['OWNER'])

    // Find recent SELL_PROFIT_ACCRUED that might have been created for return-to-owner
    const suspect = await prisma.transaction.findMany({
      where: { type: 'SELL_PROFIT_ACCRUED' },
      orderBy: { date: 'desc' },
      take: 100,
      select: { id: true, investmentId: true, amount: true, date: true },
    })

    let deletedCount = 0
    for (const t of suspect) {
      // Only small residuals (e.g. ~222) should be candidates
      if (!Number.isFinite(Number(t.amount)) || Number(t.amount) > 500) continue

      const start = new Date(t.date)
      const end = new Date(t.date)
      start.setDate(start.getDate() - 1)
      end.setDate(end.getDate() + 1)

      const zeroBuy = await prisma.transaction.findFirst({
        where: {
          investmentId: t.investmentId,
          type: 'BUY_FROM_PARTNER',
          amount: 0, // salePrice was 0 in return-to-owner flow
          date: { gte: start, lte: end },
        },
        select: { id: true },
      })

      if (zeroBuy) {
        await prisma.transaction.delete({ where: { id: t.id } })
        deletedCount += 1
      }
    }

    // Recompute CASH_BALANCE from cash account ledger
    const cashAccount = await prisma.account.findFirst({ where: { type: 'CASH' } })
    const sum = await prisma.transaction.aggregate({
      where: { accountId: cashAccount?.id },
      _sum: { amount: true },
    })
    const newValue = Number(sum._sum.amount || 0)

    await prisma.systemSetting.upsert({
      where: { key: 'CASH_BALANCE' },
      update: { value: newValue.toString() },
      create: { key: 'CASH_BALANCE', value: newValue.toString(), description: 'Available cash balance for investments' },
    })

    return NextResponse.json({ success: true, deletedCount, cashBalance: newValue })
  } catch (error) {
    console.error('ADMIN CLEANUP RETURN PROFIT ERROR:', error)
    return NextResponse.json({ error: 'Failed to cleanup' }, { status: 500 })
  }
}
