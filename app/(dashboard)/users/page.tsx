import { redirect } from 'next/navigation'
import { requireAuth } from '@/lib/rbac'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { UserList } from '@/components/users/UserList'
import { CreateUserForm } from '@/components/users/CreateUserForm'

export default async function UsersPage() {
  await requireAuth(['OWNER'])

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-xl shadow-md p-6 text-white">
        <h1 className="text-2xl font-bold">User Management</h1>
        <p className="text-sm text-slate-400 mt-1">Create and manage user accounts with granular permissions</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-bold text-gray-800">Create New User</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateUserForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-bold text-gray-800">Existing Users</CardTitle>
        </CardHeader>
        <CardContent>
          <UserList />
        </CardContent>
      </Card>
    </div>
  )
}
