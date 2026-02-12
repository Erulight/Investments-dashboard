import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

const CASH_BALANCE_KEY = 'CASH_BALANCE'

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

    const scopeKey = user.role === 'OWNER' ? 'OWNER' : user.personId!
    const cashBalanceKey = user.role === 'OWNER' ? CASH_BALANCE_KEY : `${CASH_BALANCE_KEY}:${scopeKey}`

    const setting = await prisma.systemSetting.findUnique({
      where: { key: cashBalanceKey },
    })
    const cashBalance = setting ? Number(setting.value) : 0

    const cashAccount = await prisma.account.findFirst({
      where: { type: 'CASH', isActive: true },
    })

    // Build transaction filter
    const txWhere: Record<string, unknown> = {}
    if (cashAccount) {
      txWhere.accountId = cashAccount.id
    } else {
      txWhere.id = '__none__'
    }
    txWhere.personId = user.role === 'OWNER' ? null : user.personId
    if (typeFilter) {
      txWhere.type = typeFilter
    }

    const [transactions, totalCount] = await Promise.all([
      prisma.transaction.findMany({
        where: txWhere,
        orderBy: { date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          type: true,
          amount: true,
          date: true,
          description: true,
          createdAt: true,
        },
      }),
      prisma.transaction.count({ where: txWhere }),
    ])

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
          where: {
            accountId: cashAccount.id,
            personId: user.role === 'OWNER' ? null : user.personId,
          },
          distinct: ['type'],
          select: { type: true },
        })
      : []
    const transactionTypes = rawTypes.map((t: { type: string }) => t.type).sort()

    return NextResponse.json({
      cashBalance: Number.isFinite(cashBalance) ? cashBalance : 0,
      transactions,
      totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
      buckets,
      transactionTypes,
    })
  } catch (error) {
    console.error('Cash ledger fetch error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load cash ledger' },
      { status: 500 }
    )
  }
}
