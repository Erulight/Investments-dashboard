import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  const buckets = await prisma.cashBucket.findMany({
    where: { label: { startsWith: 'Profit •' } },
    select: {
      id: true,
      label: true,
      haulStartDate: true,
      movements: {
        where: { type: 'CASH_IN' },
        select: {
          date: true,
          investment: {
            select: { name: true, startDate: true },
          },
        },
      },
    },
  })

  // Also log to server console as requested
  console.log(JSON.stringify(buckets, null, 2))

  return NextResponse.json(buckets, { status: 200 })
}
