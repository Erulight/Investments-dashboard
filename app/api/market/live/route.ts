import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'

interface MarketAsset {
  symbol: string
  name: string
  price: number
  change24h: number
  enabled: boolean
}

const DEFAULT_ENABLED = ['BTC', 'ETH', 'S&P', 'USD/SAR', 'OIL']

async function fetchCryptoPrice(symbol: string): Promise<{ price: number; change24h: number } | null> {
  try {
    const coinId = symbol === 'BTC' ? 'bitcoin' : symbol === 'ETH' ? 'ethereum' : null
    if (!coinId) return null

    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd&include_24hr_change=true`,
      { next: { revalidate: 60 } }
    )
    
    if (!response.ok) return null
    const data = await response.json()
    
    return {
      price: data[coinId]?.usd || 0,
      change24h: data[coinId]?.usd_24h_change || 0,
    }
  } catch {
    return null
  }
}

async function fetchForexRate(): Promise<{ price: number; change24h: number } | null> {
  try {
    const response = await fetch(
      'https://api.exchangerate-api.com/v4/latest/USD',
      { next: { revalidate: 3600 } }
    )
    
    if (!response.ok) return null
    const data = await response.json()
    
    return {
      price: data.rates?.SAR || 3.75,
      change24h: 0,
    }
  } catch {
    return { price: 3.75, change24h: 0 }
  }
}

async function fetchSPIndex(): Promise<{ price: number; change24h: number } | null> {
  try {
    const response = await fetch(
      'https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?interval=1d&range=2d',
      { next: { revalidate: 300 } }
    )
    
    if (!response.ok) return null
    const data = await response.json()
    
    const quotes = data?.chart?.result?.[0]?.indicators?.quote?.[0]
    const closes = quotes?.close || []
    const currentPrice = closes[closes.length - 1] || 0
    const prevPrice = closes[closes.length - 2] || currentPrice
    const change24h = prevPrice > 0 ? ((currentPrice - prevPrice) / prevPrice) * 100 : 0
    
    return {
      price: currentPrice,
      change24h,
    }
  } catch {
    return null
  }
}

async function fetchBrentOil(): Promise<{ price: number; change24h: number } | null> {
  try {
    const response = await fetch(
      'https://query1.finance.yahoo.com/v8/finance/chart/BZ=F?interval=1d&range=2d',
      { next: { revalidate: 300 } }
    )
    
    if (!response.ok) return null
    const data = await response.json()
    
    const quotes = data?.chart?.result?.[0]?.indicators?.quote?.[0]
    const closes = quotes?.close || []
    const currentPrice = closes[closes.length - 1] || 0
    const prevPrice = closes[closes.length - 2] || currentPrice
    const change24h = prevPrice > 0 ? ((currentPrice - prevPrice) / prevPrice) * 100 : 0
    
    return {
      price: currentPrice,
      change24h,
    }
  } catch {
    return null
  }
}

export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, marketTickerPreferences: true },
    })

    if (!dbUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    let enabledSymbols = DEFAULT_ENABLED
    if (dbUser.marketTickerPreferences) {
      try {
        const prefs = JSON.parse(dbUser.marketTickerPreferences as string)
        if (Array.isArray(prefs.enabled)) {
          enabledSymbols = prefs.enabled
        }
      } catch {
        // Use defaults if parsing fails
      }
    }

    const assets: MarketAsset[] = []

    // Fetch BTC
    const btcData = await fetchCryptoPrice('BTC')
    if (btcData) {
      assets.push({
        symbol: 'BTC',
        name: 'Bitcoin',
        price: btcData.price,
        change24h: btcData.change24h,
        enabled: enabledSymbols.includes('BTC'),
      })
    }

    // Fetch ETH
    const ethData = await fetchCryptoPrice('ETH')
    if (ethData) {
      assets.push({
        symbol: 'ETH',
        name: 'Ethereum',
        price: ethData.price,
        change24h: ethData.change24h,
        enabled: enabledSymbols.includes('ETH'),
      })
    }

    // Fetch S&P 500
    const spData = await fetchSPIndex()
    if (spData) {
      assets.push({
        symbol: 'S&P',
        name: 'S&P 500',
        price: spData.price,
        change24h: spData.change24h,
        enabled: enabledSymbols.includes('S&P'),
      })
    }

    // Fetch USD/SAR
    const forexData = await fetchForexRate()
    if (forexData) {
      assets.push({
        symbol: 'USD/SAR',
        name: 'USD to SAR',
        price: forexData.price,
        change24h: forexData.change24h,
        enabled: enabledSymbols.includes('USD/SAR'),
      })
    }

    // Fetch Brent Oil
    const oilData = await fetchBrentOil()
    if (oilData) {
      assets.push({
        symbol: 'OIL',
        name: 'Brent Crude',
        price: oilData.price,
        change24h: oilData.change24h,
        enabled: enabledSymbols.includes('OIL'),
      })
    }

    return NextResponse.json({ assets })
  } catch (error) {
    console.error('Market API error:', error)
    return NextResponse.json({ error: 'Failed to fetch market data' }, { status: 500 })
  }
}
