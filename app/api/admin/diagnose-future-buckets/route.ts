import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

export async function GET() {
  try {
    await requireAuth(['OWNER'])
    
    const today = new Date()
    const todayStr = today.toISOString().split('T')[0]

    // Find all cash buckets with future haulStartDate
    const futureBuckets = await prisma.cashBucket.findMany({
      where: {
        haulStartDate: { gt: today },
      },
      orderBy: { haulStartDate: 'desc' },
      select: {
        id: true,
        label: true,
        balance: true,
        currency: true,
        haulStartDate: true,
        excludeFromZakat: true,
        createdAt: true,
        personId: true,
        movements: {
          select: {
            id: true,
            amount: true,
            type: true,
            date: true,
            investmentId: true,
          },
          orderBy: { date: 'asc' },
        },
      },
    })

    // Find savings plans with future start dates
    const savingsPlans = await prisma.investment.findMany({
      where: {
        category: 'SAVINGS_ROSCA',
      },
      select: {
        id: true,
        name: true,
        startDate: true,
        metadata: true,
        account: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
      orderBy: { startDate: 'desc' },
    })

    const futureSavingsPlans = savingsPlans.filter((plan) => {
      const startDate = new Date(plan.startDate)
      return startDate > today
    })

    // Get all buckets (not just future ones) to show available vs total balance
    const allBuckets = await prisma.cashBucket.findMany({
      where: {
        balance: { gt: 0 },
        personId: null, // Owner buckets only
      },
      select: {
        id: true,
        label: true,
        balance: true,
        haulStartDate: true,
        excludeFromZakat: true,
      },
    })

    const totalBalance = allBuckets.reduce((sum, b) => sum + Number(b.balance || 0), 0)
    const availableBalance = allBuckets
      .filter((b) => {
        const haulDate = new Date(b.haulStartDate)
        return haulDate <= today
      })
      .reduce((sum, b) => sum + Number(b.balance || 0), 0)

    const blockedBalance = totalBalance - availableBalance
    const blockedBuckets = allBuckets.filter((b) => {
      const haulDate = new Date(b.haulStartDate)
      return haulDate > today
    })

    return NextResponse.json({
      today: todayStr,
      summary: {
        totalBalance,
        availableBalance,
        blockedBalance,
        blockedBucketCount: blockedBuckets.length,
      },
      futureBuckets: futureBuckets.map((b) => ({
        id: b.id,
        label: b.label,
        balance: b.balance,
        currency: b.currency,
        haulStartDate: b.haulStartDate.toISOString().split('T')[0],
        excludeFromZakat: b.excludeFromZakat,
        createdAt: b.createdAt.toISOString().split('T')[0],
        personId: b.personId,
        movementCount: b.movements.length,
        earliestMovement: b.movements[0]
          ? {
              date: new Date(b.movements[0].date).toISOString().split('T')[0],
              type: b.movements[0].type,
              amount: b.movements[0].amount,
              investmentId: b.movements[0].investmentId,
            }
          : null,
      })),
      futureSavingsPlans: futureSavingsPlans.map((plan) => {
        let metadata: any = {}
        try {
          metadata = JSON.parse(plan.metadata || '{}')
        } catch {}
        
        return {
          id: plan.id,
          name: plan.name,
          startDate: new Date(plan.startDate).toISOString().split('T')[0],
          accountName: plan.account?.name,
          monthlyContribution: metadata.monthlyContribution,
          totalMonths: metadata.totalMonths,
          monthsPaid: metadata.monthsPaid,
        }
      }),
      allSavingsPlans: savingsPlans.map((plan) => {
        let metadata: any = {}
        try {
          metadata = JSON.parse(plan.metadata || '{}')
        } catch {}
        
        const startDate = new Date(plan.startDate)
        const isFuture = startDate > today
        
        return {
          id: plan.id,
          name: plan.name,
          startDate: startDate.toISOString().split('T')[0],
          isFuture,
          accountName: plan.account?.name,
          monthlyContribution: metadata.monthlyContribution,
          totalMonths: metadata.totalMonths,
          monthsPaid: metadata.monthsPaid,
        }
      }),
      blockedBuckets: blockedBuckets.map((b) => ({
        id: b.id,
        label: b.label,
        balance: b.balance,
        haulStartDate: new Date(b.haulStartDate).toISOString().split('T')[0],
      })),
    })
  } catch (error) {
    console.error('Diagnose future buckets error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to diagnose' },
      { status: 500 }
    )
  }
}
