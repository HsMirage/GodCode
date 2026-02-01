import type { IpcMainInvokeEvent } from 'electron'
import type { Task as PrismaTask } from '@prisma/client'
import { DatabaseService } from '@/main/services/database'
import { LoggerService } from '@/main/services/logger'
import type { Task } from '@/types/domain'

export async function handleTaskList(
  _event: IpcMainInvokeEvent,
  sessionId: string
): Promise<Task[]> {
  const logger = LoggerService.getInstance().getLogger()
  const db = DatabaseService.getInstance()
  const prisma = db.getClient()

  try {
    const tasks = await prisma.task.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' }
    })

    return tasks.map(
      (task: PrismaTask): Task => ({
        id: task.id,
        sessionId: task.sessionId,
        parentTaskId: task.parentTaskId || undefined,
        type: task.type as 'user' | 'delegated' | 'workforce',
        status: task.status as Task['status'],
        input: task.input,
        output: task.output || undefined,
        assignedModel: task.assignedModel || undefined,
        assignedAgent: task.assignedAgent || undefined,
        createdAt: task.createdAt,
        startedAt: task.startedAt || undefined,
        completedAt: task.completedAt || undefined,
        metadata: (task.metadata as Record<string, unknown>) || undefined
      })
    )
  } catch (error) {
    logger.error('Failed to list tasks', { sessionId, error })
    throw error
  }
}
