import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(['OWNER', 'PARTNER'])
    if (user.role === 'PARTNER' && !user.personId) {
      return NextResponse.json({ error: 'Partner is missing a person profile' }, { status: 400 })
    }

    const { id } = await params

    const bucket = await prisma.cashBucket.findFirst({
      where: {
        id,
        ...(user.role === 'OWNER'
          ? { personId: null }
          : { personId: user.personId }),
      },
      select: {
        id: true,
        label: true,
        currency: true,
        balance: true,
        haulStartDate: true,
        lastZakatPaidDate: true,
        createdAt: true,
        updatedAt: true,
        movements: {
          orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
          include: {
            investment: {
              select: {
                id: true,
                name: true,
                isIjarah: true,
                reopenedAt: true,
              },
            },
          },
        },
      },
    })

    if (!bucket) {
      return NextResponse.json({ error: 'Bucket not found' }, { status: 404 })
    }

    const transactions = await prisma.transaction.findMany({
      where: {
        ...(user.role === 'PARTNER' ? { personId: user.personId } : {}),
        metadata: { contains: id },
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        type: true,
        amount: true,
        date: true,
        description: true,
        metadata: true,
        investmentId: true,
        personId: true,
        createdAt: true,
      },
      take: 500,
    })

    return NextResponse.json({ bucket, transactions })
  } catch (error) {
    console.error('Zakat bucket details error:', error)

    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    return NextResponse.json(
      { error: 'Failed to fetch bucket details' },
      { status: 500 }
    )
  }
}
