import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { requireModuleAccess } from '@/lib/rbac'
import { CirclysClient } from '@/components/savings/CirclysClient'

export default async function CirclysPage() {
  await requireModuleAccess('savings')
  const user = await getCurrentUser()
  
  if (!user) {
    return null
  }

  let investments: any[] = []

  if (user.role === 'OWNER') {
    investments = await prisma.investment.findMany({
      where: {
        account: {
          type: 'CIRCLYS',
          isActive: true
        }
      },
      include: {
        account: true,
        dealParticipants: {
          include: { person: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })
  } else if (user.role === 'PARTNER' && user.personId) {
    const participants = await prisma.dealParticipant.findMany({
      where: { 
        personId: user.personId,
        investment: {
          account: {
            type: 'CIRCLYS'
          }
        }
      },
      include: {
        investment: {
          include: { account: true },
        },
      },
    })
    
    investments = participants.map((p: any) => ({
      ...p.investment,
      myParticipation: {
        investedAmount: p.investedAmount,
        currentValue: p.currentValue,
        profit: p.profit,
      },
    }))
  }

  return <CirclysClient initialInvestments={investments} userRole={user.role} />
}
