import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { Navbar } from '@/components/dashboard/Navbar'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getCurrentUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar user={{ name: user.name, email: user.email, role: user.role, permissions: user.permissions }} />
      <main className="w-full max-w-none px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>
    </div>
  )
}
