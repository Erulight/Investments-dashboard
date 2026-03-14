'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface MarketAsset {
  symbol: string
  name: string
  price: number
  change24h: number
  enabled: boolean
}

const DEFAULT_ASSETS = [
  { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', type: 'crypto' },
  { id: 'ethereum', symbol: 'ETH', name: 'Ethereum', type: 'crypto' },
  { id: 'SPX', symbol: 'S&P', name: 'S&P 500', type: 'index' },
  { id: 'USDSAR', symbol: 'USD/SAR', name: 'USD to SAR', type: 'forex' },
  { id: 'BRENT', symbol: 'OIL', name: 'Brent Crude', type: 'commodity' },
]

export function LiveMarketTicker() {
  const [assets, setAssets] = useState<MarketAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchMarketData = async () => {
    try {
      setError(null)
      const response = await fetch('/api/market/live')
      if (!response.ok) throw new Error('Failed to fetch market data')
      const data = await response.json()
      setAssets(data.assets || [])
      setLoading(false)
    } catch (err) {
      console.error('Market data fetch error:', err)
      setError('Failed to load market data')
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchMarketData()
    const interval = setInterval(fetchMarketData, 60000)
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <div className="bg-slate-900/50 backdrop-blur border-t border-slate-800 py-2.5 px-4">
        <div className="flex items-center gap-6">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-pulse" />
            Loading Market
          </span>
        </div>
      </div>
    )
  }

  if (error || assets.length === 0) {
    return null
  }

  return (
    <div className="bg-slate-900/50 backdrop-blur border-t border-slate-800 py-2.5 px-4 overflow-hidden">
      <div className="flex items-center gap-6">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2 flex-shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          Live Market
        </span>

        <div className="flex items-center gap-5 flex-1 overflow-x-auto scrollbar-hide">
          <AnimatePresence mode="wait">
            {assets.filter(a => a.enabled).map((asset, idx) => (
              <motion.div
                key={asset.symbol}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                transition={{ delay: idx * 0.05 }}
                className="flex items-center gap-2 flex-shrink-0"
              >
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wide">
                  {asset.symbol}
                </span>
                <span className="text-xs font-semibold text-white tabular-nums">
                  {asset.price.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: asset.symbol.includes('/') ? 4 : 2,
                  })}
                </span>
                <span
                  className={`text-xs font-bold tabular-nums ${
                    asset.change24h >= 0 ? 'text-emerald-400' : 'text-red-400'
                  }`}
                >
                  {asset.change24h >= 0 ? '+' : ''}
                  {asset.change24h.toFixed(2)}%
                </span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
