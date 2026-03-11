import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  const buckets = await prisma.cashBucket.findMany({
    where: {
      OR: [
        { label: { contains: 'Sukuk2024' } },
        { label: { contains: 'Savings Receipt' } },
        { label: { contains: 'Circlys Reward' } },
      ],
    },
    select: {
      id: true,
      label: true,
      balance: true,
      haulStartDate: true,
      excludeFromZakat: true,
      personId: true,
      allocations: {
        select: {
          principalAllocated: true,
          principalRemaining: true,
          investment: {
            select: { id: true, name: true, startDate: true, metadata: true },
          },
        },
      },
    },
  })

  const investment = await prisma.investment.findFirst({
    where: { name: { contains: 'Sukuk2024' } },
    select: {
      id: true,
      name: true,
      startDate: true,
      metadata: true,
      receivableAmount: true,
      principalAmount: true,
    },
  })

  return NextResponse.json({ buckets, investment }, { status: 200 })
}
