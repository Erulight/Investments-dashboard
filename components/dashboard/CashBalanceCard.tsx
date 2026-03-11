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

  return (
    <Card>
      <CardContent>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Cash Balance</p>
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
    </Card>
  )
}
