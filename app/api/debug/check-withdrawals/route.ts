import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  try {
    const buckets = await prisma.cashBucket.findMany({
      where: {
        personId: null,
        OR: [
          { label: 'General Cash' },
          { label: null }
        ]
      },
      include: {
        movements: {
          orderBy: { date: 'asc' }
        }
      }
    })

    const results = []
    
    for (const bucket of buckets) {
      const start = new Date(bucket.haulStartDate)
      const now = new Date()
      const dayMs = 1000 * 60 * 60 * 24
      const elapsed = Math.floor((now.getTime() - start.getTime()) / dayMs)
      const completedHawls = Math.floor(elapsed / 354)
      
      const hawlData = []
      
      for (let i = 0; i < completedHawls; i++) {
        const hawlStart = new Date(start)
        hawlStart.setDate(hawlStart.getDate() + (i * 354))
        const hawlEnd = new Date(hawlStart)
        hawlEnd.setDate(hawlEnd.getDate() + 354)
        
        const cashInBeforeEnd = bucket.movements
          .filter(m => {
            const mDate = new Date(m.date)
            return m.type === 'CASH_IN' && mDate <= hawlEnd
          })
          .reduce((sum, m) => sum + Number(m.amount), 0)
        
        const outflowsBeforeEnd = bucket.movements
          .filter(m => {
            const isOutflow = ['CASH_OUT', 'INVEST_OUT', 'DEBT_OUT'].includes(m.type)
            const mDate = new Date(m.date)
            return isOutflow && mDate <= hawlEnd
          })
        
        const totalOutflows = outflowsBeforeEnd.reduce((sum, m) => sum + Math.abs(Number(m.amount)), 0)
        const heldForFullHawl = Math.max(0, cashInBeforeEnd - totalOutflows)
        const expectedZakat = heldForFullHawl * 0.025
        
        hawlData.push({
          hawlNumber: i + 1,
          hawlStart: hawlStart.toISOString().split('T')[0],
          hawlEnd: hawlEnd.toISOString().split('T')[0],
          cashInBeforeEnd,
          totalOutflows,
          heldForFullHawl,
          expectedZakat,
          outflows: outflowsBeforeEnd.map(m => ({
            date: new Date(m.date).toISOString().split('T')[0],
            type: m.type,
            amount: m.amount,
            notes: m.notes
          }))
        })
      }
      
      results.push({
        bucketId: bucket.id,
        label: bucket.label,
        balance: bucket.balance,
        haulStartDate: bucket.haulStartDate.toISOString().split('T')[0],
        completedHawls,
        hawls: hawlData,
        allMovements: bucket.movements.map(m => ({
          date: new Date(m.date).toISOString().split('T')[0],
          type: m.type,
          amount: m.amount,
          notes: m.notes
        }))
      })
    }
    
    return NextResponse.json(results, { status: 200 })
  } catch (error) {
    console.error('Check withdrawals error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to check withdrawals' },
      { status: 500 }
    )
  }
}
