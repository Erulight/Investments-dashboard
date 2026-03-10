import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'
import { createCashBucket, withdrawFromBuckets } from '@/lib/cashBuckets'

const CASH_BALANCE_KEY = 'CASH_BALANCE'

const getBucketScopeWhere = (personId: string | null) => {
  if (personId) {
    return {
      personId,
      NOT: [
        { label: { startsWith: 'Debt •' } },
        { label: 'Partner Commission' },
      ],
    } as any
  }
  return { personId: null } as any
}

const getBucketCashBalance = async (db: any, personId: string | null) => {
  const agg = await db.cashBucket.aggregate({
    where: getBucketScopeWhere(personId),
    _sum: { balance: true },
  })
  const value = Number(agg?._sum?.balance || 0)
  return Number.isFinite(value) ? value : 0
}

const recomputeCashSetting = async (tx: any, personId: string | null) => {
  const key = personId ? `${CASH_BALANCE_KEY}:${personId}` : CASH_BALANCE_KEY
  const balance = await getBucketCashBalance(tx, personId)

  await tx.systemSetting.upsert({
    where: { key },
    update: { value: balance.toString() },
    create: {
      key,
      value: balance.toString(),
      description: 'Available cash balance for investments',
    },
  })

  return balance
}

const getCashAccount = async (tx: any, currency = 'SAR') => {
  const existing = await tx.account.findFirst({
    where: { type: 'CASH', isActive: true },
  })
  if (existing) return existing
  return tx.account.create({
    data: {
      name: 'Cash Balance',
      type: 'CASH',
      currency,
      description: 'Cash ledger account',
    },
  })
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(['OWNER', 'PARTNER'])
    if (user.role === 'PARTNER' && !user.personId) {
      return NextResponse.json({ error: 'Partner is missing a person profile' }, { status: 400 })
    }

    const body = await req.json()
    const rawAmount = Number(body.amount)
    const direction = body.direction === 'FROM_PARTNER' ? 'FROM_PARTNER' : 'TO_PARTNER'
    let partnerPersonId: string | undefined = typeof body.partnerPersonId === 'string' && body.partnerPersonId.trim()
      ? body.partnerPersonId.trim()
      : undefined
    const dateStr = typeof body.date === 'string' && body.date.trim() ? body.date.trim() : undefined
    const notes = typeof body.notes === 'string' ? body.notes.trim() : ''

    if (!Number.isFinite(rawAmount) || rawAmount <= 0) {
      return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 })
    }

    // Resolve partner person scope
    if (!partnerPersonId) {
      if (user.role === 'PARTNER' && user.personId) {
        partnerPersonId = user.personId
      }
    }

    if (!partnerPersonId) {
      return NextResponse.json({ error: 'partnerPersonId is required' }, { status: 400 })
    }

    if (user.personId && partnerPersonId === user.personId) {
      return NextResponse.json({ error: 'Cannot transfer cash with your own profile' }, { status: 400 })
    }

    if (user.role === 'PARTNER' && user.personId && partnerPersonId !== user.personId && direction === 'FROM_PARTNER') {
      return NextResponse.json({ error: 'Partners can only transfer from their own balance' }, { status: 403 })
    }

    if (direction === 'TO_PARTNER' && user.role !== 'OWNER') {
      return NextResponse.json({ error: 'Only owner can send cash to partners' }, { status: 403 })
    }

    const transferDate = dateStr ? new Date(dateStr) : new Date()
    if (Number.isNaN(transferDate.getTime())) {
      return NextResponse.json({ error: 'Invalid transfer date' }, { status: 400 })
    }

    const today = new Date()
    if (transferDate.getTime() > today.getTime()) {
      return NextResponse.json({ error: 'Transfer date cannot be in the future' }, { status: 400 })
    }

    const amount = Math.abs(rawAmount)

    const partner = await prisma.person.findUnique({ where: { id: partnerPersonId } })
    if (!partner) {
      return NextResponse.json({ error: 'Partner not found' }, { status: 404 })
    }

    const currency = 'SAR'

    const result = await prisma.$transaction(async (tx: any) => {
      const cashAccount = await getCashAccount(tx, currency)

      if (direction === 'TO_PARTNER') {
        // Owner sends cash to partner
        // Withdraw from owner buckets so Zakat and buckets stay consistent
        await withdrawFromBuckets(tx, {
          amount,
          currency,
          date: transferDate,
          type: 'CASH_OUT',
          notes,
          availableOnOrBefore: transferDate,
          personId: null,
        })

        // Owner ledger entry
        await tx.transaction.create({
          data: {
            accountId: cashAccount.id,
            investmentId: null,
            personId: null,
            type: 'CASH_TRANSFER_OUT',
            amount: -amount,
            date: transferDate,
            description: notes || `↗ Transfer to ${partner.name}`,
          },
        })

        // Partner bucket: Transfer from Owner
        await createCashBucket(tx, {
          amount,
          haulStartDate: transferDate,
          currency,
          label: 'Transfer from Owner',
          date: transferDate,
          notes,
          type: 'CASH_IN',
          excludeFromZakat: false,
          personId: partnerPersonId,
        })

        // Partner ledger entry
        await tx.transaction.create({
          data: {
            accountId: cashAccount.id,
            investmentId: null,
            personId: partnerPersonId,
            type: 'CASH_TRANSFER_IN',
            amount,
            date: transferDate,
            description: notes || '↙ Transfer from Owner',
          },
        })

        const ownerCashBalance = await recomputeCashSetting(tx, null)
        const partnerCashBalance = await recomputeCashSetting(tx, partnerPersonId)

        return {
          ownerCashBalance,
          partnerCashBalance,
        }
      }

      // FROM_PARTNER: partner sends cash to owner (can be initiated by owner or partner)
      // Withdraw from partner buckets
      await withdrawFromBuckets(tx, {
        amount,
        currency,
        date: transferDate,
        type: 'CASH_OUT',
        notes,
        availableOnOrBefore: transferDate,
        personId: partnerPersonId,
      })

      // Partner ledger entry (outgoing)
      await tx.transaction.create({
        data: {
          accountId: cashAccount.id,
          investmentId: null,
          personId: partnerPersonId,
          type: 'CASH_TRANSFER_OUT',
          amount: -amount,
          date: transferDate,
          description: notes || '↗ Transfer to Owner',
        },
      })

      // Owner bucket: Transfer from Partner
      await createCashBucket(tx, {
        amount,
        haulStartDate: transferDate,
        currency,
        label: 'Transfer from Partner',
        date: transferDate,
        notes,
        type: 'CASH_IN',
        excludeFromZakat: false,
        personId: null,
      })

      // Owner ledger entry (incoming)
      await tx.transaction.create({
        data: {
          accountId: cashAccount.id,
          investmentId: null,
          personId: null,
          type: 'CASH_TRANSFER_IN',
          amount,
          date: transferDate,
          description: notes || `↙ Transfer from ${partner.name}`,
        },
      })

      const ownerCashBalance = await recomputeCashSetting(tx, null)
      const partnerCashBalance = await recomputeCashSetting(tx, partnerPersonId)

      return {
        ownerCashBalance,
        partnerCashBalance,
      }
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error('Cash transfer error:', error)
    if (error instanceof Error) {
      if (error.message === 'INSUFFICIENT_CASH') {
        return NextResponse.json(
          { error: 'Insufficient cash balance for this transfer' },
          { status: 400 },
        )
      }
      if (error.message === 'INSUFFICIENT_CASH_OWNER') {
        return NextResponse.json(
          { error: 'Owner has insufficient cash balance' },
          { status: 400 },
        )
      }
      if (error.message === 'INSUFFICIENT_CASH_PARTNER') {
        return NextResponse.json(
          { error: 'Partner has insufficient cash balance' },
          { status: 400 },
        )
      }
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to perform cash transfer' },
      { status: 500 },
    )
  }
}
