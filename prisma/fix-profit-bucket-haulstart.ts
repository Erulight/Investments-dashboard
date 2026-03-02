import { prisma } from '../lib/db'

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

const parseArgValue = (name: string) => {
  const idx = process.argv.findIndex((a) => a === name || a.startsWith(`${name}=`))
  if (idx === -1) return null
  const arg = process.argv[idx]
  if (arg.includes('=')) return arg.split('=').slice(1).join('=')
  return process.argv[idx + 1] ?? null
}

const hasFlag = (name: string) => process.argv.includes(name)

async function main() {
  const apply = hasFlag('--apply')

  // Buckets to consider: label starts with "Profit •" and created/modified after the bad deployment date.
  // Override with --since=YYYY-MM-DD
  const sinceArg = parseArgValue('--since')
  const since = sinceArg ? new Date(sinceArg) : new Date('2026-03-02')
  if (Number.isNaN(since.getTime())) {
    throw new Error('Invalid --since date. Use --since=YYYY-MM-DD')
  }
  const sinceDay = startOfDay(since)

  console.log(`Mode: ${apply ? 'APPLY' : 'DRY-RUN'}`)
  console.log(`Since: ${sinceDay.toISOString().split('T')[0]}`)

  const profitBuckets = await prisma.cashBucket.findMany({
    where: {
      label: { startsWith: 'Profit •' },
      OR: [{ createdAt: { gte: sinceDay } }, { haulStartDate: { gte: sinceDay } }],
    },
    select: {
      id: true,
      label: true,
      haulStartDate: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  })

  if (profitBuckets.length === 0) {
    console.log('No matching Profit buckets found.')
    return
  }

  let toFix = 0
  for (const bucket of profitBuckets) {
    const bucketCashIn = await prisma.cashBucketMovement.findFirst({
      where: {
        cashBucketId: bucket.id,
        type: 'CASH_IN',
      },
      orderBy: { date: 'asc' },
      select: {
        id: true,
        date: true,
        amount: true,
        investmentId: true,
      },
    })

    if (!bucketCashIn) {
      console.log(`[SKIP] ${bucket.label} (${bucket.id}) - no CASH_IN movement found on bucket`)
      continue
    }

    const investmentId = bucketCashIn.investmentId
    if (!investmentId) {
      console.log(`[SKIP] ${bucket.label} (${bucket.id}) - CASH_IN movement has no investmentId`)
      continue
    }

    // Try to find the originating WITHDRAW_PROFIT movement that caused this profit bucket.
    // Best-effort matching:
    // - same investmentId
    // - type WITHDRAW_PROFIT
    // - amount matches CASH_IN amount (exact)
    // - pick the latest <= cashIn.date (or latest overall if none)
    const withdrawProfit = await prisma.cashBucketMovement.findFirst({
      where: {
        investmentId,
        type: 'WITHDRAW_PROFIT',
        amount: bucketCashIn.amount,
        date: { lte: bucketCashIn.date },
      },
      orderBy: { date: 'desc' },
      select: { id: true, date: true },
    })

    const fallbackWithdrawProfit = withdrawProfit
      ? null
      : await prisma.cashBucketMovement.findFirst({
          where: {
            investmentId,
            type: 'WITHDRAW_PROFIT',
            amount: bucketCashIn.amount,
          },
          orderBy: { date: 'desc' },
          select: { id: true, date: true },
        })

    const bestWithdraw = withdrawProfit ?? fallbackWithdrawProfit

    const proposedHaulStart = startOfDay(bestWithdraw?.date ?? bucketCashIn.date)
    const currentHaulStart = startOfDay(new Date(bucket.haulStartDate))

    const currentStr = currentHaulStart.toISOString().split('T')[0]
    const proposedStr = proposedHaulStart.toISOString().split('T')[0]

    if (currentStr === proposedStr) {
      console.log(`[OK]   ${bucket.label} | haulStartDate=${currentStr}`)
      continue
    }

    toFix += 1

    console.log(
      `[FIX]  ${bucket.label} (${bucket.id})\n` +
        `      createdAt=${startOfDay(new Date(bucket.createdAt)).toISOString().split('T')[0]}\n` +
        `      currentHaulStart=${currentStr}\n` +
        `      proposedHaulStart=${proposedStr}\n` +
        `      cashInDate=${startOfDay(new Date(bucketCashIn.date)).toISOString().split('T')[0]}\n` +
        `      withdrawProfitDate=${bestWithdraw ? startOfDay(new Date(bestWithdraw.date)).toISOString().split('T')[0] : 'N/A'}\n`
    )

    if (apply) {
      await prisma.cashBucket.update({
        where: { id: bucket.id },
        data: { haulStartDate: proposedHaulStart },
      })
    }
  }

  console.log(`Done. Buckets needing changes: ${toFix}. ${apply ? 'Updates applied.' : 'Dry-run only (no updates).'} `)
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
