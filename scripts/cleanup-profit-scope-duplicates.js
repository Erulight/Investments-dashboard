const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function main() {
  const needle = process.argv.slice(2).join(' ').trim()

  const where = {
    label: { startsWith: 'Profit •' },
    ...(needle
      ? {
          label: {
            startsWith: 'Profit •',
            contains: needle,
            mode: 'insensitive',
          },
        }
      : {}),
  }

  const profitBuckets = await prisma.cashBucket.findMany({
    where,
    include: {
      movements: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  const byLabel = new Map()
  for (const bucket of profitBuckets) {
    const key = bucket.label || ''
    const list = byLabel.get(key) || []
    list.push(bucket)
    byLabel.set(key, list)
  }

  let deletedBuckets = 0
  let deletedMovements = 0
  let affectedLabels = 0

  for (const [label, buckets] of byLabel.entries()) {
    if (!label || !Array.isArray(buckets) || buckets.length < 2) continue

    const ownerBucket = buckets.find((b) => b.personId === null)
    const nonOwnerBuckets = buckets.filter((b) => b.personId !== null)

    if (!ownerBucket) continue
    if (nonOwnerBuckets.length === 0) continue

    affectedLabels += 1

    for (const dup of nonOwnerBuckets) {
      const movementIds = (dup.movements || []).map((m) => m.id)
      if (movementIds.length > 0) {
        await prisma.cashBucketMovement.deleteMany({
          where: { id: { in: movementIds } },
        })
        deletedMovements += movementIds.length
      }

      await prisma.cashBucket.delete({
        where: { id: dup.id },
      })
      deletedBuckets += 1

      console.log(
        `Deleted duplicate scope bucket for label="${label}": ${dup.id} personId=${dup.personId}`
      )
    }
  }

  // Safety: recompute CASH_BALANCE from current buckets.
  // This avoids having to reason about whether the deleted buckets were
  // accidentally being double-counted in CASH_BALANCE.
  const bucketAgg = await prisma.cashBucket.aggregate({
    _sum: { balance: true },
  })
  const bucketSumRaw = bucketAgg?._sum?.balance
  const bucketSum = Number(bucketSumRaw || 0)

  const existingSetting = await prisma.systemSetting.findUnique({
    where: { key: 'CASH_BALANCE' },
  })

  if (existingSetting) {
    await prisma.systemSetting.update({
      where: { key: 'CASH_BALANCE' },
      data: { value: bucketSum.toString() },
    })
  } else {
    await prisma.systemSetting.create({
      data: {
        key: 'CASH_BALANCE',
        value: bucketSum.toString(),
        description: 'Available cash balance for investments',
      },
    })
  }

  console.log(
    `Done. affectedLabels=${affectedLabels} deletedBuckets=${deletedBuckets} deletedMovements=${deletedMovements} CASH_BALANCE=${bucketSum}`
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    try {
      await prisma.$disconnect()
    } catch {
      // ignore
    }
  })
