import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

export async function POST() {
  try {
    await requireAuth(['OWNER'])
    
    const today = new Date()
    const oneYearFromNow = new Date()
    oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1)

    // Find clearly wrong transactions (beyond 1 year)
    const wrongTx = await prisma.transaction.findMany({
      where: { date: { gt: oneYearFromNow } },
      select: { 
        id: true, 
        date: true, 
        type: true, 
        amount: true, 
        description: true, 
        createdAt: true,
        investment: { select: { name: true } }
      },
    })

    // Find clearly wrong movements
    const wrongMovements = await prisma.cashBucketMovement.findMany({
      where: { date: { gt: oneYearFromNow } },
      select: { 
        id: true, 
        date: true, 
        type: true, 
        amount: true, 
        createdAt: true,
        investment: { select: { name: true } }
      },
    })

    const fixes: any[] = []

    // Fix transactions
    for (const tx of wrongTx) {
      const createdDate = new Date(tx.createdAt)
      const newDate = createdDate <= today ? createdDate : today
      
      await prisma.transaction.update({
        where: { id: tx.id },
        data: { date: newDate },
      })
      
      fixes.push({
        type: 'transaction',
        investment: tx.investment?.name,
        txType: tx.type,
        amount: tx.amount,
        oldDate: tx.date.toISOString().split('T')[0],
        newDate: newDate.toISOString().split('T')[0],
      })
    }

    // Fix movements
    for (const mov of wrongMovements) {
      const createdDate = new Date(mov.createdAt)
      const newDate = createdDate <= today ? createdDate : today
      
      await prisma.cashBucketMovement.update({
        where: { id: mov.id },
        data: { date: newDate },
      })
      
      fixes.push({
        type: 'movement',
        investment: mov.investment?.name,
        movType: mov.type,
        amount: mov.amount,
        oldDate: mov.date.toISOString().split('T')[0],
        newDate: newDate.toISOString().split('T')[0],
      })
    }

    return NextResponse.json({
      success: true,
      message: `Fixed ${fixes.length} entries with future dates beyond 1 year`,
      fixes,
    })
  } catch (error) {
    console.error('Fix 2028 dates error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fix dates' },
      { status: 500 }
    )
  }
}
