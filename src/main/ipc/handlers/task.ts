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
        type: task.type as Task['type'],
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

export async function handleTaskCreate(
  _event: IpcMainInvokeEvent,
  data: Omit<Task, 'id' | 'createdAt' | 'startedAt' | 'completedAt'>
): Promise<Task> {
  const logger = LoggerService.getInstance().getLogger()
  const db = DatabaseService.getInstance()
  const prisma = db.getClient()

  try {
    const task = await prisma.task.create({
      data: {
        sessionId: data.sessionId,
        parentTaskId: data.parentTaskId,
        type: data.type,
        status: data.status,
        input: data.input,
        output: data.output,
        assignedModel: data.assignedModel,
        assignedAgent: data.assignedAgent,
        metadata: data.metadata || {}
      }
    })

    return {
      id: task.id,
      sessionId: task.sessionId,
      parentTaskId: task.parentTaskId || undefined,
      type: task.type as Task['type'],
      status: task.status as Task['status'],
      input: task.input,
      output: task.output || undefined,
      assignedModel: task.assignedModel || undefined,
      assignedAgent: task.assignedAgent || undefined,
      createdAt: task.createdAt,
      startedAt: task.startedAt || undefined,
      completedAt: task.completedAt || undefined,
      metadata: (task.metadata as Record<string, unknown>) || undefined
    }
  } catch (error) {
    logger.error('Failed to create task', { data, error })
    throw error
  }
}

export async function handleTaskGet(_event: IpcMainInvokeEvent, taskId: string): Promise<Task> {
  const logger = LoggerService.getInstance().getLogger()
  const db = DatabaseService.getInstance()
  const prisma = db.getClient()

  try {
    const task = await prisma.task.findUniqueOrThrow({
      where: { id: taskId }
    })

    return {
      id: task.id,
      sessionId: task.sessionId,
      parentTaskId: task.parentTaskId || undefined,
      type: task.type as Task['type'],
      status: task.status as Task['status'],
      input: task.input,
      output: task.output || undefined,
      assignedModel: task.assignedModel || undefined,
      assignedAgent: task.assignedAgent || undefined,
      createdAt: task.createdAt,
      startedAt: task.startedAt || undefined,
      completedAt: task.completedAt || undefined,
      metadata: (task.metadata as Record<string, unknown>) || undefined
    }
  } catch (error) {
    logger.error('Failed to get task', { taskId, error })
    throw error
  }
}

export async function handleTaskUpdate(
  _event: IpcMainInvokeEvent,
  data: { id: string } & Partial<Omit<Task, 'id' | 'createdAt'>>
): Promise<Task> {
  const logger = LoggerService.getInstance().getLogger()
  const db = DatabaseService.getInstance()
  const prisma = db.getClient()

  try {
    const { id, ...updateData } = data
    const task = await prisma.task.update({
      where: { id },
      data: {
        ...updateData,
        metadata: updateData.metadata || undefined
      }
    })

    return {
      id: task.id,
      sessionId: task.sessionId,
      parentTaskId: task.parentTaskId || undefined,
      type: task.type as Task['type'],
      status: task.status as Task['status'],
      input: task.input,
      output: task.output || undefined,
      assignedModel: task.assignedModel || undefined,
      assignedAgent: task.assignedAgent || undefined,
      createdAt: task.createdAt,
      startedAt: task.startedAt || undefined,
      completedAt: task.completedAt || undefined,
      metadata: (task.metadata as Record<string, unknown>) || undefined
    }
  } catch (error) {
    logger.error('Failed to update task', { data, error })
    throw error
  }
}
