import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { SIPClient } from '@/components/sip/SIPClient'

export default async function SIPPage() {
  const user = await getCurrentUser()
  
  if (!user) {
    return <div>Please log in to view SIP plans.</div>
  }

  // Fetch investments for SIPs (category: SIP)
  const investments = await prisma.investment.findMany({
    where: {
      category: 'SIP',
    },
    include: {
      account: true,
      dealParticipants: {
        include: { person: true },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  })

  // For owners, show all SIPs; for partners, show only their participating SIPs
  const filteredInvestments = user.role === 'OWNER' 
    ? investments
    : investments.filter(inv => 
        inv.dealParticipants.some(dp => dp.person.user?.id === user.id)
      )

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Systematic Investment Plans</h1>
        <p className="text-gray-600 mt-2">
          Manage your SIP investments with multiple companies and categories
        </p>
      </div>
      
      <SIPClient 
        investments={filteredInvestments} 
        userRole={user.role}
      />
    </div>
  )
}
