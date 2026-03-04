'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

export type NotificationItem = {
  key: string
  investmentId: string
  message: string
  createdAt: string
  amounts?: { profit?: number; commission?: number }
}

export function NotificationBanner({
  notifications,
}: {
  notifications: NotificationItem[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [dismissLoading, setDismissLoading] = useState<string | null>(null)
  const [error, setError] = useState<string>('')

  const sorted = useMemo(() => {
    return [...notifications].sort((a, b) => {
      const ta = new Date(a.createdAt).getTime()
      const tb = new Date(b.createdAt).getTime()
      return tb - ta
    })
  }, [notifications])

  if (!sorted.length) return null

  const single = sorted.length === 1 ? sorted[0] : null

  const dismiss = async (investmentId: string) => {
    if (dismissLoading) return
    setDismissLoading(investmentId)
    setError('')
    try {
      const res = await fetch('/api/notifications/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ investmentId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to dismiss')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to dismiss')
    } finally {
      setDismissLoading(null)
    }
  }

  return (
    <div className="w-full">
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="font-semibold">
            {single ? (
              <span>🔔 {single.message}</span>
            ) : (
              <span>🔔 You have {sorted.length} pending receipts ready</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {single ? (
              <>
                <Link
                  href={`/sukuk?receive=${encodeURIComponent(single.investmentId)}&from=${encodeURIComponent(pathname || '/')}`}
                  className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
                >
                  Receive Now →
                </Link>
                <button
                  onClick={() => dismiss(single.investmentId)}
                  disabled={dismissLoading === single.investmentId}
                  className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-60"
                >
                  {dismissLoading === single.investmentId ? 'Dismissing…' : 'Dismiss'}
                </button>
              </>
            ) : (
              <Link
                href="/sukuk"
                className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
              >
                View All
              </Link>
            )}
          </div>
        </div>
        {error && <div className="mt-2 text-xs text-red-700">{error}</div>}
      </div>
    </div>
  )
}
