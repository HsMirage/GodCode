import { Prisma, Space } from '@prisma/client'
import { mkdirSync } from 'fs'
import path from 'path'
import { DatabaseService } from './database'

export async function createSpace(input: { name: string; workDir: string }): Promise<Space> {
  try {
    const prisma = DatabaseService.getInstance().getClient()

    const artifactsDir = path.join(input.workDir, '.codeall', 'artifacts')
    const downloadsDir = path.join(input.workDir, '.codeall', 'downloads')

    mkdirSync(artifactsDir, { recursive: true })
    mkdirSync(downloadsDir, { recursive: true })

    const space = await prisma.space.create({
      data: {
        name: input.name,
        workDir: input.workDir
      }
    })

    console.log(`[Space] Created: ${space.name}`)
    return space
  } catch (error) {
    console.error('[Space] Failed to create space:', error)
    throw error
  }
}

export async function listSpaces(): Promise<Space[]> {
  try {
    const dbService = DatabaseService.getInstance()
    // In E2E test environment, database may not be initialized
    if (process.env.CODEALL_E2E_TEST === '1') {
      try {
        const prisma = dbService.getClient()
        const spaces = await prisma.space.findMany({
          orderBy: {
            updatedAt: 'desc'
          }
        })
        return spaces
      } catch {
        // Return empty array if database not initialized in test environment
        return []
      }
    }
    const prisma = dbService.getClient()
    const spaces = await prisma.space.findMany({
      orderBy: {
        updatedAt: 'desc'
      }
    })
    return spaces
  } catch (error) {
    console.error('[Space] Failed to list spaces:', error)
    throw error
  }
}

export async function getSpace(spaceId: string): Promise<Space | null> {
  try {
    const prisma = DatabaseService.getInstance().getClient()
    const space = await prisma.space.findUnique({
      where: {
        id: spaceId
      }
    })
    return space
  } catch (error) {
    console.error(`[Space] Failed to get space ${spaceId}:`, error)
    throw error
  }
}

export async function deleteSpace(spaceId: string): Promise<boolean> {
  try {
    const prisma = DatabaseService.getInstance().getClient()

    // Manual cascade delete (schema relations do not specify onDelete: Cascade).
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.run.deleteMany({ where: { task: { session: { spaceId } } } })
      await tx.task.deleteMany({ where: { session: { spaceId } } })
      await tx.artifact.deleteMany({ where: { session: { spaceId } } })
      await tx.message.deleteMany({ where: { session: { spaceId } } })
      await tx.session.deleteMany({ where: { spaceId } })
      await tx.space.delete({ where: { id: spaceId } })
    })

    console.log(`[Space] Deleted space: ${spaceId}`)
    return true
  } catch (error) {
    console.error(`[Space] Failed to delete space ${spaceId}:`, error)
    return false
  }
}

export async function updateSpace(
  spaceId: string,
  updates: { name?: string; workDir?: string }
): Promise<Space | null> {
  try {
    const prisma = DatabaseService.getInstance().getClient()
    const space = await prisma.space.update({
      where: {
        id: spaceId
      },
      data: updates
    })
    console.log(`[Space] Updated space: ${space.name}`)
    return space
  } catch (error) {
    console.error(`[Space] Failed to update space ${spaceId}:`, error)
    throw error
  }
}
