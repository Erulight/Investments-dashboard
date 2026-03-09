# Auto-Refresh System Guide

This guide explains how to add smooth auto-refresh and cross-tab updates to any page in the application.

## Quick Start

### 1. Add Auto-Refresh to a Page

```tsx
'use client'

import { useAutoRefresh } from '@/lib/useAutoRefresh'

export default function MyPage() {
  // Listen for specific events
  useAutoRefresh({ 
    events: ['sukuk-updated', 'cash-updated'],
    interval: 30000, // Auto-refresh every 30 seconds
    refreshDelay: 500 // Wait 500ms before refreshing after an event
  })

  return <div>Your page content</div>
}
```

### 2. Notify When Data Changes

After any mutation (create, update, delete), notify the system:

```tsx
import { notifyUpdate } from '@/lib/useAutoRefresh'

async function handleSubmit() {
  const res = await fetch('/api/sukuk/create', {
    method: 'POST',
    body: JSON.stringify(data)
  })
  
  if (res.ok) {
    // Notify all listening pages and tabs
    notifyUpdate('sukuk-updated')
    notifyUpdate('investment-updated') // Can send multiple events
    router.refresh()
  }
}
```

## Available Events

- `'investment-updated'` - Any investment change
- `'zakat-updated'` - Zakat payment or calculation change
- `'cash-updated'` - Cash balance or transaction change
- `'savings-updated'` - Savings/ROSCA change
- `'sukuk-updated'` - Sukuk investment change
- `'account-updated'` - Account settings change
- `'any-updated'` - Listen to ALL events

## Options

```tsx
useAutoRefresh({
  // Events to listen for (default: ['any-updated'])
  events: ['sukuk-updated', 'cash-updated'],
  
  // Auto-refresh interval in ms (default: 30000, set to 0 to disable)
  interval: 30000,
  
  // Delay before refreshing after event (default: 500ms)
  refreshDelay: 500
})
```

## Examples

### Sukuk List Page
```tsx
'use client'

import { useAutoRefresh, notifyUpdate } from '@/lib/useAutoRefresh'

export function SukukList() {
  useAutoRefresh({ events: ['sukuk-updated'] })
  
  async function handleCreate() {
    // ... create sukuk
    notifyUpdate('sukuk-updated')
    notifyUpdate('investment-updated')
  }
  
  return <div>...</div>
}
```

### Cash Ledger Page
```tsx
'use client'

import { useAutoRefresh } from '@/lib/useAutoRefresh'

export function CashLedger() {
  // Listen to cash and all investment changes
  useAutoRefresh({ 
    events: ['cash-updated', 'investment-updated'],
    interval: 60000 // Refresh every minute
  })
  
  return <div>...</div>
}
```

### Disable Auto-Refresh
```tsx
useAutoRefresh({ 
  events: ['sukuk-updated'],
  interval: 0 // Only refresh on events, no auto-refresh
})
```

## Global Refresh Indicator

The `GlobalRefreshIndicator` component is already added to the dashboard layout. It automatically shows a notification when any update occurs across the site.

## How It Works

1. **BroadcastChannel API**: Uses browser's BroadcastChannel to communicate between tabs
2. **Event-Driven**: Components notify when they change data
3. **Selective Listening**: Pages only refresh for relevant events
4. **Smooth Updates**: Uses `router.refresh()` instead of full page reload
5. **Cross-Tab**: Changes in one tab automatically update all other open tabs

## Migration Guide

To convert an existing page:

**Before:**
```tsx
async function handleSubmit() {
  await fetch('/api/sukuk/create', { method: 'POST', body: data })
  router.refresh() // Full page reload
}
```

**After:**
```tsx
import { useAutoRefresh, notifyUpdate } from '@/lib/useAutoRefresh'

function MyPage() {
  useAutoRefresh({ events: ['sukuk-updated'] })
  
  async function handleSubmit() {
    await fetch('/api/sukuk/create', { method: 'POST', body: data })
    notifyUpdate('sukuk-updated') // Smooth update + cross-tab sync
    router.refresh()
  }
}
```

## Best Practices

1. **Be Specific**: Use specific events (`sukuk-updated`) instead of `any-updated` when possible
2. **Multiple Events**: Send multiple event types if the change affects multiple areas
3. **Consistent Naming**: Use the same event names across the app
4. **Delay Tuning**: Adjust `refreshDelay` based on API response time
5. **Interval Tuning**: Set longer intervals for pages with heavy queries

## Troubleshooting

**Page not refreshing?**
- Check that you're calling `notifyUpdate()` after mutations
- Verify the event name matches between sender and listener
- Ensure the page is using `'use client'` directive

**Too many refreshes?**
- Increase `refreshDelay` to batch rapid changes
- Use more specific events instead of `any-updated`
- Reduce `interval` or set to 0

**Cross-tab not working?**
- BroadcastChannel requires same origin (domain + port)
- Check browser console for errors
- Verify both tabs are on the same site
