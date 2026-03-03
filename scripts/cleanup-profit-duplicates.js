const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

async function main() {
  const needle = process.argv.slice(2).join(' ').trim()

  const investments = needle
    ? await prisma.investment.findMany({
        where: { name: { contains: needle, mode: 'insensitive' } },
        select: { id: true, name: true, reopenedAt: true },
      })
    : await prisma.investment.findMany({
        select: { id: true, name: true, reopenedAt: true },
      })

  const investmentMap = new Map(investments.map((inv) => [inv.id, inv]))

  const profitBuckets = await prisma.cashBucket.findMany({
    where: { label: { startsWith: 'Profit •' } },
    include: { movements: { orderBy: { createdAt: 'asc' } } },
  })

  let deletedCount = 0
  let fixedBuckets = 0

  for (const bucket of profitBuckets) {
    const cashIns = (bucket.movements || []).filter((m) => m.type === 'CASH_IN')
    if (cashIns.length <= 1) continue

    const groups = new Map()
    for (const m of cashIns) {
      const key = `${m.investmentId || 'null'}|${Number(m.amount)}`
      const list = groups.get(key) || []
      list.push(m)
      groups.set(key, list)
    }

    const toDeleteIds = []

    for (const [key, list] of groups.entries()) {
      if (!Array.isArray(list) || list.length <= 1) continue

      const [investmentId] = String(key).split('|')
      const inv = investmentId && investmentId !== 'null' ? investmentMap.get(investmentId) : null
      const reopenedAt = inv?.reopenedAt ? new Date(inv.reopenedAt) : null
      const reopenedAtValid = reopenedAt && !Number.isNaN(reopenedAt.getTime()) ? reopenedAt : null

      const sorted = [...list].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())

      let keeper = null
      if (reopenedAtValid) {
        const after = sorted.filter((m) => new Date(m.createdAt).getTime() >= reopenedAtValid.getTime())
        if (after.length > 0) keeper = after[after.length - 1]
      }
      if (!keeper) keeper = sorted[sorted.length - 1]

      for (const m of sorted) {
        if (m.id !== keeper.id) toDeleteIds.push(m.id)
      }
    }

    if (toDeleteIds.length === 0) continue

    await prisma.cashBucketMovement.deleteMany({
      where: { id: { in: toDeleteIds } },
    })

    const remainingSum = await prisma.cashBucketMovement.aggregate({
      where: { cashBucketId: bucket.id },
      _sum: { amount: true },
    })

    const correctBalance = Number(remainingSum?._sum?.amount || 0)

    await prisma.cashBucket.update({
      where: { id: bucket.id },
      data: { balance: correctBalance },
    })

    deletedCount += toDeleteIds.length
    fixedBuckets += 1
    console.log(`Fixed bucket ${bucket.label}: removed ${toDeleteIds.length} duplicate(s), balance => ${correctBalance}`)
  }

  console.log(`Done. Fixed buckets: ${fixedBuckets}. Deleted movements: ${deletedCount}.`)
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
