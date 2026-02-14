import React, { type ReactElement } from 'react'
import { Prisma } from '@prisma/client'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { SIPClient } from '@/components/sip/SIPClient'

type InvestmentWithRelations = Prisma.InvestmentGetPayload<{
  include: {
    account: true
    dealParticipants: {
      include: {
        person: {
          include: { user: true }
        }
      }
    }
  }
}>

export default async function SIPPage(): Promise<ReactElement> {
  const user = await getCurrentUser()
  
  if (!user) {
    return <div>Please log in to view SIP plans.</div>
  }

  // Fetch investments for SIPs (category: SIP)
  const investments: InvestmentWithRelations[] = await prisma.investment.findMany({
    where: {
      category: 'SIP',
    },
    include: {
      account: true,
      dealParticipants: {
        include: { 
          person: {
            include: { user: true }
          }
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  })

  // For owners, show all SIPs; for partners, show only their participating SIPs
  const filteredInvestments: InvestmentWithRelations[] = user.role === 'OWNER' 
    ? investments
    : investments.filter((inv: InvestmentWithRelations) => 
        inv.dealParticipants.some((dp) => dp.person?.user?.id === user.id)
      )

  // Transform to match client component types (convert Date to string, null to undefined)
  const transformedInvestments = filteredInvestments.map((inv: InvestmentWithRelations) => ({
    ...inv,
    startDate: inv.startDate.toISOString(),
    metadata: inv.metadata || undefined,
    notes: inv.notes || undefined,
    maturityDate: inv.maturityDate?.toISOString() || undefined,
    reopenedAt: inv.reopenedAt?.toISOString() || undefined,
  }))

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Systematic Investment Plans</h1>
        <p className="text-gray-600 mt-2">
          Manage your SIP investments with multiple companies and categories
        </p>
      </div>
      
      <SIPClient 
        investments={transformedInvestments} 
        userRole={user.role}
      />
    </div>
  )
}
