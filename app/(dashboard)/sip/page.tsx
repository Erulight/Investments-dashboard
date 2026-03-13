import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { requireModuleAccess } from '@/lib/rbac'
import { prisma } from '@/lib/db'
import MalaaPortfolioRedesigned from '@/components/sip/MalaaPortfolioRedesigned'

export const dynamic = 'force-dynamic'

export default async function SIPPage() {
  await requireModuleAccess('sip')
  const user = await getCurrentUser()

  if (!user) {
    redirect('/login')
  }

  const investment = await prisma.investment.findFirst({
    where: {
      category: 'SIP',
    },
    include: {
      account: true,
      dealParticipants: {
        include: {
          person: {
            include: { user: true },
          },
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  })

  const canView = user.role === 'OWNER'
    || (investment?.dealParticipants?.some((dp: any) => dp.person.user?.id === user.id) ?? false)

  const transformedInvestment = investment && canView
    ? {
        ...investment,
        startDate: investment.startDate.toISOString(),
        metadata: investment.metadata || undefined,
        notes: investment.notes || undefined,
      }
    : undefined

  return (
    <MalaaPortfolioRedesigned investment={transformedInvestment} userRole={user.role} />
  )
}
