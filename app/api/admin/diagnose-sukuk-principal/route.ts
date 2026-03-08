import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    await requireAuth(['OWNER'])

    const url = new URL(req.url)
    const investmentId = url.searchParams.get('id')

    if (!investmentId) {
      return NextResponse.json({ error: 'Missing investment id parameter' }, { status: 400 })
    }

    // Get the investment
    const investment = await prisma.investment.findUnique({
      where: { id: investmentId },
      include: {
        account: true,
        transactions: {
          where: {
            type: { in: ['WITHDRAW_PROFIT', 'WITHDRAW_PRINCIPAL'] },
          },
          orderBy: { date: 'asc' },
        },
      },
    })

    if (!investment) {
      return NextResponse.json({ error: 'Investment not found' }, { status: 404 })
    }

    // Get all cash bucket movements for this investment
    const movements = await prisma.cashBucketMovement.findMany({
      where: {
        investmentId: investment.id,
        type: { in: ['WITHDRAW_PROFIT', 'WITHDRAW_PRINCIPAL', 'INVEST_OUT'] },
      },
      include: {
        cashBucket: {
          select: {
            id: true,
            label: true,
            balance: true,
            haulStartDate: true,
            excludeFromZakat: true,
          },
        },
      },
      orderBy: { date: 'asc' },
    })

    // Get bucket allocations
    const allocations = await prisma.investmentBucketAllocation.findMany({
      where: { investmentId: investment.id },
      include: {
        cashBucket: {
          select: {
            id: true,
            label: true,
            balance: true,
            haulStartDate: true,
          },
        },
      },
    })

    // Analyze principal withdrawals
    const principalWithdrawals = movements.filter((m) => m.type === 'WITHDRAW_PRINCIPAL')
    const principalTransactions = investment.transactions.filter((t) => t.type === 'WITHDRAW_PRINCIPAL')

    const metadata = investment.metadata ? JSON.parse(investment.metadata) : {}
    const savingsHaulStartDate = metadata.savingsHaulStartDate

    return NextResponse.json({
      investment: {
        id: investment.id,
        name: investment.name,
        principalAmount: investment.principalAmount,
        startDate: investment.startDate,
        metadata: metadata,
        savingsHaulStartDate,
      },
      principalWithdrawals: {
        count: principalWithdrawals.length,
        totalAmount: principalWithdrawals.reduce((sum, m) => sum + m.amount, 0),
        details: principalWithdrawals.map((m) => ({
          id: m.id,
          amount: m.amount,
          date: m.date,
          bucketId: m.cashBucketId,
          bucketLabel: m.cashBucket?.label,
          bucketBalance: m.cashBucket?.balance,
          bucketHaulStart: m.cashBucket?.haulStartDate,
          bucketExcludedFromZakat: m.cashBucket?.excludeFromZakat,
        })),
      },
      principalTransactions: {
        count: principalTransactions.length,
        totalAmount: principalTransactions.reduce((sum, t) => sum + t.amount, 0),
        details: principalTransactions.map((t) => ({
          id: t.id,
          amount: t.amount,
          date: t.date,
          description: t.description,
        })),
      },
      bucketAllocations: allocations.map((a) => ({
        bucketId: a.cashBucketId,
        bucketLabel: a.cashBucket?.label,
        bucketBalance: a.cashBucket?.balance,
        bucketHaulStart: a.cashBucket?.haulStartDate,
        principalAllocated: a.principalAllocated,
        principalRemaining: a.principalRemaining,
      })),
      investOutMovements: movements
        .filter((m) => m.type === 'INVEST_OUT')
        .map((m) => ({
          id: m.id,
          amount: m.amount,
          date: m.date,
          bucketId: m.cashBucketId,
          bucketLabel: m.cashBucket?.label,
          bucketHaulStart: m.cashBucket?.haulStartDate,
        })),
    })
  } catch (error) {
    console.error('Diagnose sukuk principal error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
