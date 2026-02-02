import { ipcMain, shell } from 'electron'
import fs from 'fs'
import path from 'path'
import { PathValidator } from '@/shared/path-validator'
import { AuditLogService } from '../../services/audit-log.service'
import { DatabaseService } from '../../services/database'

export function registerArtifactHandlers(): void {
  const auditLogService = AuditLogService.getInstance()
  const logAudit = (input: {
    action: string
    entityType: string
    entityId?: string
    metadata?: any
    success?: boolean
    errorMsg?: string
  }) => {
    void auditLogService.log(input).catch(error => {
      console.error('Failed to write audit log:', error)
    })
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
          metadata: { filePath, sessionId },
          success: false,
          errorMsg: 'Session not found'
        })
        return { success: false, error: 'Session not found' }
      }

      const workDir = session.space.workDir
      let resolvedPath: string

      if (!PathValidator.isPathSafe(filePath, workDir)) {
        logAudit({
          action: 'file:read',
          entityType: 'file',
          entityId: filePath,
          metadata: { filePath, sessionId, workDir },
          success: false,
          errorMsg: 'Path traversal detected'
        })
        return { success: false, error: 'Path traversal detected' }
      }

      try {
        resolvedPath = PathValidator.resolveSafePath(filePath, workDir)
      } catch (error) {
        logAudit({
          action: 'file:read',
          entityType: 'file',
          entityId: filePath,
          metadata: { filePath, sessionId, workDir },
          success: false,
          errorMsg: (error as Error).message
        })
        return { success: false, error: 'Path traversal detected' }
      }

      if (!fs.existsSync(resolvedPath)) {
        logAudit({
          action: 'file:read',
          entityType: 'file',
          entityId: filePath,
          metadata: { filePath, sessionId, workDir },
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
        metadata: { filePath, sessionId, workDir },
        success: true
      })
      return { success: true, content }
    } catch (error) {
      logAudit({
        action: 'file:read',
        entityType: 'file',
        entityId: filePath,
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
  ipcMain.handle('artifact:list', async (_, sessionId: string, includeContent = false) => {
    try {
      const db = DatabaseService.getInstance().getClient()
      const select = includeContent
        ? undefined
        : {
            id: true,
            sessionId: true,
            taskId: true,
            type: true,
            path: true,
            size: true,
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
  })

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
}
