import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

export async function GET(req: NextRequest) {
  try {
    await requireAuth(['OWNER'])

    // Get cash account
    const cashAccount = await prisma.account.findFirst({
      where: { type: 'CASH' }
    })

    if (!cashAccount) {
      return NextResponse.json({ error: 'No cash account found' }, { status: 404 })
    }

    // Get all transactions
    const txs = await prisma.transaction.findMany({
      where: { accountId: cashAccount.id },
      orderBy: { date: 'asc' },
      select: {
        type: true,
        amount: true,
        date: true,
        description: true
      }
    })

    // Calculate running balance
    let running = 0
    const txDetails = txs.map(t => {
      running += t.amount
      return {
        type: t.type,
        amount: t.amount,
        running: running,
        description: t.description,
        date: t.date.toISOString().split('T')[0]
      }
    })

    // Get system setting
    const setting = await prisma.systemSetting.findUnique({
      where: { key: 'CASH_BALANCE' }
    })

    const systemBalance = Number(setting?.value || 0)
    const transactionSum = running
    const discrepancy = systemBalance - transactionSum

    // Get debts
    const debts = await prisma.debt.findMany({
      select: {
        id: true,
        lenderName: true,
        amount: true,
        payments: { select: { amount: true } }
      }
    })

    const totalDebts = debts.reduce((sum, d) => sum + d.amount, 0)
    const totalPaid = debts.reduce((sum, d) => sum + d.payments.reduce((s: number, p: any) => s + p.amount, 0), 0)
    const totalOutstanding = totalDebts - totalPaid

    return NextResponse.json({
      cashAccount: {
        id: cashAccount.id,
        name: cashAccount.name,
        type: cashAccount.type
      },
      systemSetting: {
        key: 'CASH_BALANCE',
        value: setting?.value || 'Not found',
        valueAsNumber: systemBalance
      },
      transactions: {
        count: txs.length,
        sum: transactionSum,
        details: txDetails
      },
      debts: {
        list: debts.map(d => ({
          lender: d.lenderName,
          amount: d.amount,
          paid: d.payments.reduce((s: number, p: any) => s + p.amount, 0),
          outstanding: d.amount - d.payments.reduce((s: number, p: any) => s + p.amount, 0)
        })),
        totalDebts: totalDebts,
        totalPaid: totalPaid,
        totalOutstanding: totalOutstanding
      },
      analysis: {
        systemBalance: systemBalance,
        transactionSum: transactionSum,
        discrepancy: discrepancy,
        expectedBalance: totalOutstanding,
        isBalanceCorrect: Math.abs(discrepancy) < 0.01,
        isBalanceMatchesDebts: Math.abs(systemBalance - totalOutstanding) < 0.01
      }
    })
  } catch (error) {
    console.error('Verify cash balance error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to verify cash balance' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth(['OWNER'])

    const body = await req.json().catch(() => ({})) as any
    const action = body?.action

    if (action === 'fix') {
      // Get debts to calculate correct balance
      const debts = await prisma.debt.findMany({
        select: {
          amount: true,
          payments: { select: { amount: true } }
        }
      })

      const totalDebts = debts.reduce((sum, d) => sum + d.amount, 0)
      const totalPaid = debts.reduce((sum, d) => sum + d.payments.reduce((s: number, p: any) => s + p.amount, 0), 0)
      const correctBalance = totalDebts - totalPaid

      // Update system setting
      const setting = await prisma.systemSetting.upsert({
        where: { key: 'CASH_BALANCE' },
        update: { value: correctBalance.toString() },
        create: {
          key: 'CASH_BALANCE',
          value: correctBalance.toString(),
          description: 'Available cash balance for investments'
        }
      })

      return NextResponse.json({
        success: true,
        message: `Fixed CASH_BALANCE to SAR ${correctBalance}`,
        previousValue: body?.previousValue,
        newValue: setting.value,
        calculation: {
          totalDebts: totalDebts,
          totalPaid: totalPaid,
          outstanding: correctBalance
        }
      })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    console.error('Fix cash balance error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fix cash balance' },
      { status: 500 }
    )
  }
}
