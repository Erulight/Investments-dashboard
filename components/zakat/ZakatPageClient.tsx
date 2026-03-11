'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ZakatDashboard } from './ZakatDashboard'
import { ZakatLoadingSkeleton } from './ZakatLoadingSkeleton'
import type { DisplayCurrency } from '@/lib/currency'

type BucketRow = {
  id: string
  bucketId: string
  periodIndex: number
  label?: string | null
  currency: string
  balance: number
  haulStartDate: string
  lastZakatPaidDate?: string | null
  haulCompleteDate: string
  idleBase: number
  receiptsTotal: number
  zakatDue: number
  isPaid: boolean
  haulCompleted: boolean
  source: string
  sourceGroup: string
  sourceType: string
  rowKind?: 'PROFIT' | 'COMMISSION' | 'IDLE' | 'PRINCIPAL' | 'RECEIPT' | 'REWARD'
  why?: string | null
  lastPayment: null | {
    id: string
    date: string
    amount: number
  }
  dueReceipts: Array<{
    date: string
    amount: number
    type: string
    investmentName?: string | null
  }>
}

export function ZakatPageClient({
  initialBuckets,
  zakatEnabled = true,
  displayCurrency = 'SAR',
}: {
  initialBuckets: BucketRow[]
  zakatEnabled?: boolean
  displayCurrency?: DisplayCurrency
}) {
  const router = useRouter()
  const [buckets, setBuckets] = useState<BucketRow[]>(initialBuckets)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())

  // Refresh data from server
  const refreshData = useCallback(async () => {
    setIsRefreshing(true)
    try {
      router.refresh()
      setLastUpdate(new Date())
    } catch (error) {
      console.error('Failed to refresh Zakat data:', error)
    } finally {
      setTimeout(() => setIsRefreshing(false), 500) // Minimum loading time for UX
    }
  }, [router])

  // Update buckets when initialBuckets change (from router.refresh)
  useEffect(() => {
    setBuckets(initialBuckets)
  }, [initialBuckets])

  // Listen for updates from other tabs using BroadcastChannel
  useEffect(() => {
    if (typeof window === 'undefined') return

    const channel = new BroadcastChannel('zakat-updates')
    
    channel.onmessage = (event) => {
      if (event.data.type === 'ZAKAT_UPDATED') {
        console.log('Received update from another tab, refreshing...')
        refreshData()
      }
    }

    return () => {
      channel.close()
    }
  }, [refreshData])

  // Auto-refresh every 30 seconds (optional, can be disabled)
  useEffect(() => {
    const interval = setInterval(() => {
      console.log('Auto-refreshing Zakat data...')
      refreshData()
    }, 30000) // 30 seconds

    return () => clearInterval(interval)
  }, [refreshData])

  // Broadcast update to other tabs when user makes changes
  const notifyOtherTabs = useCallback(() => {
    if (typeof window === 'undefined') return
    
    const channel = new BroadcastChannel('zakat-updates')
    channel.postMessage({ type: 'ZAKAT_UPDATED', timestamp: Date.now() })
    channel.close()
  }, [])

  // Handle payment/undo actions - notify other tabs and refresh
  const handleZakatAction = useCallback(() => {
    notifyOtherTabs()
    // Refresh from server to get actual state
    setTimeout(() => refreshData(), 500)
  }, [notifyOtherTabs, refreshData])

  // Listen for payment actions from ZakatDashboard
  useEffect(() => {
    const handlePaymentEvent = () => {
      handleZakatAction()
    }

    window.addEventListener('zakat-payment-made', handlePaymentEvent)
    return () => {
      window.removeEventListener('zakat-payment-made', handlePaymentEvent)
    }
  }, [handleZakatAction])

  return (
    <div className="relative">
      {/* Refresh indicator */}
      {isRefreshing && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-600 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 animate-slide-in">
          <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span>Updating Zakat data...</span>
        </div>
      )}

      {/* Last update timestamp */}
      <div className="mb-4 text-sm text-gray-500 flex items-center justify-between">
        <span>
          Last updated: {lastUpdate.toLocaleTimeString()}
        </span>
        <button
          onClick={refreshData}
          disabled={isRefreshing}
          className="text-emerald-600 hover:text-emerald-700 disabled:opacity-50 flex items-center gap-1"
        >
          <svg 
            className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} 
            xmlns="http://www.w3.org/2000/svg" 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {/* Main dashboard */}
      <ZakatDashboard
        buckets={buckets}
        zakatEnabled={zakatEnabled}
        displayCurrency={displayCurrency}
      />

      <style jsx>{`
        @keyframes slide-in {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        .animate-slide-in {
          animation: slide-in 0.3s ease-out;
        }
      `}</style>
    </div>
  )
}
