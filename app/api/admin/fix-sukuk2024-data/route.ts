import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function POST() {
  try {
    // Fix ISSUE 1: Update reward bucket haulStartDate to June 2024 (last contribution date)
    // Fix ISSUE 4: Transfer remaining 900 from savings bucket to correct allocation
    
    const result = await prisma.$transaction(async (tx) => {
      // Get the reward bucket
      const rewardBucket = await tx.cashBucket.findFirst({
        where: { label: { startsWith: 'Circlys Reward Receipt • Sukuk2024' } },
        select: { id: true, haulStartDate: true },
      })

      // Get the savings bucket
      const savingsBucket = await tx.cashBucket.findFirst({
        where: { label: { startsWith: 'Savings Receipt • Sukuk2024' } },
        select: { id: true, balance: true },
      })

      if (!rewardBucket) {
        return { error: 'Reward bucket not found' }
      }

      if (!savingsBucket) {
        return { error: 'Savings bucket not found' }
      }

      // ISSUE 1 FIX: Update reward bucket haulStartDate to 2024-06-01 (last contribution date)
      // Based on metadata: 6 months (Jan-Jun), last contribution = June 2024
      await tx.cashBucket.update({
        where: { id: rewardBucket.id },
        data: { haulStartDate: new Date('2024-06-01') },
      })

      // ISSUE 4 FIX: Transfer 900 from savings bucket balance to allocations
      const savingsBalance = Number(savingsBucket.balance) || 0
      if (savingsBalance > 0) {
        // Find Midmak investment allocations for this savings bucket
        const allocations = await tx.investmentBucketAllocation.findMany({
          where: {
            cashBucketId: savingsBucket.id,
          },
          select: { id: true, principalAllocated: true, principalRemaining: true },
        })

        if (allocations.length > 0) {
          // Add the 900 to the first allocation (proportional distribution would be more complex)
          await tx.investmentBucketAllocation.update({
            where: { id: allocations[0].id },
            data: {
              principalAllocated: { increment: savingsBalance },
              principalRemaining: { increment: savingsBalance },
            },
          })

          // Zero out the savings bucket balance
          await tx.cashBucket.update({
            where: { id: savingsBucket.id },
            data: { balance: 0 },
          })
        }
      }

      return {
        success: true,
        rewardBucketId: rewardBucket.id,
        rewardBucketOldHaulStart: rewardBucket.haulStartDate,
        rewardBucketNewHaulStart: '2024-06-01',
        savingsBucketId: savingsBucket.id,
        savingsBalanceTransferred: savingsBalance,
      }
    })

    return NextResponse.json(result, { status: 200 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
