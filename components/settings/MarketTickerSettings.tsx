'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'

const AVAILABLE_ASSETS = [
  { symbol: 'BTC', name: 'Bitcoin', icon: '₿' },
  { symbol: 'ETH', name: 'Ethereum', icon: 'Ξ' },
  { symbol: 'S&P', name: 'S&P 500', icon: '📈' },
  { symbol: 'USD/SAR', name: 'USD to SAR', icon: '💱' },
  { symbol: 'OIL', name: 'Brent Crude', icon: '🛢️' },
]

export function MarketTickerSettings() {
  const [enabled, setEnabled] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchPreferences()
  }, [])

  const fetchPreferences = async () => {
    try {
      const response = await fetch('/api/settings/market-ticker')
      if (!response.ok) throw new Error('Failed to fetch preferences')
      const data = await response.json()
      setEnabled(data.preferences?.enabled || [])
    } catch (error) {
      console.error('Fetch preferences error:', error)
      setEnabled(['BTC', 'ETH', 'S&P', 'USD/SAR', 'OIL'])
    } finally {
      setLoading(false)
    }
  }

  const toggleAsset = async (symbol: string) => {
    const newEnabled = enabled.includes(symbol)
      ? enabled.filter(s => s !== symbol)
      : [...enabled, symbol]
    
    setEnabled(newEnabled)
    setSaving(true)

    try {
      const response = await fetch('/api/settings/market-ticker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: newEnabled }),
      })

      if (!response.ok) throw new Error('Failed to save preferences')
    } catch (error) {
      console.error('Save preferences error:', error)
      setEnabled(enabled)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 bg-slate-900/50 rounded-xl border border-slate-700">
        <p className="text-slate-400 text-sm">Loading...</p>
      </div>
    )
  }

  return (
    <div className="p-6 bg-slate-900/50 rounded-xl border border-slate-700">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-white mb-1">Live Market Ticker</h3>
        <p className="text-sm text-slate-400">Choose which assets appear in the ticker</p>
      </div>

      <div className="space-y-2">
        {AVAILABLE_ASSETS.map((asset) => (
          <motion.button
            key={asset.symbol}
            onClick={() => toggleAsset(asset.symbol)}
            disabled={saving}
            className={`w-full flex items-center justify-between p-3 rounded-lg border transition-all duration-200 ${
              enabled.includes(asset.symbol)
                ? 'bg-emerald-500/10 border-emerald-500/30 hover:border-emerald-500/50'
                : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
            }`}
            whileTap={{ scale: 0.98 }}
          >
            <div className="flex items-center gap-3">
              <span className="text-xl">{asset.icon}</span>
              <div className="text-left">
                <p className={`font-semibold ${enabled.includes(asset.symbol) ? 'text-emerald-400' : 'text-slate-300'}`}>
                  {asset.symbol}
                </p>
                <p className="text-xs text-slate-500">{asset.name}</p>
              </div>
            </div>

            <div className={`w-12 h-6 rounded-full p-1 transition-colors ${
              enabled.includes(asset.symbol) ? 'bg-emerald-500' : 'bg-slate-700'
            }`}>
              <motion.div
                className="w-4 h-4 rounded-full bg-white"
                animate={{ x: enabled.includes(asset.symbol) ? 24 : 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              />
            </div>
          </motion.button>
        ))}
      </div>

      {saving && (
        <p className="text-xs text-slate-500 mt-3 text-center">Saving...</p>
      )}
    </div>
  )
}
