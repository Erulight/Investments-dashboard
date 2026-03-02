import { prisma } from '../lib/db'

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

const toYmdLocal = (d: Date) => {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

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
  const dump = hasFlag('--dump')

  const deleteBucketId = parseArgValue('--delete-bucket-id')
  const fixBucketId = parseArgValue('--fix-bucket-id')
  const fixInvestmentId = parseArgValue('--fix-investment-id')

  const setAllArg = parseArgValue('--set-all')
  const setAllDate = setAllArg ? new Date(setAllArg) : null
  if (setAllArg && (!setAllDate || Number.isNaN(setAllDate.getTime()))) {
    throw new Error('Invalid --set-all date. Use --set-all=YYYY-MM-DD')
  }

  // Buckets to consider: label starts with "Profit •" and created/modified after the bad deployment date.
  // Override with --since=YYYY-MM-DD
  const sinceArg = parseArgValue('--since')
  const since = sinceArg ? new Date(sinceArg) : new Date('2026-03-02')
  if (Number.isNaN(since.getTime())) {
    throw new Error('Invalid --since date. Use --since=YYYY-MM-DD')
  }
  const sinceDay = startOfDay(since)

  console.log(`Mode: ${apply ? 'APPLY' : 'DRY-RUN'}`)
  console.log(`Since: ${toYmdLocal(sinceDay)}`)

  if (deleteBucketId) {
    const bucket = await prisma.cashBucket.findUnique({
      where: { id: deleteBucketId },
      select: { id: true, label: true, balance: true, createdAt: true, haulStartDate: true },
    })

    if (!bucket) {
      console.log(`Bucket not found: ${deleteBucketId}`)
    } else {
      console.log(
        `[DELETE] ${bucket.label || '(no label)'} (${bucket.id})\n` +
          `         balance=${bucket.balance}\n` +
          `         createdAt=${toYmdLocal(startOfDay(new Date(bucket.createdAt)))}\n` +
          `         haulStartDate=${toYmdLocal(startOfDay(new Date(bucket.haulStartDate)))}\n`
      )

      const movementCount = await prisma.cashBucketMovement.count({
        where: { cashBucketId: bucket.id },
      })
      console.log(`         movements=${movementCount}`)

      if (apply) {
        await prisma.cashBucketMovement.deleteMany({
          where: { cashBucketId: bucket.id },
        })
        await prisma.cashBucket.delete({
          where: { id: bucket.id },
        })
        console.log('         deleted')
      } else {
        console.log('         dry-run (not deleted)')
      }
    }

    // Allow combining with other flags in one run.
  }

  if (fixBucketId) {
    if (!fixInvestmentId) {
      throw new Error('Missing --fix-investment-id when using --fix-bucket-id')
    }

    const inv = await prisma.investment.findUnique({
      where: { id: fixInvestmentId },
      select: { id: true, startDate: true, name: true },
    })
    if (!inv) {
      throw new Error(`Investment not found: ${fixInvestmentId}`)
    }

    const start = inv.startDate instanceof Date ? inv.startDate : new Date(inv.startDate as any)
    if (Number.isNaN(start.getTime())) {
      throw new Error(`Invalid investment.startDate for ${fixInvestmentId}`)
    }
    const proposed = startOfDay(start)

    const bucket = await prisma.cashBucket.findUnique({
      where: { id: fixBucketId },
      select: { id: true, label: true, haulStartDate: true, createdAt: true },
    })
    if (!bucket) {
      throw new Error(`Bucket not found: ${fixBucketId}`)
    }

    console.log(
      `[UPDATE] ${bucket.label || '(no label)'} (${bucket.id})\n` +
        `         investment=${inv.name || inv.id} (${inv.id})\n` +
        `         currentHaulStart=${toYmdLocal(startOfDay(new Date(bucket.haulStartDate)))}\n` +
        `         proposedHaulStart=${toYmdLocal(proposed)}\n`
    )

    if (apply) {
      await prisma.cashBucket.update({
        where: { id: bucket.id },
        data: { haulStartDate: proposed },
      })
      console.log('         updated')
    } else {
      console.log('         dry-run (not updated)')
    }
  }

  if ((deleteBucketId || fixBucketId) && !dump) {
    return
  }

  if (dump) {
    const buckets = await prisma.cashBucket.findMany({
      where: { label: { startsWith: 'Profit •' } },
      select: {
        id: true,
        label: true,
        haulStartDate: true,
        createdAt: true,
        movements: {
          select: { type: true, date: true, investmentId: true, amount: true },
          orderBy: { date: 'asc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    })

    console.log(JSON.stringify(buckets, null, 2))
    return
  }

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
    if (setAllDate) {
      const proposed = startOfDay(setAllDate)
      const current = startOfDay(new Date(bucket.haulStartDate))
      const currentStr = toYmdLocal(current)
      const proposedStr = toYmdLocal(proposed)

      if (currentStr !== proposedStr) {
        toFix += 1
        console.log(
          `[FIX]  ${bucket.label} (${bucket.id})\n` +
            `      createdAt=${toYmdLocal(startOfDay(new Date(bucket.createdAt)))}\n` +
            `      currentHaulStart=${currentStr}\n` +
            `      proposedHaulStart=${proposedStr}\n`
        )
        if (apply) {
          await prisma.cashBucket.update({
            where: { id: bucket.id },
            data: { haulStartDate: proposed },
          })
        }
      } else {
        console.log(`[OK]   ${bucket.label} | haulStartDate=${currentStr}`)
      }
      continue
    }

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

    // IMPORTANT:
    // After the debt-profit fix, profit buckets are created with a CASH_IN movement.
    // The original receipt date is authoritative in the Transaction ledger, not in a WITHDRAW_PROFIT movement.
    // So we use Transaction(type=WITHDRAW_PROFIT) to infer the correct receipt date.
    const txCandidate = await prisma.transaction.findFirst({
      where: {
        investmentId,
        type: 'WITHDRAW_PROFIT',
        amount: Math.abs(bucketCashIn.amount),
        date: { lte: bucketCashIn.date },
      },
      orderBy: { date: 'desc' },
      select: { id: true, date: true },
    })

    const fallbackTxCandidate = txCandidate
      ? null
      : await prisma.transaction.findFirst({
          where: {
            investmentId,
            type: 'WITHDRAW_PROFIT',
            amount: Math.abs(bucketCashIn.amount),
          },
          orderBy: { date: 'desc' },
          select: { id: true, date: true },
        })

    const bestReceiptDate = (txCandidate ?? fallbackTxCandidate)?.date ?? bucketCashIn.date

    const proposedHaulStart = startOfDay(new Date(bestReceiptDate))
    const currentHaulStart = startOfDay(new Date(bucket.haulStartDate))

    const currentStr = toYmdLocal(currentHaulStart)
    const proposedStr = toYmdLocal(proposedHaulStart)

    if (currentStr === proposedStr) {
      console.log(`[OK]   ${bucket.label} | haulStartDate=${currentStr}`)
      continue
    }

    toFix += 1

    console.log(
      `[FIX]  ${bucket.label} (${bucket.id})\n` +
        `      createdAt=${toYmdLocal(startOfDay(new Date(bucket.createdAt)))}\n` +
        `      currentHaulStart=${currentStr}\n` +
        `      proposedHaulStart=${proposedStr}\n` +
        `      cashInDate=${toYmdLocal(startOfDay(new Date(bucketCashIn.date)))}\n`
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
