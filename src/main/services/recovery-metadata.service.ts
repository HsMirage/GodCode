import type { Prisma } from '@prisma/client'
import { DatabaseService } from './database'
import {
  applyRecoveryTrackingMetadata,
  type RecoveryTrackingMetadata
} from '@/shared/recovery-contract'

type RecoveryTaskScope = 'todo-tasks' | 'pending-and-running'

export class RecoveryMetadataService {
  private static instance: RecoveryMetadataService | null = null

  private constructor() {}

  static getInstance(): RecoveryMetadataService {
    if (!RecoveryMetadataService.instance) {
      RecoveryMetadataService.instance = new RecoveryMetadataService()
    }
    return RecoveryMetadataService.instance
  }

  async annotateSessionTasks(
    sessionId: string,
    recovery: RecoveryTrackingMetadata,
    scope: RecoveryTaskScope
  ): Promise<string[]> {
    const db = DatabaseService.getInstance().getClient()

    const where: Prisma.TaskWhereInput = { sessionId }
    if (scope === 'todo-tasks') {
      where.type = 'TODO_ITEM'
      where.status = { in: ['pending', 'in_progress'] }
    } else {
      where.status = { in: ['pending', 'running'] }
    }

    const tasks = await db.task.findMany({
      where,
      select: {
        id: true,
        metadata: true
      }
    })

    for (const task of tasks) {
      await db.task.update({
        where: { id: task.id },
        data: {
          metadata: applyRecoveryTrackingMetadata(
            (task.metadata as Record<string, unknown> | null) || undefined,
            recovery
          ) as Prisma.InputJsonValue
        }
      })
    }

    return tasks.map((task: { id: string }) => task.id)
  }

  async annotateTaskById(taskId: string, recovery: RecoveryTrackingMetadata): Promise<void> {
    const db = DatabaseService.getInstance().getClient()
    const task = await db.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        metadata: true
      }
    })

    if (!task) {
      return
    }

    await db.task.update({
      where: { id: taskId },
      data: {
        metadata: applyRecoveryTrackingMetadata(
          (task.metadata as Record<string, unknown> | null) || undefined,
          recovery
        ) as Prisma.InputJsonValue
      }
    })
  }
}

export const recoveryMetadataService = RecoveryMetadataService.getInstance()
