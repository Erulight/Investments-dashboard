'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { DateInput } from '@/components/ui/DateInput'
import { formatDateInput, formatDisplayDate, toIsoDateInput } from '@/lib/date'

interface RecentTx {
  id: string
  type: string
  amount: number
  date: string
  description: string | null
}

interface PartnerOption {
  id: string
  name: string
}

export function CashBalanceCard({ initialCash, role }: { initialCash: number; role: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const selectedYear = searchParams?.get('year') || new Date().getFullYear().toString()
  const [cashBalance, setCashBalance] = useState(String(initialCash ?? 0))
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [direction, setDirection] = useState<'IN' | 'OUT'>('IN')
  const [haulStartDate, setHaulStartDate] = useState(formatDateInput(new Date()))
  const [entryDate, setEntryDate] = useState(formatDateInput(new Date()))
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [recentTxs, setRecentTxs] = useState<RecentTx[]>([])
  const [useTransfer, setUseTransfer] = useState(false)
  const [transferDirection, setTransferDirection] = useState<'TO_PARTNER' | 'FROM_PARTNER'>('TO_PARTNER')
  const [partners, setPartners] = useState<PartnerOption[]>([])
  const [partnersLoading, setPartnersLoading] = useState(false)
  const [partnersError, setPartnersError] = useState('')
  const [selectedPartnerId, setSelectedPartnerId] = useState('')
  const [showHistoryModal, setShowHistoryModal] = useState(false)
  const [balanceHistory, setBalanceHistory] = useState<Array<{ date: string; balance: number; type: string; amount: number; description: string | null }>>([])  
  const [historyLoading, setHistoryLoading] = useState(false)

  const loadCash = async () => {
    setError('')
    setMessage('')
    try {
      const res = await fetch(`/api/cash?year=${selectedYear}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load cash balance')
      }
      setCashBalance(String(data.cashBalance ?? 0))
      const txs = Array.isArray(data.transactions) ? data.transactions.slice(0, 5) : []
      setRecentTxs(txs)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load cash balance')
    }
  }

  useEffect(() => {
    loadCash()
  }, [selectedYear])

  useEffect(() => {
    const loadPartners = async () => {
      if (role !== 'OWNER' || !showForm || !useTransfer || partners.length > 0 || partnersLoading) return
      setPartnersLoading(true)
      setPartnersError('')
      try {
        const res = await fetch('/api/partners')
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(data.error || 'Failed to load partners')
        }
        const items = Array.isArray(data.partners) ? data.partners : []
        setPartners(items.map((p: any) => ({ id: p.id, name: p.name })))
      } catch (err) {
        setPartnersError(err instanceof Error ? err.message : 'Failed to load partners')
      } finally {
        setPartnersLoading(false)
      }
    }
    loadPartners()
  }, [role, showForm, useTransfer, partners.length, partnersLoading])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    setMessage('')

    try {
      const selectedDate = useTransfer ? entryDate : direction === 'IN' ? haulStartDate : entryDate
      const isoDate = toIsoDateInput(selectedDate)
      if (!isoDate) {
        throw new Error('Invalid date format')
      }
      if (useTransfer) {
        if (role !== 'OWNER') {
          throw new Error('Only owner can initiate transfers from this view')
        }
        if (!selectedPartnerId) {
          throw new Error('Please select a partner')
        }

        const res = await fetch('/api/cash/transfer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: Number(amount),
            direction: transferDirection,
            partnerPersonId: selectedPartnerId,
            date: isoDate,
            notes,
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(data.error || 'Failed to transfer cash')
        }

        if (typeof data.ownerCashBalance === 'number') {
          setCashBalance(String(data.ownerCashBalance))
        } else {
          await loadCash()
        }
        window.location.reload()
      } else {
        const res = await fetch('/api/cash', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            direction,
            amount: Number(amount),
            date: isoDate,
            notes,
            haulStartDate: direction === 'IN' ? isoDate : undefined,
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(data.error || 'Failed to update cash balance')
        }
        setCashBalance(String(data.cashBalance ?? 0))
        window.location.reload()
      }
      setAmount('')
      setNotes('')
      setSelectedPartnerId('')
      setMessage('Saved')
      setShowForm(false)
      await loadCash()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update cash balance')
    } finally {
      setLoading(false)
    }
  }

  const loadBalanceHistory = async () => {
    setHistoryLoading(true)
    try {
      const res = await fetch('/api/cash/history')
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load balance history')
      }
      setBalanceHistory(data.history || [])
      setShowHistoryModal(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load balance history')
    } finally {
      setHistoryLoading(false)
    }
  }

  return (
    <Card>
      <CardContent>
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Cash Balance</p>
          <button
            onClick={loadBalanceHistory}
            disabled={historyLoading}
            className="text-xs text-cyan-600 hover:text-cyan-700 font-medium transition-colors"
            title="View balance history"
          >
            {historyLoading ? 'Loading...' : '📊 History'}
          </button>
        </div>
        <div className="text-xl font-bold text-gray-900 mt-1 tabular-nums">
          SAR {Number(cashBalance || 0).toLocaleString()}
        </div>

        {/* Recent transactions (max 5) */}
        {recentTxs.length > 0 && (
          <div className="mt-2 pt-2 border-t border-gray-100 space-y-1">
            {recentTxs.map(tx => (
              <div key={tx.id} className="flex items-center justify-between text-[11px]">
                <span className="text-gray-400 truncate max-w-[120px]">
                  {formatDisplayDate(tx.date)}
                </span>
                <span className={`font-medium tabular-nums ${tx.amount >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {tx.amount >= 0 ? '+' : ''}{tx.amount.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="mt-2 flex items-center gap-3">
          {!showForm ? (
            <>
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="text-[11px] text-slate-500 hover:text-slate-700 font-medium"
              >
                + Log cash
              </button>
              <Link href="/cash-ledger" className="text-[11px] text-slate-500 hover:text-slate-700 font-medium">
                View Ledger →
              </Link>
            </>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-2 w-full pt-1 border-t border-gray-100">
              <div className="flex gap-2">
                <select
                  value={useTransfer ? 'TRANSFER' : direction}
                  onChange={(e) => {
                    const value = e.target.value
                    if (value === 'TRANSFER') {
                      setUseTransfer(true)
                    } else {
                      setUseTransfer(false)
                      setDirection(value as 'IN' | 'OUT')
                    }
                  }}
                  className="rounded-md border border-gray-200 px-2 py-1.5 text-xs focus:border-slate-500 focus:ring-1 focus:ring-slate-500 outline-none"
                >
                  <option value="IN">Add</option>
                  <option value="OUT">Withdraw</option>
                  {role === 'OWNER' && <option value="TRANSFER">Transfer</option>}
                </select>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="flex-1 rounded-md border border-gray-200 px-2 py-1.5 text-xs focus:border-slate-500 focus:ring-1 focus:ring-slate-500 outline-none"
                  placeholder="Amount"
                />
              </div>
              <div className="flex gap-2">
                <DateInput
                  value={useTransfer ? entryDate : direction === 'IN' ? haulStartDate : entryDate}
                  onChange={(value) => (
                    useTransfer || direction === 'OUT' ? setEntryDate(value) : setHaulStartDate(value)
                  )}
                  ariaLabel={useTransfer ? 'Transfer date' : direction === 'IN' ? 'Ownership date' : 'Withdrawal date'}
                />
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="flex-1 rounded-md border border-gray-200 px-2 py-1.5 text-xs focus:border-slate-500 focus:ring-1 focus:ring-slate-500 outline-none"
                  placeholder="Notes"
                />
              </div>
              {role === 'OWNER' && useTransfer && (
                <div className="flex flex-col gap-2 text-[11px] text-gray-600">
                  <div className="flex gap-2">
                    <select
                      value={transferDirection}
                      onChange={(e) => setTransferDirection(e.target.value as 'TO_PARTNER' | 'FROM_PARTNER')}
                      className="rounded-md border border-gray-200 px-2 py-1.5 text-xs focus:border-slate-500 focus:ring-1 focus:ring-slate-500 outline-none flex-1"
                    >
                      <option value="TO_PARTNER">Send to Partner</option>
                      <option value="FROM_PARTNER">Receive from Partner</option>
                    </select>
                  </div>
                  <div className="flex gap-2 items-center">
                    <select
                      value={selectedPartnerId}
                      onChange={(e) => setSelectedPartnerId(e.target.value)}
                      className="rounded-md border border-gray-200 px-2 py-1.5 text-xs focus:border-slate-500 focus:ring-1 focus:ring-slate-500 outline-none flex-1"
                    >
                      <option value="">{partnersLoading ? 'Loading partners...' : 'Select partner'}</option>
                      {partners.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    {partnersError && (
                      <span className="text-[10px] text-red-500">{partnersError}</span>
                    )}
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Button type="submit" variant="primary" size="sm" disabled={loading}>
                  {loading ? 'Saving...' : 'Save'}
                </Button>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false)
                    setUseTransfer(false)
                    setSelectedPartnerId('')
                    setPartnersError('')
                  }}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  Cancel
                </button>
                {message && <span className="text-xs text-green-600">{message}</span>}
                {error && <span className="text-xs text-red-600">{error}</span>}
              </div>
            </form>
          )}
        </div>
      </CardContent>

      {/* Balance History Modal */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-3xl border border-slate-200 dark:border-white/10 max-h-[80vh] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Cash Balance History</h2>
              <button
                onClick={() => setShowHistoryModal(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
              >
                ✕
              </button>
            </div>
            <div className="px-6 py-4 overflow-y-auto flex-1">
              {balanceHistory.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <p className="text-sm">No transaction history available</p>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="grid grid-cols-12 gap-2 pb-2 border-b border-slate-200 dark:border-white/10 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    <div className="col-span-2">Date</div>
                    <div className="col-span-2">Type</div>
                    <div className="col-span-4">Description</div>
                    <div className="col-span-2 text-right">Amount</div>
                    <div className="col-span-2 text-right">Balance</div>
                  </div>
                  {balanceHistory.map((entry, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-12 gap-2 py-2 border-b border-slate-100 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors text-sm"
                    >
                      <div className="col-span-2 text-slate-700 dark:text-slate-300">
                        {new Date(entry.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </div>
                      <div className="col-span-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          entry.type.includes('IN') || entry.type.includes('RECEIVE') || entry.type.includes('PROFIT') || entry.type.includes('COMMISSION')
                            ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400'
                            : entry.type.includes('OUT') || entry.type.includes('INVEST') || entry.type.includes('WITHDRAW') || entry.type.includes('PAY')
                            ? 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400'
                            : 'bg-slate-100 dark:bg-slate-500/20 text-slate-700 dark:text-slate-400'
                        }`}>
                          {entry.type.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <div className="col-span-4 text-slate-500 dark:text-slate-400 text-xs truncate">
                        {entry.description || '—'}
                      </div>
                      <div className={`col-span-2 text-right font-semibold tabular-nums ${
                        entry.amount >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'
                      }`}>
                        {entry.amount >= 0 ? '+' : ''}{entry.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      <div className="col-span-2 text-right font-bold text-slate-900 dark:text-white tabular-nums">
                        {entry.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-slate-200 dark:border-white/10 flex justify-end">
              <button
                onClick={() => setShowHistoryModal(false)}
                className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 text-sm font-medium transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}
