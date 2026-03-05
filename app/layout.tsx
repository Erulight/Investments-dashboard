import type { Metadata } from 'next'
import './globals.css'
import AutoRefresher from '@/components/system/AutoRefresher'

export const metadata: Metadata = {
  title: 'Legacy Loop',
  description: 'Smart Investment Platform - Comprehensive portfolio management system',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(() => {
  try {
    const stored = localStorage.getItem('theme')
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
    const shouldDark = stored ? stored === 'dark' : prefersDark
    if (shouldDark) document.documentElement.classList.add('dark')
    else document.documentElement.classList.remove('dark')
  } catch {}
})()`
          }}
        />
      </head>
      <body className="bg-background text-foreground">
        <AutoRefresher />
        {children}
      </body>
    </html>
  )
}
