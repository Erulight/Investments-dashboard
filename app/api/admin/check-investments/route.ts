import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  try {
    // Get ALL investments to see what's in the database
    const allInvestments = await prisma.investment.findMany({
      include: {
        account: { select: { type: true, name: true } }
      }
    })

    // Get only non-CASH investments (what should be counted)
    const nonCashInvestments = await prisma.investment.findMany({
      where: {
        account: { type: { not: 'CASH' } }
      },
      include: {
        account: { select: { type: true, name: true } }
      }
    })

    // Get CASH investments (what shouldn't be counted)
    const cashInvestments = await prisma.investment.findMany({
      where: {
        account: { type: 'CASH' }
      },
      include: {
        account: { select: { type: true, name: true } }
      }
    })

    return NextResponse.json({
      totalInvestments: allInvestments.length,
      nonCashCount: nonCashInvestments.length,
      cashCount: cashInvestments.length,
      allInvestments: allInvestments.map(inv => ({
        id: inv.id,
        name: inv.name,
        principalAmount: inv.principalAmount,
        accountType: inv.account.type,
        accountName: inv.account.name
      })),
      cashInvestments: cashInvestments.map(inv => ({
        id: inv.id,
        name: inv.name,
        principalAmount: inv.principalAmount,
        accountType: inv.account.type,
        accountName: inv.account.name
      }))
    })
  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
