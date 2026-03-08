import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function POST() {
  try {
    // Find Sukuk2024
    const sukuk = await prisma.investment.findFirst({
      where: {
        name: 'Sukuk2024',
        account: { type: 'SUKUK' },
      },
    })

    if (!sukuk) {
      return NextResponse.json({ error: 'Sukuk2024 not found' }, { status: 404 })
    }

    // Find the INVEST_OUT movement that created this Sukuk
    const investMovement = await prisma.cashBucketMovement.findFirst({
      where: {
        investmentId: sukuk.id,
        type: 'INVEST_OUT',
      },
      include: {
        cashBucket: {
          select: {
            id: true,
            label: true,
            haulStartDate: true,
          },
        },
      },
    })

    if (!investMovement) {
      return NextResponse.json({ error: 'No INVEST_OUT movement found for Sukuk2024' }, { status: 404 })
    }

    const sourceBucket = investMovement.cashBucket
    const investedAmount = Math.abs(Number(investMovement.amount) || 0)

    // Check if allocation already exists
    const existingAllocation = await prisma.investmentBucketAllocation.findFirst({
      where: {
        investmentId: sukuk.id,
        cashBucketId: sourceBucket.id,
      },
    })

    if (existingAllocation) {
      return NextResponse.json({
        success: false,
        message: 'Allocation already exists',
        allocation: existingAllocation,
      })
    }

    // Create the allocation
    const allocation = await prisma.investmentBucketAllocation.create({
      data: {
        investmentId: sukuk.id,
        cashBucketId: sourceBucket.id,
        principalAllocated: investedAmount,
        principalRemaining: investedAmount,
      },
    })

    // Update Sukuk metadata with correct hawl start date
    const haulStartDate = sourceBucket.haulStartDate
    const haulStartIso = new Date(haulStartDate).toISOString().split('T')[0]

    await prisma.investment.update({
      where: { id: sukuk.id },
      data: {
        metadata: JSON.stringify({
          savingsHaulStartDate: haulStartIso,
        }),
      },
    })

    return NextResponse.json({
      success: true,
      message: 'Allocation reconstructed and metadata updated',
      details: {
        sukukId: sukuk.id,
        sukukName: sukuk.name,
        sourceBucket: {
          id: sourceBucket.id,
          label: sourceBucket.label,
          haulStartDate: sourceBucket.haulStartDate,
        },
        allocation: {
          id: allocation.id,
          principalAllocated: allocation.principalAllocated,
          principalRemaining: allocation.principalRemaining,
        },
        updatedMetadata: {
          savingsHaulStartDate: haulStartIso,
        },
      },
    })
  } catch (error) {
    console.error('Reconstruct allocations error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to reconstruct allocations' },
      { status: 500 }
    )
  }
}
