export const CASH_BALANCE_KEY = 'CASH_BALANCE'

export const getCashSettingKey = (personId: string | null) =>
  personId ? `${CASH_BALANCE_KEY}:${personId}` : CASH_BALANCE_KEY

export const getBucketScopeWhere = (personId: string | null) => {
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

export const getBucketCashBalance = async (db: any, personId: string | null) => {
  const agg = await db.cashBucket.aggregate({
    where: getBucketScopeWhere(personId),
    _sum: { balance: true },
  })

  const value = Number(agg?._sum?.balance || 0)
  return Number.isFinite(value) ? value : 0
}

export const recomputeCashSetting = async (tx: any, personId: string | null) => {
  const key = getCashSettingKey(personId)
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
