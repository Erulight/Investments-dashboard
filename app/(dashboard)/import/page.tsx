import { requireModuleAccess } from '@/lib/rbac'
import ImportClient from './ImportClient'

export default async function ImportPage() {
  await requireModuleAccess('import')

  return <ImportClient />
}
