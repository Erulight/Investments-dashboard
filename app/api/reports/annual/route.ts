import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'
import { DEMO_INVESTMENT_NAMES } from '@/lib/demo'

const toCsv = (rows: string[][]) =>
  rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n')

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth()
    const { searchParams } = new URL(req.url)
    const yearParam = searchParams.get('year')
    const parsedYear = yearParam ? Number(yearParam) : NaN
    const selectedYear = Number.isFinite(parsedYear) ? parsedYear : new Date().getFullYear()
    const yearStart = new Date(selectedYear, 0, 1)
    const yearEnd = new Date(selectedYear + 1, 0, 1)

    const transactionWhere =
      user.role === 'PARTNER' && user.personId
        ? {
            personId: user.personId,
            OR: [
              { investment: { name: { notIn: DEMO_INVESTMENT_NAMES } } },
              { investmentId: null },
            ],
          }
        : {
            OR: [
              { investment: { name: { notIn: DEMO_INVESTMENT_NAMES } } },
              { investmentId: null },
            ],
          }

    const transactions = await prisma.transaction.findMany({
      where: {
        ...transactionWhere,
        date: { gte: yearStart, lt: yearEnd },
      },
      orderBy: { date: 'asc' },
      include: {
        investment: true,
        account: true,
      },
    })

    const rows: string[][] = [
      ['Date', 'Type', 'Amount', 'Currency', 'Account', 'Investment', 'Notes'],
      ...transactions.map((tx) => [
        new Date(tx.date).toISOString().split('T')[0],
        tx.type,
        tx.amount.toString(),
        tx.account?.currency || '',
        tx.account?.name || '',
        tx.investment?.name || '',
        tx.description || '',
      ]),
    ]

    const csv = toCsv(rows)

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="portfolio-report-${selectedYear}.csv"`,
      },
    })
  } catch (error) {
    console.error('Report error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate report' },
      { status: 500 }
    )
  }
}
