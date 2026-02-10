import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { requireModuleAccess } from '@/lib/rbac'
import { CryptoPortfolioClient } from '@/components/crypto/CryptoPortfolioClient'

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
      ? await prisma.investment.create({
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
