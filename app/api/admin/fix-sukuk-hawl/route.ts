import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST() {
  // Find Sukuk2024 investment
  const inv = await prisma.investment.findFirst({
    where: { name: { contains: 'Sukuk2024' } }
  })

  if (!inv) {
    return NextResponse.json({ error: 'Investment not found' }, { status: 404 })
  }

  // Update metadata with savingsHaulStartDate
  await prisma.investment.update({
    where: { id: inv.id },
    data: {
      metadata: JSON.stringify({ savingsHaulStartDate: '2024-01-01' })
    }
  })

  // Update all buckets for this investment
  const updated = await prisma.cashBucket.updateMany({
    where: { label: { contains: 'Sukuk2024' } },
    data: { haulStartDate: new Date('2024-01-01') }
  })

  return NextResponse.json({
    success: true,
    investmentId: inv.id,
    bucketsUpdated: updated.count
  })
}
