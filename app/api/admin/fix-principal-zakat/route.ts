import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

export const dynamic = 'force-dynamic'

// GET: Preview what will be fixed
export async function GET() {
  try {
    await requireAuth(['OWNER'])

    // Find buckets with principal withdrawal movements but excluded from Zakat
    const bucketsWithPrincipalWithdrawals = await prisma.cashBucket.findMany({
      where: {
        excludeFromZakat: true,
        balance: { gt: 0 },
        movements: {
          some: {
            type: { in: ['WITHDRAW_PRINCIPAL', 'ROLLBACK_PRINCIPAL'] },
          },
        },
      },
      include: {
        movements: {
          where: {
            type: { in: ['WITHDRAW_PRINCIPAL', 'ROLLBACK_PRINCIPAL'] },
          },
        },
      },
    })

    return NextResponse.json({
      message: 'Preview of buckets to fix',
      count: bucketsWithPrincipalWithdrawals.length,
      buckets: bucketsWithPrincipalWithdrawals.map((b) => ({
        id: b.id,
        label: b.label,
        balance: b.balance,
        haulStartDate: b.haulStartDate,
        excludeFromZakat: b.excludeFromZakat,
        principalWithdrawals: b.movements.map((m) => ({
          amount: m.amount,
          date: m.date,
          type: m.type,
        })),
      })),
      action: 'Call POST /api/admin/fix-principal-zakat to update these buckets',
    })
  } catch (error) {
    console.error('Fix principal zakat preview error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

// POST: Actually fix the buckets
export async function POST() {
  try {
    await requireAuth(['OWNER'])

    // Find buckets with principal withdrawal movements but excluded from Zakat
    const bucketsWithPrincipalWithdrawals = await prisma.cashBucket.findMany({
      where: {
        excludeFromZakat: true,
        balance: { gt: 0 },
        movements: {
          some: {
            type: { in: ['WITHDRAW_PRINCIPAL', 'ROLLBACK_PRINCIPAL'] },
          },
        },
      },
      select: { id: true, label: true, balance: true },
    })

    if (bucketsWithPrincipalWithdrawals.length === 0) {
      return NextResponse.json({
        message: 'No buckets found to fix',
        updated: 0,
      })
    }

    const bucketIds = bucketsWithPrincipalWithdrawals.map((b) => b.id)

    // Update buckets to not exclude from Zakat
    const result = await prisma.cashBucket.updateMany({
      where: { id: { in: bucketIds } },
      data: { excludeFromZakat: false },
    })

    return NextResponse.json({
      message: 'Successfully updated buckets to include in Zakat calculation',
      updated: result.count,
      buckets: bucketsWithPrincipalWithdrawals.map((b) => ({
        id: b.id,
        label: b.label,
        balance: b.balance,
      })),
    })
  } catch (error) {
    console.error('Fix principal zakat error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
