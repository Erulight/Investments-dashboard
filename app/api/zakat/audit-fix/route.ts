import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/rbac'

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(['OWNER'])
    const body = await req.json()
    const { action, bucketId, investmentId, payload } = body as {
      action: string
      bucketId?: string
      investmentId?: string
      payload?: Record<string, unknown>
    }

    if (!action) {
      return NextResponse.json({ error: 'Missing action' }, { status: 400 })
    }

    // ── BUCKET ACTIONS ──
    if (action === 'SET_HAUL_START' && bucketId) {
      const date = payload?.haulStartDate ? new Date(payload.haulStartDate as string) : new Date()
      if (isNaN(date.getTime())) {
        return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
      }
      
      // Verify user owns this bucket
      const bucket = await prisma.cashBucket.findFirst({
        where: { 
          id: bucketId,
          OR: [
            { personId: user.personId },
            { personId: null } // Allow null personId buckets for partners
          ]
        }
      })
      if (!bucket) {
        return NextResponse.json({ error: 'Bucket not found or access denied' }, { status: 404 })
      }
      
      const updated = await prisma.cashBucket.update({
        where: { id: bucketId },
        data: { haulStartDate: date },
        select: { id: true, label: true, haulStartDate: true },
      })
      return NextResponse.json({ success: true, result: updated })
    }

    if (action === 'EXCLUDE_BUCKET' && bucketId) {
      // Verify user owns this bucket
      const bucket = await prisma.cashBucket.findFirst({
        where: { 
          id: bucketId,
          OR: [
            { personId: user.personId },
            { personId: null } // Allow null personId buckets for partners
          ]
        }
      })
      if (!bucket) {
        return NextResponse.json({ error: 'Bucket not found or access denied' }, { status: 404 })
      }
      
      const updated = await prisma.cashBucket.update({
        where: { id: bucketId },
        data: { excludeFromZakat: true },
        select: { id: true, label: true, excludeFromZakat: true },
      })
      return NextResponse.json({ success: true, result: updated })
    }

    if (action === 'ZERO_BUCKET_BALANCE' && bucketId) {
      // Verify user owns this bucket
      const bucket = await prisma.cashBucket.findFirst({
        where: { 
          id: bucketId,
          OR: [
            { personId: user.personId },
            { personId: null } // Allow null personId buckets for partners
          ]
        }
      })
      if (!bucket) {
        return NextResponse.json({ error: 'Bucket not found or access denied' }, { status: 404 })
      }
      
      const updated = await prisma.cashBucket.update({
        where: { id: bucketId },
        data: { balance: 0 },
        select: { id: true, label: true, balance: true },
      })
      return NextResponse.json({ success: true, result: updated })
    }

    // ── INVESTMENT METADATA ACTIONS ──
    if (action === 'SET_SAVINGS_HAUL' && investmentId) {
      const inv = await prisma.investment.findUnique({
        where: { id: investmentId },
        select: { id: true, metadata: true },
      })
      if (!inv) {
        return NextResponse.json({ error: 'Investment not found' }, { status: 404 })
      }

      let meta: Record<string, unknown> = {}
      try {
        meta = inv.metadata ? (typeof inv.metadata === 'string' ? JSON.parse(inv.metadata) : inv.metadata as Record<string, unknown>) : {}
      } catch { /* empty */ }

      const newDate = payload?.savingsHaulStartDate as string
      if (!newDate) {
        return NextResponse.json({ error: 'Missing savingsHaulStartDate' }, { status: 400 })
      }

      meta.savingsHaulStartDate = newDate
      const updated = await prisma.investment.update({
        where: { id: investmentId },
        data: { metadata: JSON.stringify(meta) },
        select: { id: true, name: true, metadata: true },
      })
      return NextResponse.json({ success: true, result: updated })
    }

    if (action === 'REMOVE_SAVINGS_HAUL' && investmentId) {
      const inv = await prisma.investment.findUnique({
        where: { id: investmentId },
        select: { id: true, metadata: true },
      })
      if (!inv) {
        return NextResponse.json({ error: 'Investment not found' }, { status: 404 })
      }

      let meta: Record<string, unknown> = {}
      try {
        meta = inv.metadata ? (typeof inv.metadata === 'string' ? JSON.parse(inv.metadata) : inv.metadata as Record<string, unknown>) : {}
      } catch { /* empty */ }

      delete meta.savingsHaulStartDate
      const updated = await prisma.investment.update({
        where: { id: investmentId },
        data: { metadata: JSON.stringify(meta) },
        select: { id: true, name: true, metadata: true },
      })
      return NextResponse.json({ success: true, result: updated })
    }

    // ── SYNC HAUL: copy bucket haulStartDate → investment savingsHaulStartDate ──
    if (action === 'SYNC_HAUL_FROM_BUCKET' && bucketId && investmentId) {
      const bucket = await prisma.cashBucket.findUnique({
        where: { id: bucketId },
        select: { haulStartDate: true },
      })
      if (!bucket?.haulStartDate) {
        return NextResponse.json({ error: 'Bucket has no haulStartDate' }, { status: 400 })
      }

      const inv = await prisma.investment.findUnique({
        where: { id: investmentId },
        select: { id: true, metadata: true },
      })
      if (!inv) {
        return NextResponse.json({ error: 'Investment not found' }, { status: 404 })
      }

      let meta: Record<string, unknown> = {}
      try {
        meta = inv.metadata ? (typeof inv.metadata === 'string' ? JSON.parse(inv.metadata) : inv.metadata as Record<string, unknown>) : {}
      } catch { /* empty */ }

      const bucketDate = new Date(bucket.haulStartDate as any)
      meta.savingsHaulStartDate = bucketDate.toISOString().split('T')[0]

      const updated = await prisma.investment.update({
        where: { id: investmentId },
        data: { metadata: JSON.stringify(meta) },
        select: { id: true, name: true, metadata: true },
      })
      return NextResponse.json({ success: true, result: updated })
    }

    // ── SYNC HAUL: copy investment savingsHaulStartDate → bucket haulStartDate ──
    if (action === 'SYNC_HAUL_FROM_INVESTMENT' && bucketId && investmentId) {
      const inv = await prisma.investment.findUnique({
        where: { id: investmentId },
        select: { metadata: true },
      })
      if (!inv) {
        return NextResponse.json({ error: 'Investment not found' }, { status: 404 })
      }

      let meta: Record<string, unknown> = {}
      try {
        meta = inv.metadata ? (typeof inv.metadata === 'string' ? JSON.parse(inv.metadata) : inv.metadata as Record<string, unknown>) : {}
      } catch { /* empty */ }

      const savedDate = meta.savingsHaulStartDate as string
      if (!savedDate) {
        return NextResponse.json({ error: 'Investment has no savingsHaulStartDate' }, { status: 400 })
      }

      const updated = await prisma.cashBucket.update({
        where: { id: bucketId },
        data: { haulStartDate: new Date(savedDate) },
        select: { id: true, label: true, haulStartDate: true },
      })
      return NextResponse.json({ success: true, result: updated })
    }

    // ── CLOSE EXTRA ALLOCATIONS: zero out principalRemaining for non-primary allocations ──
    if (action === 'CLOSE_EXTRA_ALLOCATIONS' && bucketId) {
      const keepInvestmentId = payload?.keepInvestmentId as string
      if (!keepInvestmentId) {
        return NextResponse.json({ error: 'Missing keepInvestmentId' }, { status: 400 })
      }

      const allocations = await prisma.investmentBucketAllocation.findMany({
        where: {
          cashBucketId: bucketId,
          principalRemaining: { gt: 0.01 },
          NOT: { investmentId: keepInvestmentId },
        },
        select: { id: true, investmentId: true, principalRemaining: true },
      })

      for (const alloc of allocations) {
        await prisma.investmentBucketAllocation.update({
          where: { id: alloc.id },
          data: { principalRemaining: 0 },
        })
      }

      return NextResponse.json({
        success: true,
        result: { closedAllocations: allocations.length, keptInvestmentId: keepInvestmentId },
      })
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  } catch (error) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Forbidden')) {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    console.error('Audit fix error:', error)
    return NextResponse.json({ error: 'Fix failed' }, { status: 500 })
  }
}
