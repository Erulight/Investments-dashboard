import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function POST() {
  try {
    // Find the Savings Receipt bucket
    const roscaBucket = await prisma.cashBucket.findFirst({
      where: {
        label: 'Savings Receipt • 2024',
      },
    })

    if (!roscaBucket) {
      return NextResponse.json({ error: 'ROSCA bucket not found' }, { status: 404 })
    }

    // Find the WITHDRAW_PRINCIPAL movement
    const withdrawMovement = await prisma.cashBucketMovement.findFirst({
      where: {
        cashBucketId: roscaBucket.id,
        type: 'WITHDRAW_PRINCIPAL',
        investmentId: 'cmmi7z17i0002tdtk0ulpxqu1', // Sukuk2024
      },
    })

    if (!withdrawMovement) {
      return NextResponse.json({ error: 'Sukuk withdrawal movement not found' }, { status: 404 })
    }

    const withdrawAmount = Math.abs(Number(withdrawMovement.amount) || 0)
    const withdrawDate = withdrawMovement.date

    // Create a new bucket for the Sukuk principal receipt
    const sukukReceiptBucket = await prisma.cashBucket.create({
      data: {
        label: 'Sukuk2024 Principal Receipt',
        balance: withdrawAmount,
        haulStartDate: withdrawDate,
        excludeFromZakat: false,
        personId: null,
      },
    })

    // Move the WITHDRAW_PRINCIPAL movement to the new bucket
    await prisma.cashBucketMovement.update({
      where: { id: withdrawMovement.id },
      data: { cashBucketId: sukukReceiptBucket.id },
    })

    // Update ROSCA bucket balance (remove the 5k that was moved)
    const newRoscaBalance = Number(roscaBucket.balance) - withdrawAmount
    await prisma.cashBucket.update({
      where: { id: roscaBucket.id },
      data: { balance: newRoscaBalance },
    })

    return NextResponse.json({
      success: true,
      message: 'Sukuk receipt split successfully',
      details: {
        roscaBucket: {
          id: roscaBucket.id,
          label: roscaBucket.label,
          oldBalance: roscaBucket.balance,
          newBalance: newRoscaBalance,
        },
        sukukReceiptBucket: {
          id: sukukReceiptBucket.id,
          label: sukukReceiptBucket.label,
          balance: sukukReceiptBucket.balance,
          haulStartDate: sukukReceiptBucket.haulStartDate,
        },
        withdrawAmount,
      },
    })
  } catch (error) {
    console.error('Split Sukuk receipt error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to split Sukuk receipt' },
      { status: 500 }
    )
  }
}
