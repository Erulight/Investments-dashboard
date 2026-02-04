import { prisma } from './db'
import type { Prisma } from '@prisma/client'

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

export async function logAudit(
  tx: Prisma.TransactionClient,
  data: {
    userId: string
    action: 'CREATE' | 'UPDATE' | 'DELETE'
    entityType: string
    entityId: string
    changes?: string
  }
) {
  try {
    await tx.auditLog.create({
      data: {
        userId: data.userId,
        action: data.action,
        entityType: data.entityType,
        entityId: data.entityId,
        changes: data.changes || null,
      },
    })
  } catch (error) {
    console.error('Failed to log audit:', error)
  }
}
