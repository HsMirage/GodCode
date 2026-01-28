import { IpcMainInvokeEvent } from 'electron'
import { Session as PrismaSession } from '@prisma/client'
import { DatabaseService } from '../../services/database'
import { LoggerService } from '../../services/logger'

const DEFAULT_SESSION_TITLE = 'New Chat'

type SessionCreateInput = {
  spaceId: string
  title?: string
}

type SessionGetOrCreateDefaultInput = {
  spaceId?: string
}

export async function handleSessionCreate(
  _event: IpcMainInvokeEvent,
  input: SessionCreateInput
): Promise<PrismaSession> {
  const prisma = DatabaseService.getInstance().getClient()
  const logger = LoggerService.getInstance().getLogger()

  const title = input.title?.trim() || DEFAULT_SESSION_TITLE
  const createdSession = await prisma.session.create({
    data: {
      spaceId: input.spaceId,
      title
    }
  })

  logger.info(`Session created: ${createdSession.id} (space: ${input.spaceId})`)
  return createdSession
}

export async function handleSessionGetOrCreateDefault(
  _event: IpcMainInvokeEvent,
  input: SessionGetOrCreateDefaultInput = {}
): Promise<PrismaSession> {
  const prisma = DatabaseService.getInstance().getClient()
  const logger = LoggerService.getInstance().getLogger()

  if (input.spaceId) {
    const existing = await prisma.session.findFirst({
      where: { spaceId: input.spaceId },
      orderBy: { createdAt: 'asc' }
    })

    if (existing) {
      logger.debug(`Default session resolved for space ${input.spaceId}: ${existing.id}`)
      return existing
    }

    const created = await prisma.session.create({
      data: {
        spaceId: input.spaceId,
        title: DEFAULT_SESSION_TITLE
      }
    })

    logger.info(`Default session created: ${created.id} (space: ${input.spaceId})`)
    return created
  }

  const existingAny = await prisma.session.findFirst({ orderBy: { createdAt: 'asc' } })
  if (existingAny) {
    logger.debug(`Default session resolved: ${existingAny.id}`)
    return existingAny
  }

  const defaultSpace = await prisma.space.findFirst({ orderBy: { createdAt: 'asc' } })
  if (!defaultSpace) {
    logger.error('No spaces found when creating default session')
    throw new Error('No spaces available to create default session.')
  }

  const created = await prisma.session.create({
    data: {
      spaceId: defaultSpace.id,
      title: DEFAULT_SESSION_TITLE
    }
  })

  logger.info(`Default session created: ${created.id} (space: ${defaultSpace.id})`)
  return created
}

export async function handleSessionGet(
  _event: IpcMainInvokeEvent,
  id: PrismaSession['id']
): Promise<PrismaSession> {
  const prisma = DatabaseService.getInstance().getClient()
  const logger = LoggerService.getInstance().getLogger()

  const session = await prisma.session.findUnique({ where: { id } })
  if (!session) {
    logger.warn(`Session not found: ${id}`)
    throw new Error('Session not found')
  }

  return session
}

export async function handleSessionList(_event: IpcMainInvokeEvent): Promise<PrismaSession[]> {
  const prisma = DatabaseService.getInstance().getClient()
  const sessions = await prisma.session.findMany({ orderBy: { updatedAt: 'desc' } })
  return sessions
}
