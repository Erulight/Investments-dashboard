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
      },
    })

    if (!investment) {
      return NextResponse.json({ error: 'Investment not found' }, { status: 404 })
    }

    // Get all buckets with allocations to this investment
    const bucketsWithAllocations = await prisma.cashBucket.findMany({
      where: {
        allocations: {
          some: {
            investmentId: investment.id,
          },
        },
      },
      include: {
        allocations: {
          where: {
            investmentId: investment.id,
          },
          include: {
            investment: {
              select: {
                id: true,
                name: true,
                principalAmount: true,
                account: { select: { type: true } },
              },
            },
          },
        },
        movements: {
          where: {
            investmentId: investment.id,
          },
          orderBy: { date: 'asc' },
        },
      },
    })

    // Get all buckets with movements for this investment
    const bucketsWithMovements = await prisma.cashBucket.findMany({
      where: {
        movements: {
          some: {
            investmentId: investment.id,
            type: { in: ['WITHDRAW_PRINCIPAL', 'WITHDRAW_PROFIT', 'INVEST_OUT'] },
          },
        },
      },
      include: {
        allocations: {
          where: {
            investmentId: investment.id,
          },
        },
        movements: {
          where: {
            investmentId: investment.id,
          },
          orderBy: { date: 'asc' },
        },
      },
    })

    // Combine and deduplicate
    const allBucketIds = new Set([
      ...bucketsWithAllocations.map((b) => b.id),
      ...bucketsWithMovements.map((b) => b.id),
    ])

    const allBuckets = await prisma.cashBucket.findMany({
      where: {
        id: { in: Array.from(allBucketIds) },
      },
      include: {
        allocations: {
          where: {
            investmentId: investment.id,
          },
          include: {
            investment: {
              select: {
                id: true,
                name: true,
                principalAmount: true,
                account: { select: { type: true } },
              },
            },
          },
        },
        movements: {
          where: {
            investmentId: investment.id,
          },
          orderBy: { date: 'asc' },
        },
      },
    })

    const analysis = allBuckets.map((bucket) => {
      const allocations = bucket.allocations || []
      const movements = bucket.movements || []

      const principalWithdrawals = movements.filter((m) => m.type === 'WITHDRAW_PRINCIPAL')
      const investOuts = movements.filter((m) => m.type === 'INVEST_OUT')

      return {
        bucketId: bucket.id,
        bucketLabel: bucket.label,
        bucketBalance: bucket.balance,
        bucketHaulStart: bucket.haulStartDate,
        excludeFromZakat: bucket.excludeFromZakat,
        allocations: allocations.map((a) => ({
          principalAllocated: a.principalAllocated,
          principalRemaining: a.principalRemaining,
          investmentId: a.investmentId,
          investmentName: a.investment?.name,
          investmentPrincipalAmount: a.investment?.principalAmount,
          investmentType: a.investment?.account?.type,
        })),
        movements: {
          investOuts: investOuts.map((m) => ({
            amount: m.amount,
            date: m.date,
            type: m.type,
          })),
          principalWithdrawals: principalWithdrawals.map((m) => ({
            amount: m.amount,
            date: m.date,
            type: m.type,
          })),
        },
        zakatIssues: {
          hasBalance: bucket.balance > 0,
          hasAllocationsWithRemainingPrincipal: allocations.some((a) => a.principalRemaining > 0),
          hasClosedInvestmentAllocation: allocations.some(
            (a) => a.investment && a.investment.principalAmount === 0
          ),
          hasPrincipalWithdrawal: principalWithdrawals.length > 0,
        },
      }
    })

    return NextResponse.json({
      investment: {
        id: investment.id,
        name: investment.name,
        principalAmount: investment.principalAmount,
        accountType: investment.account?.type,
        metadata: investment.metadata ? JSON.parse(investment.metadata) : {},
      },
      bucketsCount: allBuckets.length,
      buckets: analysis,
      summary: {
        bucketsWithBalance: analysis.filter((b) => b.zakatIssues.hasBalance).length,
        bucketsWithRemainingPrincipal: analysis.filter(
          (b) => b.zakatIssues.hasAllocationsWithRemainingPrincipal
        ).length,
        bucketsWithClosedInvestment: analysis.filter(
          (b) => b.zakatIssues.hasClosedInvestmentAllocation
        ).length,
        bucketsWithPrincipalWithdrawal: analysis.filter(
          (b) => b.zakatIssues.hasPrincipalWithdrawal
        ).length,
      },
    })
  } catch (error) {
    console.error('Diagnose zakat rows error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
