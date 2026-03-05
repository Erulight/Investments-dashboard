import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

export async function GET(_req: NextRequest) {
  try {
    // Restrict to OWNER for safety
    await requireAuth(['OWNER'])

    const cashAccount = await prisma.account.findFirst({
      where: { type: 'CASH' },
    })

    const txs = await prisma.transaction.findMany({
      where: { accountId: cashAccount?.id },
      orderBy: { date: 'desc' },
      take: 20,
      select: { type: true, amount: true, date: true, description: true, createdAt: true },
    })

    // Diagnostic console logs (as requested)
    console.log('Recent cash transactions:')
    txs.forEach((t) =>
      console.log(
        `${t.date ? new Date(t.date).toISOString().split('T')[0] : '—'} | ${t.type} | ${t.amount} | ${t.description ?? ''}`
      )
    )

    const setting = await prisma.systemSetting.findUnique({ where: { key: 'CASH_BALANCE' } })
    console.log('SystemSetting CASH_BALANCE:', setting?.value)

    const txSum = await prisma.transaction.aggregate({
      where: { accountId: cashAccount?.id },
      _sum: { amount: true },
    })
    console.log('Sum of all cash transactions:', txSum._sum.amount)

    return NextResponse.json(
      {
        cashAccountId: cashAccount?.id ?? null,
        systemSettingCashBalance: setting?.value ?? null,
        transactionSum: txSum._sum.amount ?? 0,
        recent: txs.map((t) => ({
          date: t.date ? new Date(t.date).toISOString().split('T')[0] : null,
          type: t.type,
          amount: t.amount,
          description: t.description,
          createdAt: t.createdAt ? new Date(t.createdAt).toISOString() : null,
        })),
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('ADMIN CASH DIAGNOSTICS ERROR:', error)
    return NextResponse.json({ error: 'Failed to run diagnostics' }, { status: 500 })
  }
}
