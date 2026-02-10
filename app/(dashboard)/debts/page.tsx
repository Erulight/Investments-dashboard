import { getCurrentUser } from '@/lib/auth'
import { requireAuth } from '@/lib/rbac'
import { DebtsClient } from '@/components/debts/DebtsClient'

export const dynamic = 'force-dynamic'

export default async function DebtsPage() {
  await requireAuth(['OWNER'])
  const user = await getCurrentUser()
  if (!user || user.role !== 'OWNER') return null
  return <DebtsClient />
}
