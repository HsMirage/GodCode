/**
 * Agent Run 服务
 * 管理 Agent 执行记录和日志
 */

import { DatabaseService } from './database'
import { LoggerService } from './logger'
import { BrowserWindow } from 'electron'

export interface RunLogEntry {
  timestamp: string
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
  data?: Record<string, unknown>
}

export interface CreateRunInput {
  taskId: string
  agentCode?: string
}

export interface UpdateRunInput {
  status?: string
  logs?: RunLogEntry[]
  tokenUsage?: { prompt: number; completion: number; total: number }
  cost?: number
}

export class AgentRunService {
  private static instance: AgentRunService
  private _prisma: ReturnType<typeof DatabaseService.prototype.getClient> | null = null
  private logger = LoggerService.getInstance().getLogger()

  private get prisma() {
    if (!this._prisma) {
      this._prisma = DatabaseService.getInstance().getClient()
    }
    return this._prisma
  }

  static getInstance(): AgentRunService {
    if (!AgentRunService.instance) {
      AgentRunService.instance = new AgentRunService()
    }
    return AgentRunService.instance
  }

  /**
   * 创建新的执行记录
   */
  async createRun(input: CreateRunInput) {
    const run = await this.prisma.run.create({
      data: {
        taskId: input.taskId,
        agentCode: input.agentCode,
        status: 'running',
        logs: []
      }
    })

    this.logger.debug('Created agent run', { runId: run.id, taskId: input.taskId })
    this.notifyRunUpdate(run.id)
    return run
  }

  /**
   * 添加日志条目
   */
  async addLog(runId: string, entry: RunLogEntry) {
    const run = await this.prisma.run.findUnique({ where: { id: runId } })
    if (!run) throw new Error(`Run not found: ${runId}`)

    const logs = (run.logs as RunLogEntry[]) || []
    logs.push(entry)

    await this.prisma.run.update({
      where: { id: runId },
      data: { logs }
    })

    this.notifyRunUpdate(runId)
  }

  /**
   * 完成执行
   */
  async completeRun(
    runId: string,
    result: { success: boolean; tokenUsage?: UpdateRunInput['tokenUsage']; cost?: number }
  ) {
    const run = await this.prisma.run.update({
      where: { id: runId },
      data: {
        status: result.success ? 'completed' : 'failed',
        tokenUsage: result.tokenUsage,
        cost: result.cost,
        completedAt: new Date()
      }
    })

    this.logger.info('Completed agent run', { runId, success: result.success })
    this.notifyRunUpdate(runId)
    return run
  }

  /**
   * 获取任务的所有执行记录
   */
  async listByTask(taskId: string) {
    return await this.prisma.run.findMany({
      where: { taskId },
      orderBy: { startedAt: 'desc' }
    })
  }

  /**
   * 获取执行记录详情
   */
  async getById(runId: string) {
    return await this.prisma.run.findUnique({
      where: { id: runId },
      include: { task: true }
    })
  }

  /**
   * 获取执行日志
   */
  async getLogs(runId: string): Promise<RunLogEntry[]> {
    const run = await this.prisma.run.findUnique({
      where: { id: runId },
      select: { logs: true }
    })

    return (run?.logs as RunLogEntry[]) || []
  }

  /**
   * 通知前端运行状态更新
   */
  private notifyRunUpdate(runId: string) {
    const windows = BrowserWindow.getAllWindows()
    windows.forEach((win) => {
      win.webContents.send('agent-run:update', { runId })
    })
  }
}
