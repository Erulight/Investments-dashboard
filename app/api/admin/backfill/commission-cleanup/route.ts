import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

export async function POST(req: NextRequest) {
  try {
    await requireAuth(['OWNER'])

    const sales = await prisma.transaction.findMany({
      where: { type: 'SELL_TO_PARTNER' },
      select: { id: true, date: true, investmentId: true, personId: true, metadata: true },
      orderBy: { date: 'asc' },
    })

    const bucketsToDelete: string[] = []
    const cashAdjustments: number[] = []
    const txToDelete: string[] = []

    for (const sale of sales) {
      const meta = (() => { try { return JSON.parse(sale.metadata || '{}') } catch { return {} } })()
      const buyerPersonId = typeof meta?.buyerPersonId === 'string' ? meta.buyerPersonId : null
      if (!buyerPersonId) continue

      const saleDateRaw = sale.date ? new Date(sale.date) : null
      const saleDate = saleDateRaw && !Number.isNaN(saleDateRaw.getTime()) ? saleDateRaw : new Date()
      const dayStart = new Date(saleDate.getFullYear(), saleDate.getMonth(), saleDate.getDate())

      // Partner closed?
      const closedMovement = await prisma.cashBucketMovement.findFirst({
        where: {
          investmentId: sale.investmentId,
          type: 'WITHDRAW_PRINCIPAL',
          cashBucket: { personId: buyerPersonId },
        } as any,
        select: { id: true },
      })
      const partnerClosed = Boolean(closedMovement)
      if (partnerClosed) continue

      // Premature Partner Commission buckets created at sale time (haulStartDate == sale date)
      const commissionBuckets = await prisma.cashBucket.findMany({
        where: {
          label: 'Partner Commission',
          personId: null,
          haulStartDate: dayStart,
        } as any,
        select: { id: true, balance: true },
      })

      for (const b of commissionBuckets) {
        if (b.balance > 0) cashAdjustments.push(-Math.abs(b.balance))
        bucketsToDelete.push(b.id)
      }

      // Remove sale-time PARTNER_COMMISSION transactions for this investment on sale date
      const pcTx = await prisma.transaction.findMany({
        where: {
          investmentId: sale.investmentId,
          type: 'PARTNER_COMMISSION',
          date: dayStart,
        },
        select: { id: true },
      })
      txToDelete.push(...pcTx.map((t) => t.id))
    }

    // Apply deletions and cash adjustment
    for (const id of txToDelete) {
      await prisma.transaction.delete({ where: { id } })
    }

    for (const id of bucketsToDelete) {
      await prisma.cashBucket.delete({ where: { id } })
    }

    let adjusted = 0
    if (cashAdjustments.length) {
      const totalAdj = cashAdjustments.reduce((a, b) => a + b, 0)
      const setting = await prisma.systemSetting.findUnique({ where: { key: 'CASH_BALANCE' } })
      const current = setting ? Number(setting.value) : 0
      const next = current + totalAdj
      if (setting) {
        await prisma.systemSetting.update({ where: { key: 'CASH_BALANCE' }, data: { value: next.toString() } })
      } else {
        await prisma.systemSetting.create({ data: { key: 'CASH_BALANCE', value: next.toString(), description: 'Available cash balance for investments' } })
      }
      adjusted = totalAdj
    }

    return NextResponse.json({ success: true, deletedBuckets: bucketsToDelete.length, deletedTransactions: txToDelete.length, cashAdjustment: adjusted })
  } catch (error) {
    console.error('Commission cleanup error:', error)
    let statusCode = 500
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') statusCode = 401
      else if (error.message === 'Forbidden') statusCode = 403
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to cleanup commission buckets' }, { status: statusCode })
  }
}
