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

    // The correct hawl start is the ROSCA first contribution date: 2024-01-01
    const correctHaulStartDate = '2024-01-01'

    // 1. Update Sukuk metadata with correct savingsHaulStartDate
    await prisma.investment.update({
      where: { id: sukuk.id },
      data: {
        metadata: JSON.stringify({
          savingsHaulStartDate: correctHaulStartDate,
        }),
      },
    })

    // 2. Update the Profit bucket's haulStartDate to match ROSCA first contribution
    const profitBucket = await prisma.cashBucket.findFirst({
      where: {
        label: 'Profit • Sukuk2024',
      },
    })

    let profitBucketUpdate = null
    if (profitBucket) {
      await prisma.cashBucket.update({
        where: { id: profitBucket.id },
        data: {
          haulStartDate: new Date(correctHaulStartDate),
        },
      })
      profitBucketUpdate = {
        id: profitBucket.id,
        oldHaulStartDate: profitBucket.haulStartDate,
        newHaulStartDate: correctHaulStartDate,
      }
    }

    // 3. Update any Sukuk Principal Receipt bucket
    const principalReceiptBucket = await prisma.cashBucket.findFirst({
      where: {
        label: { contains: 'Sukuk2024' },
        NOT: { label: 'Profit • Sukuk2024' },
      },
    })

    let principalBucketUpdate = null
    if (principalReceiptBucket) {
      // Principal receipt keeps maturity date as hawl start (new cycle)
      // But if user wants ROSCA date, uncomment below:
      // await prisma.cashBucket.update({
      //   where: { id: principalReceiptBucket.id },
      //   data: { haulStartDate: new Date(correctHaulStartDate) },
      // })
      principalBucketUpdate = {
        id: principalReceiptBucket.id,
        label: principalReceiptBucket.label,
        haulStartDate: principalReceiptBucket.haulStartDate,
        note: 'Kept maturity date as hawl start for principal receipt (new cycle)',
      }
    }

    return NextResponse.json({
      success: true,
      message: 'All Sukuk hawl dates fixed to ROSCA first contribution date',
      details: {
        correctHaulStartDate,
        sukukMetadataUpdated: true,
        profitBucketUpdate,
        principalBucketUpdate,
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
