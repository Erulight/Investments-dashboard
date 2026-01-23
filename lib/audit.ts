import { prisma } from './db'

export async function createAuditLog(
  userId: string,
  action: 'CREATE' | 'UPDATE' | 'DELETE',
  entityType: string,
  entityId: string,
  changes?: any
) {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        entityType,
        entityId,
        changes: changes ? JSON.stringify(changes) : null,
      },
    })
  } catch (error) {
    console.error('Failed to create audit log:', error)
  }
}
