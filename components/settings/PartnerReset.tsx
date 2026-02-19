'use client'

import { useEffect, useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/sukuk/SukukModal'

type PartnerOption = {
  id: string
  name: string
}

export function PartnerReset() {
  const [isOpen, setIsOpen] = useState(false)
  const [partners, setPartners] = useState<PartnerOption[]>([])
  const [partnerPersonId, setPartnerPersonId] = useState('')
  const [confirmText, setConfirmText] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const loadPartners = async () => {
      try {
        const res = await fetch('/api/partners')
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || 'Failed to load partners')
        setPartners(Array.isArray(data.partners) ? data.partners : [])
      } catch {
        setPartners([])
      }
    }

    loadPartners()
  }, [])

  const openModal = () => {
    setIsOpen(true)
    setPartnerPersonId('')
    setConfirmText('')
    setPassword('')
    setError('')
    setMessage('')
  }

  const closeModal = () => {
    if (loading) return
    setIsOpen(false)
  }

  const handleReset = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    setMessage('')

    try {
      const res = await fetch('/api/settings/reset-partner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partnerPersonId,
          confirmText,
          password,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || 'Failed to reset partner')
      }
      setMessage('Partner reset completed. Refreshing...')
      setTimeout(() => window.location.reload(), 800)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset partner')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-bold text-gray-800">Reset Partner</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-gray-500">
          Resets one partner&apos;s cash ledger and buckets back to a clean state. This does not delete Sukuk deals.
        </p>
        <Button variant="danger" onClick={openModal}>
          Reset a Partner
        </Button>
      </CardContent>

      <Modal isOpen={isOpen} onClose={closeModal} title="Confirm Partner Reset">
        <form onSubmit={handleReset} className="space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 border border-red-200">
              {error}
            </div>
          )}
          {message && (
            <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700 border border-green-200">
              {message}
            </div>
          )}

          <p className="text-sm text-gray-600">
            Select a partner, then type <span className="font-semibold">RESET PARTNER</span> or enter your owner
            password.
          </p>

          <div className="space-y-3">
            <select
              value={partnerPersonId}
              onChange={(e) => setPartnerPersonId(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none"
              required
            >
              <option value="">Select partner...</option>
              {partners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none"
                placeholder="Type RESET PARTNER"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none"
                placeholder="Owner password"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={closeModal} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" disabled={loading || !partnerPersonId}>
              {loading ? 'Resetting...' : 'Confirm Reset'}
            </Button>
          </div>
        </form>
      </Modal>
    </Card>
  )
}
