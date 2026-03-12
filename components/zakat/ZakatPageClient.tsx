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

  const handlePrint = useCallback(() => {
    const printWindow = window.open('', '_blank', 'width=900,height=700')
    if (!printWindow) return
    const now = new Date().toLocaleString()
    const totalDue = buckets.reduce((s, b) => s + (Number(b.zakatDue) || 0), 0)
    const paidRows = buckets.filter((b) => b.isPaid)
    const dueRows = buckets.filter((b) => Number(b.zakatDue) > 0)
    const groups = new Map<string, typeof buckets>()
    for (const b of buckets) {
      const k = b.source && b.source !== 'General' ? b.source : 'General Cash'
      groups.set(k, [...(groups.get(k) || []), b])
    }
    const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    const fmtDate = (d: string) => {
      const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/)
      return m ? `${m[3]}-${m[2]}-${m[1]}` : d
    }
    const rows = Array.from(groups.entries()).map(([grp, items]) => {
      const gDue = items.reduce((s, b) => s + (Number(b.zakatDue) || 0), 0)
      const gBal = items.reduce((s, b) => s + (Number(b.balance) || 0), 0)
      return `<tr style="background:#f8fafc"><td colspan="6" style="padding:6px 10px;font-weight:700;font-size:12px;border-bottom:1px solid #e2e8f0">${grp} — ${items.length} item(s) — Balance: SAR ${fmt(gBal)} — Due: SAR ${fmt(gDue)}</td></tr>` +
        items.map(b => `<tr><td style="padding:5px 10px 5px 20px;font-size:11px">${(b.label || b.source || '').replace(/\u2022/g,'•')}</td><td>${fmtDate(b.haulStartDate)}</td><td>${fmtDate(b.haulCompleteDate)}</td><td style="text-align:right">SAR ${fmt(b.idleBase)}</td><td style="text-align:right">SAR ${fmt(b.receiptsTotal)}</td><td style="text-align:right;font-weight:600;color:${b.zakatDue > 0 ? '#b45309' : '#059669'}">SAR ${fmt(b.zakatDue)}</td></tr>`).join('')
    }).join('')
    printWindow.document.write(`<!DOCTYPE html><html><head><title>Zakat Report — ${now}</title><style>body{font-family:Arial,sans-serif;margin:24px;color:#1e293b}h1{font-size:20px;margin:0 0 4px}h2{font-size:13px;font-weight:600;margin:18px 0 8px;color:#475569;border-bottom:1px solid #e2e8f0;padding-bottom:4px}table{width:100%;border-collapse:collapse;margin-bottom:16px}th{background:#f1f5f9;text-align:left;padding:6px 10px;font-size:11px;border-bottom:2px solid #cbd5e1}td{padding:5px 10px;font-size:11px;border-bottom:1px solid #f1f5f9}tr:hover td{background:#f8fafc}.meta{font-size:11px;color:#64748b;margin-bottom:16px}.summary{display:flex;gap:24px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:12px 16px;margin-bottom:20px}.stat{display:flex;flex-direction:column}.stat-val{font-size:18px;font-weight:700}.stat-due{color:#b45309}.stat-paid{color:#059669}.stat-total{color:#1e40af}@media print{@page{margin:16mm}}</style></head><body><h1>🕌 Zakat Report</h1><div class="meta">Generated: ${now}</div><div class="summary"><div class="stat"><span style="font-size:10px;color:#94a3b8;text-transform:uppercase">Total Zakat Due</span><span class="stat-val stat-due">SAR ${fmt(totalDue)}</span></div><div class="stat"><span style="font-size:10px;color:#94a3b8;text-transform:uppercase">Due Rows</span><span class="stat-val" style="color:#92400e">${dueRows.length}</span></div><div class="stat"><span style="font-size:10px;color:#94a3b8;text-transform:uppercase">Paid Rows</span><span class="stat-val stat-paid">${paidRows.length}</span></div><div class="stat"><span style="font-size:10px;color:#94a3b8;text-transform:uppercase">Total Rows</span><span class="stat-val stat-total">${buckets.length}</span></div></div><h2>Per Source Breakdown</h2><table><thead><tr><th>Item</th><th>Haul Start</th><th>Haul End</th><th style="text-align:right">Idle Cash</th><th style="text-align:right">Receipts</th><th style="text-align:right">Zakat Due</th></tr></thead><tbody>${rows}</tbody></table></body></html>`)
    printWindow.document.close()
    printWindow.focus()
    setTimeout(() => printWindow.print(), 400)
  }, [buckets])

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
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrint}
            className="text-slate-500 hover:text-slate-700 flex items-center gap-1 text-xs border border-slate-200 rounded-md px-2.5 py-1.5 hover:bg-slate-50 transition-colors"
            title="Export Zakat Report as PDF"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
            Export PDF
          </button>
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
