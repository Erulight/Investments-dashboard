import { requireAuth } from '@/lib/rbac'
import { PersonalLedgerClient } from '@/components/personal-ledger/PersonalLedgerClient'

export const dynamic = 'force-dynamic'

export default async function PersonalLedgerPage() {
  await requireAuth(['OWNER'])
  return <PersonalLedgerClient />
}
