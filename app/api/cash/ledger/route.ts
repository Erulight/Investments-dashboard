import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

const CASH_BALANCE_KEY = 'CASH_BALANCE'

const parseMetadata = (value: unknown) => {
  if (!value) return null
  if (typeof value === 'object') return value as Record<string, unknown>
  if (typeof value !== 'string') return null
  try {
    return JSON.parse(value) as Record<string, unknown>
  } catch {
    return null
  }
}

const toCsv = (rows: string[][]) =>
  rows
    .map((row) => row.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n')

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(['OWNER', 'PARTNER'])
    if (user.role === 'PARTNER' && !user.personId) {
      return NextResponse.json({ error: 'Partner is missing a person profile' }, { status: 400 })
    }

    const { searchParams } = new URL(req.url)
    const page = Math.max(1, Number(searchParams.get('page')) || 1)
    const limit = Math.min(100, Math.max(10, Number(searchParams.get('limit')) || 50))
    const typeFilter = searchParams.get('type') || ''
    const yearParam = searchParams.get('year')
    const monthParam = searchParams.get('month')
    const flowParam = (searchParams.get('flow') || '').toUpperCase()
    const searchTerm = (searchParams.get('q') || '').trim()
    const exportFormat = (searchParams.get('export') || '').toLowerCase()

    const parsedYear = yearParam ? Number(yearParam) : NaN
    const parsedMonth = monthParam ? Number(monthParam) : NaN
    const hasYear = Number.isFinite(parsedYear)
    const hasMonth = Number.isFinite(parsedMonth) && parsedMonth >= 1 && parsedMonth <= 12

    let dateRange: { gte: Date; lt: Date } | null = null
    if (hasYear && hasMonth) {
      const start = new Date(parsedYear, parsedMonth - 1, 1)
      const end = new Date(parsedYear, parsedMonth, 1)
      dateRange = { gte: start, lt: end }
    } else if (hasYear) {
      const start = new Date(parsedYear, 0, 1)
      const end = new Date(parsedYear + 1, 0, 1)
      dateRange = { gte: start, lt: end }
    }

    const scopeKey = user.role === 'OWNER' ? 'OWNER' : user.personId!
    const cashBalanceKey = user.role === 'OWNER' ? CASH_BALANCE_KEY : `${CASH_BALANCE_KEY}:${scopeKey}`

    let resolvedCashBalance = 0
    if (user.role === 'PARTNER') {
      const agg = await prisma.cashBucket.aggregate({
        where: {
          personId: user.personId,
          NOT: [
            { label: { startsWith: 'Debt •' } },
            { label: 'Partner Commission' },
          ],
        } as any,
        _sum: { balance: true },
      })
      resolvedCashBalance = agg._sum.balance || 0
    } else {
      const setting = await prisma.systemSetting.findUnique({ where: { key: cashBalanceKey } })
      resolvedCashBalance = setting ? Number(setting.value) : 0
    }

    const cashAccount = await prisma.account.findFirst({
      where: { type: 'CASH', isActive: true },
    })

    // Build transaction filter
    const scopedTxWhere: Record<string, unknown> = {}
    if (cashAccount) {
      scopedTxWhere.accountId = cashAccount.id
    } else {
      scopedTxWhere.id = '__none__'
    }
    scopedTxWhere.personId = user.role === 'OWNER' ? null : user.personId

    const txWhereBase: Record<string, unknown> = {
      ...scopedTxWhere,
    }

    if (typeFilter) {
      txWhereBase.type = typeFilter
    }
    if (dateRange) {
      txWhereBase.date = dateRange
    }
    if (searchTerm) {
      txWhereBase.OR = [
        { type: { contains: searchTerm, mode: 'insensitive' } },
        { description: { contains: searchTerm, mode: 'insensitive' } },
        { investment: { name: { contains: searchTerm, mode: 'insensitive' } } },
        { person: { name: { contains: searchTerm, mode: 'insensitive' } } },
      ]
    }

    const txWhere: Record<string, unknown> = {
      ...txWhereBase,
    }

    if (flowParam === 'IN') {
      txWhere.amount = { gt: 0 }
    } else if (flowParam === 'OUT') {
      txWhere.amount = { lt: 0 }
    }

    if (exportFormat === 'csv') {
      const exportTransactions = await prisma.transaction.findMany({
        where: txWhere as any,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        take: 5000,
        include: {
          investment: { select: { name: true } },
          person: { select: { name: true } },
        },
      })

      const rows: string[][] = [
        [
          'Date',
          'Type',
          'Direction',
          'Debit',
          'Credit',
          'Amount',
          'Investment',
          'Counterparty',
          'Source',
          'Money From',
          'Money To',
          'Description',
        ],
      ]

      for (const tx of exportTransactions) {
        const metadata = parseMetadata(tx.metadata)
        const metadataSource = typeof metadata?.source === 'string' ? metadata.source : ''
        const direction = tx.amount >= 0 ? 'IN' : 'OUT'
        const absAmount = Math.abs(Number(tx.amount) || 0)

        const moneyFrom = direction === 'IN'
          ? (tx.person?.name || tx.investment?.name || metadataSource || 'External source')
          : 'Cash Balance'
        const moneyTo = direction === 'OUT'
          ? (tx.investment?.name || tx.person?.name || metadataSource || 'External destination')
          : 'Cash Balance'

        rows.push([
          new Date(tx.date).toISOString().slice(0, 10),
          tx.type,
          direction,
          direction === 'OUT' ? absAmount.toFixed(2) : '',
          direction === 'IN' ? absAmount.toFixed(2) : '',
          tx.amount.toFixed(2),
          tx.investment?.name || '',
          tx.person?.name || '',
          metadataSource,
          moneyFrom,
          moneyTo,
          tx.description || '',
        ])
      }

      const filenameYear = hasYear ? String(parsedYear) : 'all-years'
      const filenameMonth = hasMonth ? `-${String(parsedMonth).padStart(2, '0')}` : ''

      return new NextResponse(toCsv(rows), {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="cash-ledger-${filenameYear}${filenameMonth}.csv"`,
        },
      })
    }

    const [transactionsRaw, totalCount, summaryAgg, inflowAgg, outflowAgg] = await Promise.all([
      prisma.transaction.findMany({
        where: txWhere as any,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          investment: {
            select: {
              id: true,
              name: true,
              category: true,
            },
          },
          person: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      prisma.transaction.count({ where: txWhere as any }),
      prisma.transaction.aggregate({
        where: txWhere as any,
        _sum: { amount: true },
        _count: { _all: true },
      }),
      prisma.transaction.aggregate({
        where: {
          ...(txWhere as any),
          amount: { gt: 0 },
        },
        _sum: { amount: true },
      }),
      prisma.transaction.aggregate({
        where: {
          ...(txWhere as any),
          amount: { lt: 0 },
        },
        _sum: { amount: true },
      }),
    ])

    const transactions = transactionsRaw.map((tx: any) => {
      const metadata = parseMetadata(tx.metadata)
      const metadataSource = typeof metadata?.source === 'string' ? metadata.source : null
      const direction = tx.amount >= 0 ? 'IN' : 'OUT'

      const moneyFrom = direction === 'IN'
        ? (tx.person?.name || tx.investment?.name || metadataSource || 'External source')
        : 'Cash Balance'
      const moneyTo = direction === 'OUT'
        ? (tx.investment?.name || tx.person?.name || metadataSource || 'External destination')
        : 'Cash Balance'

      return {
        id: tx.id,
        type: tx.type,
        amount: tx.amount,
        date: tx.date,
        description: tx.description,
        createdAt: tx.createdAt,
        investmentId: tx.investmentId,
        investmentName: tx.investment?.name || null,
        investmentCategory: tx.investment?.category || null,
        personId: tx.personId,
        personName: tx.person?.name || null,
        metadataSource,
        direction,
        moneyFrom,
        moneyTo,
      }
    })

    // Get all buckets (active and depleted)
    const buckets = await prisma.cashBucket.findMany({
      where: (
        user.role === 'OWNER'
          ? { personId: null }
          : { personId: user.personId }
      ) as any,
      orderBy: { haulStartDate: 'desc' },
      select: {
        id: true,
        label: true,
        balance: true,
        currency: true,
        haulStartDate: true,
        lastZakatPaidDate: true,
        createdAt: true,
      },
    })

    // Get distinct transaction types for filter dropdown
    const rawTypes = cashAccount
      ? await prisma.transaction.findMany({
          where: scopedTxWhere as any,
          distinct: ['type'],
          select: { type: true },
        })
      : []
    const transactionTypes = rawTypes.map((t: { type: string }) => t.type).sort()

    const [oldestTx, newestTx] = cashAccount
      ? await Promise.all([
          prisma.transaction.findFirst({
            where: scopedTxWhere as any,
            orderBy: { date: 'asc' },
            select: { date: true },
          }),
          prisma.transaction.findFirst({
            where: scopedTxWhere as any,
            orderBy: { date: 'desc' },
            select: { date: true },
          }),
        ])
      : [null, null]

    const availableYears: number[] = (() => {
      if (!oldestTx?.date || !newestTx?.date) return []
      const startYear = oldestTx.date.getFullYear()
      const endYear = newestTx.date.getFullYear()
      const years: number[] = []
      for (let y = endYear; y >= startYear; y -= 1) {
        years.push(y)
      }
      return years
    })()

    const inflow = flowParam === 'OUT'
      ? 0
      : flowParam === 'IN'
        ? Number(summaryAgg._sum.amount || 0)
        : Number(inflowAgg._sum.amount || 0)
    const outflow = flowParam === 'IN'
      ? 0
      : flowParam === 'OUT'
        ? Math.abs(Number(summaryAgg._sum.amount || 0))
        : Math.abs(Number(outflowAgg._sum.amount || 0))
    const net = Number(summaryAgg._sum.amount || 0)
    const summary = {
      inflow,
      outflow,
      net,
      count: Number(summaryAgg._count?._all || 0),
    }

    return NextResponse.json({
      cashBalance: Number.isFinite(resolvedCashBalance) ? resolvedCashBalance : 0,
      transactions,
      totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
      buckets,
      transactionTypes,
      availableYears,
      summary,
      userRole: user.role,
    })
  } catch (error) {
    console.error('Cash ledger fetch error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load cash ledger' },
      { status: 500 }
    )
  }
}
