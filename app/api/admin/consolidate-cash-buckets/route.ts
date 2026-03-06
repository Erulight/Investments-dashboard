import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(['OWNER'])
    
    // Get all cash buckets
    const buckets = await prisma.cashBucket.findMany({
      where: {
        personId: null, // Owner buckets only
        balance: { gt: 0 }
      },
      orderBy: { haulStartDate: 'asc' },
      include: {
        movements: true
      }
    })

    console.log(`Found ${buckets.length} cash buckets`)

    // Calculate total balance
    const totalBalance = buckets.reduce((sum, b) => sum + b.balance, 0)
    console.log(`Total balance across all buckets: SAR ${totalBalance}`)

    // Get system cash balance
    const cashSetting = await prisma.systemSetting.findUnique({
      where: { key: 'CASH_BALANCE' }
    })
    const systemCash = Number(cashSetting?.value || 0)
    console.log(`System cash balance: SAR ${systemCash}`)

    // If there's a mismatch, consolidate buckets
    if (Math.abs(totalBalance - systemCash) > 0.01) {
      console.log(`Mismatch detected: ${totalBalance} vs ${systemCash}`)
      
      // Delete all buckets and recreate one consolidated bucket
      await prisma.$transaction(async (tx) => {
        // Delete all movements
        await tx.cashBucketMovement.deleteMany({
          where: {
            cashBucket: {
              personId: null
            }
          }
        })

        // Delete all buckets
        await tx.cashBucket.deleteMany({
          where: {
            personId: null
          }
        })

        // Create one consolidated bucket with the correct balance
        const newBucket = await tx.cashBucket.create({
          data: {
            label: 'Consolidated Cash',
            currency: 'SAR',
            balance: systemCash,
            haulStartDate: new Date(),
            excludeFromZakat: false,
            personId: null
          }
        })

        // Create initial movement
        await tx.cashBucketMovement.create({
          data: {
            cashBucketId: newBucket.id,
            amount: systemCash,
            type: 'CASH_IN',
            date: new Date(),
            notes: 'Consolidated from multiple buckets'
          }
        })

        return { success: true, newBucketId: newBucket.id }
      })

      return NextResponse.json({
        success: true,
        message: `Consolidated ${buckets.length} buckets into 1 with balance SAR ${systemCash}`
      })
    }

    return NextResponse.json({
      success: true,
      message: 'Buckets are already consolidated',
      bucketsCount: buckets.length,
      totalBalance,
      systemCash
    })

  } catch (error) {
    console.error('Consolidation error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to consolidate' },
      { status: 500 }
    )
  }
}
