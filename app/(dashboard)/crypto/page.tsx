import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { requireModuleAccess } from '@/lib/rbac'
import { CryptoPortfolioClient } from '@/components/crypto/CryptoPortfolioClient'
import type { Prisma } from '@prisma/client'
import { withdrawFromBuckets } from '@/lib/cashBuckets'

const CASH_BALANCE_KEY = 'CASH_BALANCE'

const getCashAccount = async (tx: Prisma.TransactionClient, currency = 'SAR') => {
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

export default async function CryptoPage() {
  await requireModuleAccess('crypto')
  const user = await getCurrentUser()
  
  if (!user) {
    return null
  }

  const portfolio = await prisma.investment.findFirst({
    where: {
      account: { type: 'CRYPTO', isActive: true },
      OR: [
        { category: 'CRYPTO_PORTFOLIO' },
        { metadata: { contains: 'CRYPTO_PORTFOLIO' } },
      ],
    },
    include: { account: true },
    orderBy: { createdAt: 'desc' },
  })

  const cryptoAccount = await prisma.account.findFirst({
    where: { type: 'CRYPTO', isActive: true },
    orderBy: { createdAt: 'asc' },
  })

  const fixedStart = new Date('2025-09-01T00:00:00.000Z')
  const initialValue = 7500

  const ensured = portfolio
    ? portfolio
    : (user.role === 'OWNER' && cryptoAccount)
      ? await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
          const created = await tx.investment.create({
            data: {
              accountId: cryptoAccount.id,
              name: 'Crypto Portfolio',
              principalAmount: initialValue,
              currentValue: initialValue,
              startDate: fixedStart,
              category: 'CRYPTO_PORTFOLIO',
              metadata: JSON.stringify({
                type: 'CRYPTO_PORTFOLIO',
                investedAmount: initialValue,
                currentValue: initialValue,
                haulStartAt: fixedStart.toISOString(),
                zakatPayments: [],
                history: [
                  {
                    at: fixedStart.toISOString(),
                    action: 'CREATE',
                    currentValue: initialValue,
                  },
                ],
              }),
            },
            include: { account: true },
          })

          const currency = created.account?.currency || 'SAR'

          await withdrawFromBuckets(tx, {
            amount: initialValue,
            currency,
            date: fixedStart,
            type: 'INVEST_OUT',
            investmentId: created.id,
            notes: `Crypto Deposit • ${created.name}`,
            availableOnOrBefore: fixedStart,
          })

          const setting = await tx.systemSetting.findUnique({ where: { key: CASH_BALANCE_KEY } })
          const currentCash = setting ? Number(setting.value) : 0
          const nextCash = currentCash - initialValue
          if (nextCash < 0) {
            throw new Error('INSUFFICIENT_CASH')
          }
          if (setting) {
            await tx.systemSetting.update({
              where: { key: CASH_BALANCE_KEY },
              data: { value: nextCash.toString() },
            })
          } else {
            await tx.systemSetting.create({
              data: {
                key: CASH_BALANCE_KEY,
                value: nextCash.toString(),
                description: 'Available cash balance for investments',
              },
            })
          }

          const cashAccount = await getCashAccount(tx, currency)
          await tx.transaction.create({
            data: {
              accountId: cashAccount.id,
              investmentId: created.id,
              personId: user.personId || null,
              type: 'INVEST_OUT',
              amount: -initialValue,
              date: fixedStart,
              description: `Crypto Deposit • ${created.name}`,
            },
          })

          return created
        })
      : null

  if (!ensured) {
    return (
      <div className="p-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h1 className="text-2xl font-bold text-gray-900">Crypto Portfolio</h1>
          <p className="text-sm text-gray-600 mt-2">
            No crypto portfolio found. As an OWNER, create an active CRYPTO account type first.
          </p>
        </div>
      </div>
    )
  }

  const transformed = {
    ...ensured,
    startDate: ensured.startDate.toISOString(),
    metadata: ensured.metadata || undefined,
  }

  return (
    <div className="p-6">
      <CryptoPortfolioClient investment={transformed as any} />
    </div>
  )
}
