import type { IpcMainInvokeEvent } from 'electron'
import type { Task as PrismaTask } from '@prisma/client'
import { DatabaseService } from '@/main/services/database'
import { LoggerService } from '@/main/services/logger'
import { sanitizeCompletionOutput } from '@/main/services/workforce/output-sanitizer'
import type { Task } from '@/types/domain'

async function getPrismaClient() {
  const db = DatabaseService.getInstance()
  await db.init()
  return db.getClient()
}

function isDatabaseConnectionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }

  const code = 'code' in error ? String(error.code) : ''
  const message = error instanceof Error ? error.message : String(error)

  return (
    code === 'P1001' ||
    code === 'P1017' ||
    /Can't reach database server/i.test(message) ||
    /server has closed the connection/i.test(message) ||
    /connection terminated unexpectedly/i.test(message) ||
    /ECONNREFUSED/i.test(message) ||
    /ECONNRESET/i.test(message)
  )
}

async function withDatabaseReconnectRetry<T>(
  operationName: string,
  execute: (prisma: Awaited<ReturnType<typeof getPrismaClient>>) => Promise<T>
): Promise<T> {
  const logger = LoggerService.getInstance().getLogger()
  const db = DatabaseService.getInstance()
  const prisma = await getPrismaClient()

  try {
    return await execute(prisma)
  } catch (error) {
    if (!isDatabaseConnectionError(error)) {
      throw error
    }

    logger.warn(`Database connection lost during ${operationName}, reconnecting and retrying`, {
      operationName,
      error
    })

    await db.reconnect()
    return execute(db.getClient())
  }
}

export async function handleTaskList(
  _event: IpcMainInvokeEvent,
  sessionId: string
): Promise<Task[]> {
  const logger = LoggerService.getInstance().getLogger()

  try {
    const tasks = await withDatabaseReconnectRetry('task:list', prisma =>
      prisma.task.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' }
      })
    )

    return tasks.map(
      (task: PrismaTask): Task => ({
        id: task.id,
        sessionId: task.sessionId,
        parentTaskId: task.parentTaskId || undefined,
        type: task.type as Task['type'],
        status: task.status as Task['status'],
        input: task.input,
        output: task.output ? sanitizeCompletionOutput(task.output) : undefined,
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

  try {
    const task = await withDatabaseReconnectRetry('task:create', prisma =>
      prisma.task.create({
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
    )

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

  try {
    const task = await withDatabaseReconnectRetry('task:get', prisma =>
      prisma.task.findUniqueOrThrow({
        where: { id: taskId }
      })
    )

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

  try {
    const { id, ...updateData } = data
    const task = await withDatabaseReconnectRetry('task:update', prisma =>
      prisma.task.update({
        where: { id },
        data: {
          ...updateData,
          metadata: updateData.metadata || undefined
        }
      })
    )

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
