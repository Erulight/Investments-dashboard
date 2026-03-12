import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

/**
 * DELETE /api/admin/reset-test-owner
 * Deletes all data for the authenticated OWNER user (test owner cleanup)
 * WARNING: This is destructive and cannot be undone!
 */
export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuth(['OWNER'])
    
    if (!user.personId) {
      return NextResponse.json(
        { error: 'This owner account has no person profile (legacy account). Cannot reset.' },
        { status: 400 }
      )
    }

    // Confirm this is not the main owner by checking if they explicitly request deletion
    const body = await req.json().catch(() => ({}))
    const confirmEmail = body.confirmEmail

    if (confirmEmail !== user.email) {
      return NextResponse.json(
        { error: 'Email confirmation does not match. Please confirm your email to proceed.' },
        { status: 400 }
      )
    }

    // Delete all data associated with this owner's personId in reverse dependency order
    const result = await prisma.$transaction(async (tx) => {
      const personId = user.personId!

      // 1. Delete audit logs
      const auditLogs = await tx.auditLog.deleteMany({
        where: { userId: user.id },
      })

      // 2. Delete debt payments (via debt relation)
      const debts = await tx.debt.findMany({
        where: {
          cashBucket: {
            personId: personId,
          },
        },
        select: { id: true },
      })
      const debtIds = debts.map(d => d.id)
      const debtPayments = await tx.debtPayment.deleteMany({
        where: { debtId: { in: debtIds } },
      })

      // 3. Delete debts
      const deletedDebts = await tx.debt.deleteMany({
        where: {
          cashBucket: {
            personId: personId,
          },
        },
      })

      // 4. Get all investments owned by this person (via DealParticipant or owner-created)
      const ownedInvestments = await tx.investment.findMany({
        where: {
          OR: [
            {
              dealParticipants: {
                some: { personId: personId },
              },
            },
            {
              transactions: {
                some: {
                  personId: personId,
                  type: { in: ['INVEST_IN', 'CASH_IN', 'INVEST_OUT'] },
                },
              },
            },
          ],
        },
        select: { id: true },
      })
      const investmentIds = ownedInvestments.map(inv => inv.id)

      // 5. Delete cash bucket movements for this person's buckets
      const cashBucketMovements = await tx.cashBucketMovement.deleteMany({
        where: {
          cashBucket: {
            personId: personId,
          },
        },
      })

      // 6. Delete investment bucket allocations for this person's buckets
      const investmentBucketAllocations = await tx.investmentBucketAllocation.deleteMany({
        where: {
          cashBucket: {
            personId: personId,
          },
        },
      })

      // 7. Delete cash buckets
      const cashBuckets = await tx.cashBucket.deleteMany({
        where: { personId: personId },
      })

      // 8. Delete transactions
      const transactions = await tx.transaction.deleteMany({
        where: {
          OR: [
            { personId: personId },
            { investmentId: { in: investmentIds } },
          ],
        },
      })

      // 9. Delete deal participants
      const dealParticipants = await tx.dealParticipant.deleteMany({
        where: {
          OR: [
            { personId: personId },
            { investmentId: { in: investmentIds } },
          ],
        },
      })

      // 10. Delete remaining allocations for owned investments
      const remainingAllocations = await tx.investmentBucketAllocation.deleteMany({
        where: { investmentId: { in: investmentIds } },
      })

      // 11. Delete remaining movements for owned investments
      const remainingMovements = await tx.cashBucketMovement.deleteMany({
        where: { investmentId: { in: investmentIds } },
      })

      // 12. Delete investments
      const investments = await tx.investment.deleteMany({
        where: { id: { in: investmentIds } },
      })

      // 13. Delete accounts owned by this person (check if any transactions reference them)
      const accounts = await tx.account.findMany({
        where: {
          transactions: {
            every: {
              OR: [
                { personId: personId },
                { investmentId: { in: investmentIds } },
              ],
            },
          },
        },
        select: { id: true },
      })
      const accountIds = accounts.map(a => a.id)

      // Delete valuations for these accounts
      const valuations = await tx.valuation.deleteMany({
        where: { accountId: { in: accountIds } },
      })

      // Delete the accounts themselves
      const deletedAccounts = await tx.account.deleteMany({
        where: { id: { in: accountIds } },
      })

      // 14. Finally, delete the person entity itself
      const person = await tx.person.delete({
        where: { id: personId },
      })

      // 15. Delete the user account
      const deletedUser = await tx.user.delete({
        where: { id: user.id },
      })

      return {
        success: true,
        deleted: {
          auditLogs: auditLogs.count,
          debtPayments: debtPayments.count,
          debts: deletedDebts.count,
          cashBucketMovements: cashBucketMovements.count,
          investmentBucketAllocations: investmentBucketAllocations.count + remainingAllocations.count,
          cashBuckets: cashBuckets.count,
          transactions: transactions.count,
          dealParticipants: dealParticipants.count,
          investments: investments.count,
          valuations: valuations.count,
          accounts: deletedAccounts.count,
          person: person.id,
          user: deletedUser.id,
        },
      }
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error('Reset test owner error:', error)

    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to reset test owner data',
      },
      { status: 500 }
    )
  }
}
