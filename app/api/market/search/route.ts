import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'

interface SearchResult {
  symbol: string
  name: string
  icon: string
  type: 'crypto' | 'stock' | 'forex' | 'commodity' | 'index'
}

// Popular cryptos
const CRYPTO_DB = [
  { symbol: 'BTC', name: 'Bitcoin', icon: '₿' },
  { symbol: 'ETH', name: 'Ethereum', icon: 'Ξ' },
  { symbol: 'BNB', name: 'Binance Coin', icon: '🔶' },
  { symbol: 'SOL', name: 'Solana', icon: '◎' },
  { symbol: 'XRP', name: 'Ripple', icon: '💧' },
  { symbol: 'ADA', name: 'Cardano', icon: '🔷' },
  { symbol: 'DOGE', name: 'Dogecoin', icon: '🐕' },
  { symbol: 'AVAX', name: 'Avalanche', icon: '🔺' },
  { symbol: 'DOT', name: 'Polkadot', icon: '⚪' },
  { symbol: 'MATIC', name: 'Polygon', icon: '🟣' },
  { symbol: 'LINK', name: 'Chainlink', icon: '🔗' },
  { symbol: 'UNI', name: 'Uniswap', icon: '🦄' },
]

// Major stocks
const STOCK_DB = [
  { symbol: 'AAPL', name: 'Apple Inc.', icon: '🍎' },
  { symbol: 'MSFT', name: 'Microsoft', icon: '💻' },
  { symbol: 'GOOGL', name: 'Alphabet (Google)', icon: '🔍' },
  { symbol: 'AMZN', name: 'Amazon', icon: '📦' },
  { symbol: 'TSLA', name: 'Tesla', icon: '🚗' },
  { symbol: 'META', name: 'Meta (Facebook)', icon: '👤' },
  { symbol: 'NVDA', name: 'NVIDIA', icon: '🎮' },
  { symbol: 'NFLX', name: 'Netflix', icon: '🎬' },
]

// Forex pairs
const FOREX_DB = [
  { symbol: 'EUR/USD', name: 'Euro to US Dollar', icon: '💱' },
  { symbol: 'GBP/USD', name: 'British Pound to US Dollar', icon: '💷' },
  { symbol: 'USD/JPY', name: 'US Dollar to Japanese Yen', icon: '💴' },
  { symbol: 'USD/SAR', name: 'US Dollar to Saudi Riyal', icon: '💱' },
  { symbol: 'EUR/SAR', name: 'Euro to Saudi Riyal', icon: '💱' },
  { symbol: 'GBP/SAR', name: 'British Pound to Saudi Riyal', icon: '💱' },
]

// Commodities
const COMMODITY_DB = [
  { symbol: 'GOLD', name: 'Gold', icon: '🥇' },
  { symbol: 'SILVER', name: 'Silver', icon: '🥈' },
  { symbol: 'OIL', name: 'Brent Crude Oil', icon: '🛢️' },
  { symbol: 'WTI', name: 'WTI Crude Oil', icon: '🛢️' },
]

// Indices
const INDEX_DB = [
  { symbol: 'S&P', name: 'S&P 500', icon: '📈' },
  { symbol: 'DJI', name: 'Dow Jones Industrial', icon: '📊' },
  { symbol: 'NASDAQ', name: 'NASDAQ Composite', icon: '💹' },
  { symbol: 'FTSE', name: 'FTSE 100', icon: '🇬🇧' },
]

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q')?.toLowerCase().trim()

    if (!query) {
      return NextResponse.json({ results: [] })
    }

    const results: SearchResult[] = []

    // Search cryptos
    CRYPTO_DB.forEach(asset => {
      if (asset.symbol.toLowerCase().includes(query) || asset.name.toLowerCase().includes(query)) {
        results.push({ ...asset, type: 'crypto' })
      }
    })

    // Search stocks
    STOCK_DB.forEach(asset => {
      if (asset.symbol.toLowerCase().includes(query) || asset.name.toLowerCase().includes(query)) {
        results.push({ ...asset, type: 'stock' })
      }
    })

    // Search forex
    FOREX_DB.forEach(asset => {
      if (asset.symbol.toLowerCase().includes(query) || asset.name.toLowerCase().includes(query)) {
        results.push({ ...asset, type: 'forex' })
      }
    })

    // Search commodities
    COMMODITY_DB.forEach(asset => {
      if (asset.symbol.toLowerCase().includes(query) || asset.name.toLowerCase().includes(query)) {
        results.push({ ...asset, type: 'commodity' })
      }
    })

    // Search indices
    INDEX_DB.forEach(asset => {
      if (asset.symbol.toLowerCase().includes(query) || asset.name.toLowerCase().includes(query)) {
        results.push({ ...asset, type: 'index' })
      }
    })

    // Limit to 20 results
    return NextResponse.json({ results: results.slice(0, 20) })
  } catch (error) {
    console.error('Market search error:', error)
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }
}
