import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { marketTickerPreferences: true },
    })

    if (!dbUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const defaultPrefs = {
      enabled: ['BTC', 'ETH', 'S&P', 'USD/SAR', 'OIL'],
      custom: [],
    }

    let prefs = defaultPrefs
    if (dbUser.marketTickerPreferences) {
      try {
        const parsed = JSON.parse(dbUser.marketTickerPreferences as string)
        prefs = {
          enabled: parsed.enabled || defaultPrefs.enabled,
          custom: parsed.custom || [],
        }
      } catch {
        // Use defaults
      }
    }

    return NextResponse.json({ preferences: prefs })
  } catch (error) {
    console.error('Get market ticker preferences error:', error)
    return NextResponse.json({ error: 'Failed to get preferences' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { enabled, custom } = body

    if (!Array.isArray(enabled)) {
      return NextResponse.json({ error: 'Invalid enabled format' }, { status: 400 })
    }

    const preferences = JSON.stringify({ 
      enabled,
      custom: Array.isArray(custom) ? custom : []
    })

    await prisma.user.update({
      where: { id: user.id },
      data: { marketTickerPreferences: preferences },
    })

    return NextResponse.json({ success: true, preferences: { enabled, custom: custom || [] } })
  } catch (error) {
    console.error('Update market ticker preferences error:', error)
    return NextResponse.json({ error: 'Failed to update preferences' }, { status: 500 })
  }
}
