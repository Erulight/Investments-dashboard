import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { Navbar } from '@/components/dashboard/Navbar'
import { prisma } from '@/lib/db'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getCurrentUser()

  if (!user) {
    redirect('/login')
  }

  const activeAccountTypes = await prisma.account.findMany({
    where: { isActive: true },
    select: { type: true },
  })

  const notifications = await (async () => {
    if (user.role !== 'OWNER') return [] as Array<{ key: string; investmentId: string; message: string; createdAt: string; amounts?: { profit?: number; commission?: number } }>
    const settings = await prisma.systemSetting.findMany({
      where: {
        key: { startsWith: `NOTIFICATION:${user.id}:` },
      },
      select: { key: true, value: true },
    })

    const parsed = settings
      .map((s) => {
        try {
          const v = JSON.parse(s.value)
          if (v?.readAt) return null
          const investmentId = typeof v?.investmentId === 'string'
            ? v.investmentId
            : (typeof s.key.split(':')[2] === 'string' ? s.key.split(':')[2] : '')
          const message = typeof v?.message === 'string' ? v.message : ''
          const createdAt = typeof v?.createdAt === 'string' ? v.createdAt : new Date().toISOString()
          const amounts = v?.amounts && typeof v.amounts === 'object' ? v.amounts : undefined
          if (!investmentId || !message) return null
          return { key: s.key, investmentId, message, createdAt, amounts }
        } catch {
          return null
        }
      })
      .filter((x): x is any => Boolean(x))

    return parsed
  })()

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar
        user={{ name: user.name, email: user.email, role: user.role, permissions: user.permissions }}
        activeAccountTypes={activeAccountTypes.map((a) => a.type)}
        notifications={notifications}
      />
      <main className="w-full max-w-none px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>
    </div>
  )
}
