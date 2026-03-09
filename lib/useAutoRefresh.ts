'use client'

import { useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

type UpdateEvent = 
  | 'investment-updated'
  | 'zakat-updated'
  | 'cash-updated'
  | 'savings-updated'
  | 'sukuk-updated'
  | 'account-updated'
  | 'any-updated'

interface UseAutoRefreshOptions {
  /**
   * Events to listen for. Use 'any-updated' to listen to all events.
   */
  events?: UpdateEvent[]
  /**
   * Auto-refresh interval in milliseconds. Set to 0 to disable.
   * Default: 30000 (30 seconds)
   */
  interval?: number
  /**
   * Delay before refreshing after an event in milliseconds.
   * Default: 500
   */
  refreshDelay?: number
}

/**
 * Hook to enable auto-refresh and cross-tab updates for any page
 * 
 * @example
 * ```tsx
 * function MyPage() {
 *   useAutoRefresh({ events: ['sukuk-updated', 'cash-updated'] })
 *   // Your component code
 * }
 * ```
 */
export function useAutoRefresh(options: UseAutoRefreshOptions = {}) {
  const {
    events = ['any-updated'],
    interval = 30000,
    refreshDelay = 500,
  } = options

  const router = useRouter()

  const refreshData = useCallback(() => {
    router.refresh()
  }, [router])

  // Listen for updates from other tabs or components
  useEffect(() => {
    if (typeof window === 'undefined') return

    const channel = new BroadcastChannel('app-updates')
    
    channel.onmessage = (event) => {
      const eventType = event.data.type as UpdateEvent
      
      // Check if we should respond to this event
      if (events.includes('any-updated') || events.includes(eventType)) {
        console.log(`[AutoRefresh] Received ${eventType}, refreshing in ${refreshDelay}ms...`)
        setTimeout(() => refreshData(), refreshDelay)
      }
    }

    return () => {
      channel.close()
    }
  }, [events, refreshData, refreshDelay])

  // Auto-refresh on interval
  useEffect(() => {
    if (interval <= 0) return

    const timer = setInterval(() => {
      console.log('[AutoRefresh] Auto-refreshing...')
      refreshData()
    }, interval)

    return () => clearInterval(timer)
  }, [interval, refreshData])
}

/**
 * Notify all tabs and components that data has been updated
 * 
 * @example
 * ```tsx
 * // After creating a sukuk
 * notifyUpdate('sukuk-updated')
 * 
 * // After any investment change
 * notifyUpdate('investment-updated')
 * ```
 */
export function notifyUpdate(event: UpdateEvent) {
  if (typeof window === 'undefined') return
  
  const channel = new BroadcastChannel('app-updates')
  channel.postMessage({ type: event, timestamp: Date.now() })
  channel.close()
  
  console.log(`[AutoRefresh] Notified: ${event}`)
}
