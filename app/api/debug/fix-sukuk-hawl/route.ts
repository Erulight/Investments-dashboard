import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

const parseMetadata = (value: unknown) => {
  if (!value) return {}
  if (typeof value === 'object') return value as Record<string, unknown>
  if (typeof value !== 'string') return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

export async function POST() {
  try {
    // Find all Sukuk investments with allocations
    const sukukInvestments = await prisma.investment.findMany({
      where: {
        account: { type: 'SUKUK' },
      },
      include: {
        account: true,
      },
    })

    const fixes = []

    for (const sukuk of sukukInvestments) {
      // Find allocations for this Sukuk
      const allocations = await prisma.investmentBucketAllocation.findMany({
        where: {
          investmentId: sukuk.id,
          principalAllocated: { gt: 0 },
        },
        include: {
          cashBucket: {
            select: {
              label: true,
              haulStartDate: true,
            },
          },
        },
      })

      // Find the earliest ROSCA or receipt bucket hawl start date
      const inheritedHaulStart = allocations
        .map((alloc) => {
          const label = alloc.cashBucket?.label || ''
          const isRoscaReceipt = label.startsWith('Savings Receipt •')
          const isSukukReceipt = label.includes('Receipt') && !label.startsWith('Savings Receipt •')
          if (!isRoscaReceipt && !isSukukReceipt) return null
          const d = alloc.cashBucket?.haulStartDate
          if (!d) return null
          return new Date(d)
        })
        .filter((d): d is Date => d !== null && !Number.isNaN(d.getTime()))
        .sort((a, b) => a.getTime() - b.getTime())[0]

      if (inheritedHaulStart) {
        const existingMeta = parseMetadata(sukuk.metadata)
        const inheritedIso = inheritedHaulStart.toISOString().split('T')[0]
        const currentSavingsHaulStart = existingMeta?.savingsHaulStartDate

        if (currentSavingsHaulStart !== inheritedIso) {
          await prisma.investment.update({
            where: { id: sukuk.id },
            data: {
              metadata: JSON.stringify({
                ...existingMeta,
                savingsHaulStartDate: inheritedIso,
              }),
            },
          })

          fixes.push({
            sukukId: sukuk.id,
            sukukName: sukuk.name,
            oldHaulStart: currentSavingsHaulStart || 'none',
            newHaulStart: inheritedIso,
            allocationsFound: allocations.length,
          })
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Fixed ${fixes.length} Sukuk investments`,
      fixes,
    })
  } catch (error) {
    console.error('Fix Sukuk hawl error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fix Sukuk hawl dates' },
      { status: 500 }
    )
  }
}
