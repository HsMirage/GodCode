import { ipcMain, shell } from 'electron'
import fs from 'fs'
import path from 'path'
import { AuditLogService } from '../../services/audit-log.service'
import { DatabaseService } from '../../services/database'
import { ArtifactService } from '../../services/artifact.service'

export function registerArtifactHandlers(): void {
  const auditLogService = AuditLogService.getInstance()
  const logAudit = (input: {
    action: string
    entityType: string
    entityId?: string
    sessionId?: string
    metadata?: any
    success?: boolean
    errorMsg?: string
  }) => {
    void auditLogService.log(input).catch(error => {
      console.error('Failed to write audit log:', error)
    })
  }

  const resolveWorkspacePath = (requestedPath: string, workDir: string) => {
    const normalizedWorkDir = path.resolve(workDir)
    const normalizedRequestedPath = path.normalize(requestedPath)
    const resolvedPath = path.isAbsolute(normalizedRequestedPath)
      ? path.resolve(normalizedRequestedPath)
      : path.resolve(normalizedWorkDir, normalizedRequestedPath)

    const isInsideWorkspace =
      resolvedPath === normalizedWorkDir ||
      resolvedPath.startsWith(`${normalizedWorkDir}${path.sep}`)

    return {
      normalizedWorkDir,
      normalizedRequestedPath,
      resolvedPath,
      isInsideWorkspace
    }
  }

  ipcMain.handle('file:read', async (_, filePath: string, sessionId: string) => {
    try {
      const db = DatabaseService.getInstance().getClient()
      const session = await db.session.findUnique({
        where: { id: sessionId },
        include: { space: true }
      })

      if (!session?.space?.workDir) {
        logAudit({
          action: 'file:read',
          entityType: 'file',
          entityId: filePath,
          sessionId,
          metadata: { filePath, sessionId },
          success: false,
          errorMsg: 'Session not found'
        })
        return { success: false, error: 'Session not found' }
      }

      const workDir = session.space.workDir
      const { normalizedRequestedPath, normalizedWorkDir, resolvedPath, isInsideWorkspace } =
        resolveWorkspacePath(filePath, workDir)

      if (!isInsideWorkspace) {
        const isDevelopment = process.env.NODE_ENV === 'development'
        const auditMetadata = {
          filePath,
          normalizedRequestedPath,
          resolvedPath,
          sessionId,
          workDir: normalizedWorkDir,
          allowedInDevelopment: isDevelopment
        }

        if (!isDevelopment) {
          logAudit({
            action: 'file:read',
            entityType: 'file',
            entityId: filePath,
            sessionId,
            metadata: auditMetadata,
            success: false,
            errorMsg: 'Path outside workspace'
          })
          return { success: false, error: 'Path outside workspace' }
        }

        console.warn('[artifact:file:read] Allowing outside-workspace path in development mode', {
          filePath,
          sessionId,
          resolvedPath,
          workDir: normalizedWorkDir
        })
      }

      if (!fs.existsSync(resolvedPath)) {
        logAudit({
          action: 'file:read',
          entityType: 'file',
          entityId: filePath,
          sessionId,
          metadata: { filePath, sessionId, resolvedPath, workDir: normalizedWorkDir },
          success: false,
          errorMsg: 'File not found'
        })
        return { success: false, error: 'File not found' }
      }
      const content = fs.readFileSync(resolvedPath, 'utf-8')
      logAudit({
        action: 'file:read',
        entityType: 'file',
        entityId: filePath,
        sessionId,
        metadata: { filePath, sessionId, resolvedPath, workDir: normalizedWorkDir },
        success: true
      })
      return { success: true, content }
    } catch (error) {
      logAudit({
        action: 'file:read',
        entityType: 'file',
        entityId: filePath,
        sessionId,
        metadata: { filePath, sessionId },
        success: false,
        errorMsg: (error as Error).message
      })
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('shell:open-path', async (_, filePath: string) => {
    try {
      await shell.openPath(filePath)
      logAudit({
        action: 'shell:open-path',
        entityType: 'file',
        entityId: filePath,
        metadata: { filePath },
        success: true
      })
      return { success: true }
    } catch (error) {
      logAudit({
        action: 'shell:open-path',
        entityType: 'file',
        entityId: filePath,
        metadata: { filePath },
        success: false,
        errorMsg: (error as Error).message
      })
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('artifact:download', async (_, artifactId: string) => {
    try {
      const db = DatabaseService.getInstance().getClient()

      const artifact = await db.artifact.findUnique({
        where: { id: artifactId },
        include: {
          session: {
            include: {
              space: true
            }
          }
        }
      })

      if (!artifact) {
        throw new Error(`Artifact not found: ${artifactId}`)
      }

      if (!artifact.content) {
        throw new Error(`Artifact has no content: ${artifactId}`)
      }

      const workDir = artifact.session.space.workDir

      const downloadsDir = path.join(workDir, '.codeall', 'downloads')

      // Ensure directory exists
      fs.mkdirSync(downloadsDir, { recursive: true })

      // Extract filename from path (e.g., src/utils/helper.ts -> helper.ts)
      const filename = path.basename(artifact.path)
      const filePath = path.join(downloadsDir, filename)

      // Save content
      fs.writeFileSync(filePath, artifact.content, 'utf-8')

      return { success: true, data: { filePath } }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // 2. artifact:delete
  ipcMain.handle('artifact:delete', async (_, artifactId: string) => {
    try {
      const db = DatabaseService.getInstance().getClient()
      await db.artifact.delete({
        where: { id: artifactId }
      })

      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // 3. artifact:list
  ipcMain.handle(
    'artifact:list',
    async (
      _,
      input: string | { sessionId: string; includeContent?: boolean },
      includeContentArg = false
    ) => {
      try {
        const db = DatabaseService.getInstance().getClient()

        const sessionId = typeof input === 'string' ? input : input?.sessionId
        const includeContent =
          typeof input === 'string' ? includeContentArg : Boolean(input?.includeContent)

        if (!sessionId) {
          return []
        }

        const select = includeContent
          ? undefined
          : {
              id: true,
              sessionId: true,
              taskId: true,
              type: true,
              path: true,
              size: true,
              changeType: true,
              accepted: true,
              createdAt: true,
              updatedAt: true,
              content: false
            }

        const artifacts = await db.artifact.findMany({
          where: { sessionId },
          select: select,
          orderBy: { createdAt: 'asc' }
        })
        return artifacts
      } catch (error) {
        console.error('Failed to list artifacts:', error)
        return []
      }
    }
  )

  // 4. artifact:get
  ipcMain.handle('artifact:get', async (_, artifactId: string) => {
    try {
      const db = DatabaseService.getInstance().getClient()
      const artifact = await db.artifact.findUnique({
        where: { id: artifactId }
      })

      if (!artifact) {
        throw new Error(`Artifact not found: ${artifactId}`)
      }

      return artifact
    } catch (error) {
      console.error(`Failed to get artifact ${artifactId}:`, error)
      throw error
    }
  })

  // 5. artifact:get-diff
  ipcMain.handle('artifact:get-diff', async (_, artifactId: string) => {
    try {
      const artifactService = ArtifactService.getInstance()
      return await artifactService.getDiff(artifactId)
    } catch (error) {
      console.error(`Failed to get artifact diff ${artifactId}:`, error)
      return null
    }
  })

  // 6. artifact:accept
  ipcMain.handle('artifact:accept', async (_, artifactId: string) => {
    try {
      const artifactService = ArtifactService.getInstance()
      await artifactService.acceptArtifact(artifactId)
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // 7. artifact:revert
  ipcMain.handle(
    'artifact:revert',
    async (_, { artifactId, workDir }: { artifactId: string; workDir: string }) => {
      try {
        const artifactService = ArtifactService.getInstance()
        return await artifactService.revertArtifact(artifactId, workDir)
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    }
  )

  // 8. artifact:stats
  ipcMain.handle('artifact:stats', async (_, sessionId: string) => {
    try {
      const artifactService = ArtifactService.getInstance()
      return await artifactService.getSessionStats(sessionId)
    } catch (error) {
      console.error(`Failed to get artifact stats:`, error)
      return { total: 0, created: 0, modified: 0, deleted: 0, accepted: 0, pending: 0 }
    }
  })
}
