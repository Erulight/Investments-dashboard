'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const DEFAULT_ASSETS = [
  { symbol: 'BTC', name: 'Bitcoin', icon: '₿', type: 'crypto' },
  { symbol: 'ETH', name: 'Ethereum', icon: 'Ξ', type: 'crypto' },
  { symbol: 'S&P', name: 'S&P 500', icon: '📈', type: 'index' },
  { symbol: 'USD/SAR', name: 'USD to SAR', icon: '💱', type: 'forex' },
  { symbol: 'OIL', name: 'Brent Crude', icon: '🛢️', type: 'commodity' },
]

interface Asset {
  symbol: string
  name: string
  icon: string
  type: 'crypto' | 'stock' | 'forex' | 'commodity' | 'index'
}

export function MarketTickerSettings() {
  const [enabled, setEnabled] = useState<string[]>([])
  const [customAssets, setCustomAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<Asset[]>([])
  const [showSearch, setShowSearch] = useState(false)

  useEffect(() => {
    fetchPreferences()
  }, [])

  const fetchPreferences = async () => {
    try {
      const response = await fetch('/api/settings/market-ticker')
      if (!response.ok) throw new Error('Failed to fetch preferences')
      const data = await response.json()
      setEnabled(data.preferences?.enabled || [])
      setCustomAssets(data.preferences?.custom || [])
    } catch (error) {
      console.error('Fetch preferences error:', error)
      setEnabled(['BTC', 'ETH', 'S&P', 'USD/SAR', 'OIL'])
      setCustomAssets([])
    } finally {
      setLoading(false)
    }
  }

  const savePreferences = async (newEnabled: string[], newCustom: Asset[]) => {
    setSaving(true)
    try {
      const response = await fetch('/api/settings/market-ticker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: newEnabled, custom: newCustom }),
      })
      if (!response.ok) throw new Error('Failed to save preferences')
    } catch (error) {
      console.error('Save preferences error:', error)
    } finally {
      setSaving(false)
    }
  }

  const toggleAsset = async (symbol: string) => {
    const newEnabled = enabled.includes(symbol)
      ? enabled.filter(s => s !== symbol)
      : [...enabled, symbol]
    setEnabled(newEnabled)
    await savePreferences(newEnabled, customAssets)
  }

  const searchAssets = async () => {
    if (!searchQuery.trim()) return
    setSearching(true)
    try {
      const response = await fetch(`/api/market/search?q=${encodeURIComponent(searchQuery)}`)
      if (!response.ok) throw new Error('Search failed')
      const data = await response.json()
      setSearchResults(data.results || [])
    } catch (error) {
      console.error('Search error:', error)
      setSearchResults([])
    } finally {
      setSearching(false)
    }
  }

  const addCustomAsset = async (asset: Asset) => {
    if (customAssets.some(a => a.symbol === asset.symbol)) return
    const newCustom = [...customAssets, asset]
    const newEnabled = [...enabled, asset.symbol]
    setCustomAssets(newCustom)
    setEnabled(newEnabled)
    setShowSearch(false)
    setSearchQuery('')
    setSearchResults([])
    await savePreferences(newEnabled, newCustom)
  }

  const removeCustomAsset = async (symbol: string) => {
    const newCustom = customAssets.filter(a => a.symbol !== symbol)
    const newEnabled = enabled.filter(s => s !== symbol)
    setCustomAssets(newCustom)
    setEnabled(newEnabled)
    await savePreferences(newEnabled, newCustom)
  }

  const allAssets = [...DEFAULT_ASSETS, ...customAssets]

  if (loading) {
    return (
      <div className="p-6 bg-slate-900/50 rounded-xl border border-slate-700">
        <p className="text-slate-400 text-sm">Loading...</p>
      </div>
    )
  }

  return (
    <div className="p-6 bg-slate-900/50 rounded-xl border border-slate-700 space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-white mb-1">Live Market Ticker</h3>
        <p className="text-sm text-slate-400">Choose which assets appear in the ticker</p>
      </div>

      {/* Add Asset Button */}
      <button
        onClick={() => setShowSearch(!showSearch)}
        className="w-full flex items-center justify-center gap-2 p-3 rounded-lg border border-dashed border-slate-600 hover:border-emerald-500/50 bg-slate-800/30 hover:bg-emerald-500/5 text-slate-400 hover:text-emerald-400 transition-all"
      >
        <span className="text-xl">+</span>
        <span className="text-sm font-medium">Add Custom Asset</span>
      </button>

      {/* Search Interface */}
      <AnimatePresence>
        {showSearch && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="space-y-3 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && searchAssets()}
                  placeholder="Search crypto, stocks, forex..."
                  className="flex-1 px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
                />
                <button
                  onClick={searchAssets}
                  disabled={searching || !searchQuery.trim()}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {searching ? '...' : 'Search'}
                </button>
              </div>

              {searchResults.length > 0 && (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {searchResults.map((asset) => (
                    <button
                      key={asset.symbol}
                      onClick={() => addCustomAsset(asset)}
                      className="w-full flex items-center justify-between p-3 bg-slate-900/50 hover:bg-slate-900 border border-slate-700 hover:border-emerald-500/30 rounded-lg transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-lg">{asset.icon}</span>
                        <div className="text-left">
                          <p className="text-sm font-semibold text-white">{asset.symbol}</p>
                          <p className="text-xs text-slate-500">{asset.name}</p>
                        </div>
                      </div>
                      <span className="text-xs text-emerald-400">+ Add</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Asset List */}
      <div className="space-y-2">
        {allAssets.map((asset) => {
          const isCustom = customAssets.some(a => a.symbol === asset.symbol)
          return (
            <motion.div
              key={asset.symbol}
              className={`w-full flex items-center justify-between p-3 rounded-lg border transition-all duration-200 ${
                enabled.includes(asset.symbol)
                  ? 'bg-emerald-500/10 border-emerald-500/30'
                  : 'bg-slate-800/50 border-slate-700'
              }`}
            >
              <div className="flex items-center gap-3 flex-1">
                <span className="text-xl">{asset.icon}</span>
                <div className="text-left">
                  <p className={`font-semibold ${enabled.includes(asset.symbol) ? 'text-emerald-400' : 'text-slate-300'}`}>
                    {asset.symbol}
                  </p>
                  <p className="text-xs text-slate-500">{asset.name}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {isCustom && (
                  <button
                    onClick={() => removeCustomAsset(asset.symbol)}
                    className="px-2 py-1 text-xs text-red-400 hover:text-red-300 transition-colors"
                  >
                    Remove
                  </button>
                )}
                <button
                  onClick={() => toggleAsset(asset.symbol)}
                  disabled={saving}
                  className={`w-12 h-6 rounded-full p-1 transition-colors ${
                    enabled.includes(asset.symbol) ? 'bg-emerald-500' : 'bg-slate-700'
                  }`}
                >
                  <motion.div
                    className="w-4 h-4 rounded-full bg-white"
                    animate={{ x: enabled.includes(asset.symbol) ? 24 : 0 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  />
                </button>
              </div>
            </motion.div>
          )
        })}
      </div>

      {saving && (
        <p className="text-xs text-slate-500 text-center">Saving...</p>
      )}
    </div>
  )
}
