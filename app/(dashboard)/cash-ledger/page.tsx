import { requireAuth } from '@/lib/rbac'
import { CashLedgerClient } from './CashLedgerClient'

export const dynamic = 'force-dynamic'

export default async function CashLedgerPage() {
  await requireAuth(['OWNER'])
  return <CashLedgerClient />
}
