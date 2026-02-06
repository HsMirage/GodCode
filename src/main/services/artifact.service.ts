/**
 * Artifact 服务
 * 管理 Agent 产生的文件产物
 */

import { DatabaseService } from './database'
import { LoggerService } from './logger'
import { BrowserWindow } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

export interface CreateArtifactInput {
  sessionId: string
  taskId?: string
  type: 'code' | 'file' | 'image' | 'data'
  path: string
  content?: string
  changeType: 'created' | 'modified' | 'deleted'
  diff?: string
}

export interface ArtifactData {
  id: string
  sessionId: string
  taskId: string | null
  type: string
  path: string
  content: string | null
  size: number
  changeType: string
  diff: string | null
  accepted: boolean
  createdAt: Date
  updatedAt: Date
}

export class ArtifactService {
  private static instance: ArtifactService
  private _prisma: ReturnType<typeof DatabaseService.prototype.getClient> | null = null
  private logger = LoggerService.getInstance().getLogger()

  private get prisma() {
    if (!this._prisma) {
      this._prisma = DatabaseService.getInstance().getClient()
    }
    return this._prisma
  }

  static getInstance(): ArtifactService {
    if (!ArtifactService.instance) {
      ArtifactService.instance = new ArtifactService()
    }
    return ArtifactService.instance
  }

  /**
   * 创建产物记录
   */
  async createArtifact(input: CreateArtifactInput): Promise<ArtifactData> {
    const size = input.content ? Buffer.byteLength(input.content, 'utf8') : 0

    const artifact = await this.prisma.artifact.create({
      data: {
        sessionId: input.sessionId,
        taskId: input.taskId,
        type: input.type,
        path: input.path,
        content: input.content,
        size,
        changeType: input.changeType,
        diff: input.diff
      }
    })

    this.logger.info('Created artifact', {
      id: artifact.id,
      path: input.path,
      changeType: input.changeType
    })

    this.notifyArtifactCreated(artifact.id)
    return artifact as ArtifactData
  }

  /**
   * 列出会话的所有产物
   */
  async listBySession(sessionId: string): Promise<ArtifactData[]> {
    const artifacts = await this.prisma.artifact.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' }
    })

    return artifacts as ArtifactData[]
  }

  /**
   * 列出任务的产物
   */
  async listByTask(taskId: string): Promise<ArtifactData[]> {
    const artifacts = await this.prisma.artifact.findMany({
      where: { taskId },
      orderBy: { createdAt: 'desc' }
    })

    return artifacts as ArtifactData[]
  }

  /**
   * 获取产物详情
   */
  async getById(id: string): Promise<ArtifactData | null> {
    const artifact = await this.prisma.artifact.findUnique({
      where: { id }
    })

    return artifact as ArtifactData | null
  }

  /**
   * 获取产物的 diff 内容
   */
  async getDiff(id: string): Promise<string | null> {
    const artifact = await this.prisma.artifact.findUnique({
      where: { id },
      select: { diff: true }
    })

    return artifact?.diff || null
  }

  /**
   * 接受产物（标记为已接受）
   */
  async acceptArtifact(id: string): Promise<ArtifactData> {
    const artifact = await this.prisma.artifact.update({
      where: { id },
      data: { accepted: true }
    })

    this.logger.info('Accepted artifact', { id })
    return artifact as ArtifactData
  }

  /**
   * 撤销产物（恢复原始文件）
   */
  async revertArtifact(id: string, workDir: string): Promise<{ success: boolean; error?: string }> {
    const artifact = await this.prisma.artifact.findUnique({
      where: { id }
    })

    if (!artifact) {
      return { success: false, error: 'Artifact not found' }
    }

    try {
      const filePath = path.resolve(workDir, artifact.path)

      if (artifact.changeType === 'created') {
        // 删除创建的文件
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath)
        }
      } else if (artifact.changeType === 'deleted' && artifact.content) {
        // 恢复删除的文件
        const dir = path.dirname(filePath)
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true })
        }
        fs.writeFileSync(filePath, artifact.content, 'utf8')
      }
      // 对于 modified，需要保存原始内容才能恢复

      // 删除产物记录
      await this.prisma.artifact.delete({ where: { id } })

      this.logger.info('Reverted artifact', { id, path: artifact.path })
      return { success: true }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      this.logger.error('Failed to revert artifact', { id, error: errorMsg })
      return { success: false, error: errorMsg }
    }
  }

  /**
   * 获取会话产物统计
   */
  async getSessionStats(sessionId: string) {
    const [total, created, modified, deleted, accepted] = await Promise.all([
      this.prisma.artifact.count({ where: { sessionId } }),
      this.prisma.artifact.count({ where: { sessionId, changeType: 'created' } }),
      this.prisma.artifact.count({ where: { sessionId, changeType: 'modified' } }),
      this.prisma.artifact.count({ where: { sessionId, changeType: 'deleted' } }),
      this.prisma.artifact.count({ where: { sessionId, accepted: true } })
    ])

    return { total, created, modified, deleted, accepted, pending: total - accepted }
  }

  /**
   * 通知前端新产物创建
   */
  private notifyArtifactCreated(artifactId: string) {
    const windows = BrowserWindow.getAllWindows()
    windows.forEach((win) => {
      win.webContents.send('artifact:created', { artifactId })
    })
  }
}
