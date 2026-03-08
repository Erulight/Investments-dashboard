import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function POST() {
  try {
    const sukuk = await prisma.investment.findFirst({
      where: {
        name: 'Sukuk2024',
        account: { type: 'SUKUK' },
      },
    })

    if (!sukuk) {
      return NextResponse.json({ error: 'Sukuk2024 not found' }, { status: 404 })
    }

    // Find allocation to get the correct hawl start date
    const allocation = await prisma.investmentBucketAllocation.findFirst({
      where: {
        investmentId: sukuk.id,
      },
      include: {
        cashBucket: {
          select: {
            label: true,
            haulStartDate: true,
          },
        },
      },
    })

    if (!allocation) {
      return NextResponse.json({ error: 'No allocation found for Sukuk2024' }, { status: 404 })
    }

    const haulStartDate = allocation.cashBucket.haulStartDate
    const haulStartIso = new Date(haulStartDate).toISOString().split('T')[0]

    // Update metadata
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
      message: 'Sukuk metadata updated',
      details: {
        sukukId: sukuk.id,
        sukukName: sukuk.name,
        oldMetadata: sukuk.metadata,
        newMetadata: {
          savingsHaulStartDate: haulStartIso,
        },
        sourceBucket: {
          label: allocation.cashBucket.label,
          haulStartDate: allocation.cashBucket.haulStartDate,
        },
      },
    })
  } catch (error) {
    console.error('Fix Sukuk metadata error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fix Sukuk metadata' },
      { status: 500 }
    )
  }
}
