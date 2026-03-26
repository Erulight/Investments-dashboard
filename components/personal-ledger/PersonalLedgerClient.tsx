'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'

type TxType = 'GIVEN' | 'RECEIVED'

type PersonLedgerTx = {
  id: string
  date: string
  type: TxType
  amount: number
  currency: string
  notes: string | null
  createdAt: string
}

type Person = {
  id: string
  name: string
  personLedgerTransactions: PersonLedgerTx[]
}

const formatDate = (iso: string) => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

const formatAmount = (amount: number, currency: string) => {
  const abs = Math.abs(amount)
  const formatted = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${formatted} ${currency}`
}

const EMPTY_FORM = {
  personName: '',
  date: new Date().toISOString().slice(0, 10),
  type: 'GIVEN' as TxType,
  amount: '',
  currency: 'SAR',
  notes: '',
}

export function PersonalLedgerClient() {
  const [persons, setPersons] = useState<Person[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activePersonId, setActivePersonId] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [showAddPerson, setShowAddPerson] = useState(false)
  const [newPersonName, setNewPersonName] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [formError, setFormError] = useState('')
  const [formLoading, setFormLoading] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deletePersonId, setDeletePersonId] = useState<string | null>(null)
  const [deletePersonLoading, setDeletePersonLoading] = useState(false)
  const [editPersonId, setEditPersonId] = useState<string | null>(null)
  const [editPersonName, setEditPersonName] = useState('')
  const [editPersonLoading, setEditPersonLoading] = useState(false)

  const fetchPersons = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/personal-ledger')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load')
      const loadedPersons = Array.isArray(data.persons) ? data.persons : []
      setPersons(loadedPersons)
      if (!activePersonId && loadedPersons.length > 0) {
        setActivePersonId(loadedPersons[0].id)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load persons')
    } finally {
      setLoading(false)
    }
  }, [activePersonId])

  useEffect(() => { fetchPersons() }, [fetchPersons])

  const activePerson = useMemo(() => {
    return persons.find(p => p.id === activePersonId) || null
  }, [persons, activePersonId])

  const personStats = useMemo(() => {
    if (!activePerson) return { given: 0, received: 0, net: 0, txCount: 0 }
    const txs = activePerson.personLedgerTransactions || []
    const given = txs.filter(t => t.type === 'GIVEN').reduce((s, t) => s + t.amount, 0)
    const received = txs.filter(t => t.type === 'RECEIVED').reduce((s, t) => s + t.amount, 0)
    return { given, received, net: given - received, txCount: txs.length }
  }, [activePerson])

  const sortedTxs = useMemo(() => {
    if (!activePerson) return []
    const txs = [...(activePerson.personLedgerTransactions || [])]
    txs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    return txs
  }, [activePerson])

  const openAdd = () => {
    if (!activePerson) return
    setEditId(null)
    setForm({ ...EMPTY_FORM, personName: activePerson.name })
    setFormError('')
    setShowModal(true)
  }

  const openEdit = (tx: PersonLedgerTx) => {
    if (!activePerson) return
    setEditId(tx.id)
    setForm({
      personName: activePerson.name,
      date: tx.date.slice(0, 10),
      type: tx.type,
      amount: String(tx.amount),
      currency: tx.currency,
      notes: tx.notes || '',
    })
    setFormError('')
    setShowModal(true)
  }

  const handleFormChange = (field: keyof typeof form, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    setFormLoading(true)
    try {
      const payload = {
        personName: form.personName,
        date: form.date,
        type: form.type,
        amount: Number(form.amount),
        currency: form.currency || 'SAR',
        notes: form.notes || null,
      }
      const url = editId ? `/api/personal-ledger/${editId}` : '/api/personal-ledger'
      const method = editId ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save')
      setShowModal(false)
      await fetchPersons()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setFormLoading(false)
    }
  }

  const handleAddPerson = async () => {
    if (!newPersonName.trim()) return
    setFormLoading(true)
    setFormError('')
    try {
      const payload = {
        personName: newPersonName.trim(),
        date: new Date().toISOString().slice(0, 10),
        type: 'GIVEN',
        amount: 0.01,
        currency: 'SAR',
        notes: 'Initial entry',
      }
      const res = await fetch('/api/personal-ledger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to add person')
      setShowAddPerson(false)
      setNewPersonName('')
      await fetchPersons()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to add person')
    } finally {
      setFormLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    setDeleteLoading(true)
    try {
      const res = await fetch(`/api/personal-ledger/${deleteId}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to delete')
      setDeleteId(null)
      await fetchPersons()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete')
    } finally {
      setDeleteLoading(false)
    }
  }

  const handleDeletePerson = async () => {
    if (!deletePersonId) return
    setDeletePersonLoading(true)
    try {
      const res = await fetch(`/api/personal-ledger/person/${deletePersonId}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to delete person')
      setDeletePersonId(null)
      if (activePersonId === deletePersonId) {
        setActivePersonId(null)
      }
      await fetchPersons()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete person')
    } finally {
      setDeletePersonLoading(false)
    }
  }

  const openEditPerson = (person: Person) => {
    setEditPersonId(person.id)
    setEditPersonName(person.name)
    setFormError('')
  }

  const handleEditPerson = async () => {
    if (!editPersonId || !editPersonName.trim()) return
    setEditPersonLoading(true)
    setFormError('')
    try {
      const res = await fetch(`/api/personal-ledger/person/${editPersonId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editPersonName.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update person')
      setEditPersonId(null)
      setEditPersonName('')
      await fetchPersons()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to update person')
    } finally {
      setEditPersonLoading(false)
    }
  }

  const exportCsv = () => {
    if (!activePerson) return
    const header = 'Date,Type,Amount,Currency,Notes'
    const rows = sortedTxs.map(t =>
      [
        t.date.slice(0, 10),
        t.type,
        t.amount,
        t.currency,
        `"${(t.notes || '').replace(/"/g, '""')}"`,
      ].join(',')
    )
    const csv = [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${activePerson.name.replace(/[^a-z0-9]/gi, '_')}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-xl shadow-lg p-6 text-white">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Personal Ledger</h1>
            <p className="text-sm text-slate-400 mt-1">Track money given to or received from people</p>
          </div>
          <button
            onClick={() => setShowAddPerson(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold transition-colors"
          >
            <span className="text-base">+</span> Add Person
          </button>
        </div>
      </div>

      {/* Person Tabs */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-white/10 shadow-sm">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 dark:border-white/10 overflow-x-auto">
          {persons.map(person => (
            <div key={person.id} className="relative group">
              <button
                onClick={() => setActivePersonId(person.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  activePersonId === person.id
                    ? 'bg-cyan-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                }`}
              >
                {person.name}
              </button>
              {activePersonId === person.id && (
                <div className="absolute -top-1 -right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => { e.stopPropagation(); openEditPerson(person); }}
                    className="w-5 h-5 rounded-full bg-blue-500 hover:bg-blue-600 text-white text-[10px] flex items-center justify-center shadow-lg"
                    title="Edit person name"
                  >
                    ✎
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeletePersonId(person.id); }}
                    className="w-5 h-5 rounded-full bg-red-500 hover:bg-red-600 text-white text-[10px] flex items-center justify-center shadow-lg"
                    title="Delete person"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {activePerson && (
          <div className="p-6">
            {/* Stats for active person */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <div className="bg-slate-50 dark:bg-slate-700/40 rounded-lg p-4">
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Money Given</div>
                <div className="text-xl font-bold text-red-500 dark:text-red-400">
                  {personStats.given.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} SAR
                </div>
              </div>
              <div className="bg-slate-50 dark:bg-slate-700/40 rounded-lg p-4">
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Money Received</div>
                <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                  {personStats.received.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} SAR
                </div>
              </div>
              <div className="bg-slate-50 dark:bg-slate-700/40 rounded-lg p-4">
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Net Balance</div>
                <div className={`text-xl font-bold ${
                  personStats.net > 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : personStats.net < 0
                    ? 'text-red-500 dark:text-red-400'
                    : 'text-slate-600 dark:text-slate-300'
                }`}>
                  {personStats.net > 0 ? '+' : ''}{personStats.net.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} SAR
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {personStats.net > 0 ? 'They owe you' : personStats.net < 0 ? 'You owe them' : 'Settled'}
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={openAdd}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold transition-colors"
              >
                + Add Transaction
              </button>
              <button
                onClick={exportCsv}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-white/20 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/10 text-sm font-medium transition-colors"
              >
                ↓ Export
              </button>
            </div>
          </div>
        )}
      </div>


      {/* Transactions Table */}
      {activePerson && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-white/10 shadow-sm overflow-hidden">
          {error && (
            <div className="px-4 py-3 bg-red-50 dark:bg-red-950/40 border-b border-red-200 dark:border-red-800/60 text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-400 text-sm">Loading…</div>
          ) : sortedTxs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
              <span className="text-4xl">📒</span>
              <p className="text-sm font-medium">No transactions with {activePerson.name} yet</p>
              <button onClick={openAdd} className="text-xs text-cyan-500 hover:text-cyan-400 underline">Add first transaction</button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-700/40">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Notes</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Amount</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {sortedTxs.map(tx => (
                    <tr key={tx.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300 whitespace-nowrap text-xs">
                        {formatDate(tx.date)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                          tx.type === 'GIVEN'
                            ? 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400'
                            : 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400'
                        }`}>
                          {tx.type === 'GIVEN' ? '↑ Given' : '↓ Received'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs max-w-[250px] truncate">
                        {tx.notes || <span className="opacity-40">—</span>}
                      </td>
                      <td className={`px-4 py-3 text-right font-semibold text-sm whitespace-nowrap ${
                        tx.type === 'GIVEN' ? 'text-red-500 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'
                      }`}>
                        {tx.type === 'GIVEN' ? '−' : '+'}{formatAmount(tx.amount, tx.currency)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => openEdit(tx)}
                            className="px-2.5 py-1 text-[11px] font-medium rounded-md border border-slate-200 dark:border-white/15 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/10 transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => setDeleteId(tx.id)}
                            className="px-2.5 py-1 text-[11px] font-medium rounded-md border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Add Person Modal */}
      {showAddPerson && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm border border-slate-200 dark:border-white/10">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Add Person</h2>
              <button
                onClick={() => { setShowAddPerson(false); setNewPersonName(''); setFormError(''); }}
                className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
              >
                ✕
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {formError && (
                <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-sm text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800/60">
                  {formError}
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Person Name *</label>
                <input
                  type="text"
                  required
                  value={newPersonName}
                  onChange={e => setNewPersonName(e.target.value)}
                  placeholder="Enter person's name"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-white/15 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  onKeyDown={e => { if (e.key === 'Enter') handleAddPerson(); }}
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => { setShowAddPerson(false); setNewPersonName(''); setFormError(''); }}
                  className="flex-1 px-4 py-2 rounded-lg border border-slate-200 dark:border-white/15 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/10 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAddPerson}
                  disabled={formLoading || !newPersonName.trim()}
                  className="flex-1 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold transition-colors disabled:opacity-60"
                >
                  {formLoading ? 'Adding…' : 'Add Person'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Transaction Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200 dark:border-white/10">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {editId ? 'Edit Transaction' : 'Add Transaction'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              {formError && (
                <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-sm text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800/60">
                  {formError}
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Date *</label>
                  <input
                    type="date"
                    required
                    value={form.date}
                    onChange={e => handleFormChange('date', e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-white/15 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Type *</label>
                  <select
                    required
                    value={form.type}
                    onChange={e => handleFormChange('type', e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-white/15 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  >
                    <option value="GIVEN">Given (Money I gave)</option>
                    <option value="RECEIVED">Received (Money they returned)</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Amount *</label>
                  <input
                    type="number"
                    required
                    min="0.01"
                    step="0.01"
                    value={form.amount}
                    onChange={e => handleFormChange('amount', e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-white/15 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Currency</label>
                  <select
                    value={form.currency}
                    onChange={e => handleFormChange('currency', e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-white/15 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  >
                    <option value="SAR">SAR</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="GBP">GBP</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Notes</label>
                <textarea
                  rows={3}
                  value={form.notes}
                  onChange={e => handleFormChange('notes', e.target.value)}
                  placeholder="What was this for?…"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-white/15 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none"
                />
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 rounded-lg border border-slate-200 dark:border-white/15 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/10 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="flex-1 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold transition-colors disabled:opacity-60"
                >
                  {formLoading ? 'Saving…' : editId ? 'Save Changes' : 'Add Transaction'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Person Modal */}
      {editPersonId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm border border-slate-200 dark:border-white/10">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Edit Person Name</h2>
              <button
                onClick={() => { setEditPersonId(null); setEditPersonName(''); setFormError(''); }}
                className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
              >
                ✕
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {formError && (
                <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-sm text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800/60">
                  {formError}
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Person Name *</label>
                <input
                  type="text"
                  required
                  value={editPersonName}
                  onChange={e => setEditPersonName(e.target.value)}
                  placeholder="Enter person's name"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-white/15 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  onKeyDown={e => { if (e.key === 'Enter') handleEditPerson(); }}
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => { setEditPersonId(null); setEditPersonName(''); setFormError(''); }}
                  className="flex-1 px-4 py-2 rounded-lg border border-slate-200 dark:border-white/15 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/10 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleEditPerson}
                  disabled={editPersonLoading || !editPersonName.trim()}
                  className="flex-1 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold transition-colors disabled:opacity-60"
                >
                  {editPersonLoading ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Person Confirm Modal */}
      {deletePersonId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm border border-slate-200 dark:border-white/10 p-6">
            <div className="text-center">
              <div className="text-4xl mb-3">⚠️</div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">Delete Person?</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">
                This will delete the person and all their transactions. This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeletePersonId(null)}
                  className="flex-1 px-4 py-2 rounded-lg border border-slate-200 dark:border-white/15 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeletePerson}
                  disabled={deletePersonLoading}
                  className="flex-1 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-semibold disabled:opacity-60"
                >
                  {deletePersonLoading ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Transaction Confirm Modal */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm border border-slate-200 dark:border-white/10 p-6">
            <div className="text-center">
              <div className="text-4xl mb-3">🗑️</div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">Delete Transaction?</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">This action cannot be undone.</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteId(null)}
                  className="flex-1 px-4 py-2 rounded-lg border border-slate-200 dark:border-white/15 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleteLoading}
                  className="flex-1 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-semibold disabled:opacity-60"
                >
                  {deleteLoading ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
