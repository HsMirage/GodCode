import fs from 'fs'
import path from 'path'

export interface BoulderState {
  active_plan: string
  started_at?: string
  session_ids?: string[]
  plan_name?: string
  agent?: string
  status: 'not_started' | 'in_progress' | 'complete' | 'blocked'
  completed_tasks: number
  total_tasks: number
  completion_percentage: string
  last_updated: string
  current_phase?: string
  phase_status: Record<string, string>
  blockers: string[]
  next_actionable_tasks: string[]
  recent_accomplishments?: string[]
}

/**
 * Service to manage the application's boulder.json state file.
 */
export class BoulderStateService {
  private static instance: BoulderStateService | null = null
  private readonly boulderPaths: string[]

  private constructor() {
    this.boulderPaths = [
      path.join(process.cwd(), '.fuxi', 'boulder.json'),
      path.join(process.cwd(), '.sisyphus', 'boulder.json')
    ]
  }

  static getInstance(): BoulderStateService {
    if (!BoulderStateService.instance) {
      BoulderStateService.instance = new BoulderStateService()
    }
    return BoulderStateService.instance
  }

  async getState(): Promise<BoulderState> {
    const existingPath = this.boulderPaths.find(candidate => fs.existsSync(candidate))
    if (!existingPath) {
      return this.createDefaultState()
    }

    try {
      const content = fs.readFileSync(existingPath, 'utf-8')
      const parsed = JSON.parse(content) as unknown
      return this.normalizeState(parsed)
    } catch (error) {
      console.error('[BoulderState] Failed to read state file:', error)
      return this.createDefaultState()
    }
  }

  async updateState(partial: Partial<BoulderState>): Promise<void> {
    const currentState = await this.getState()
    const updatedState: BoulderState = {
      ...currentState,
      ...partial,
      last_updated: new Date().toISOString()
    }

    if (partial.completed_tasks !== undefined || partial.total_tasks !== undefined) {
      updatedState.completion_percentage = this.calculatePercentage(
        updatedState.completed_tasks,
        updatedState.total_tasks
      )
    }

    await this.writeState(updatedState)
  }

  async updateTaskProgress(completed: number, total: number): Promise<void> {
    if (completed < 0 || total < 0 || completed > total) {
      console.warn('[BoulderState] Invalid task progress values provided')
    }

    await this.updateState({
      completed_tasks: completed,
      total_tasks: total
    })
  }

  async updatePhaseStatus(phase: string, status: string): Promise<void> {
    const currentState = await this.getState()
    const updatedPhaseStatus = { ...currentState.phase_status, [phase]: status }

    await this.updateState({
      phase_status: updatedPhaseStatus
    })
  }

  async addBlocker(blocker: string): Promise<void> {
    const currentState = await this.getState()
    if (!currentState.blockers.includes(blocker)) {
      await this.updateState({
        blockers: [...currentState.blockers, blocker],
        status: 'blocked'
      })
    }
  }

  async removeBlocker(blocker: string): Promise<void> {
    const currentState = await this.getState()
    const updatedBlockers = currentState.blockers.filter(b => b !== blocker)

    let newStatus = currentState.status
    if (updatedBlockers.length === 0 && currentState.status === 'blocked') {
      newStatus = 'in_progress'
    }

    await this.updateState({
      blockers: updatedBlockers,
      status: newStatus
    })
  }

  async addAccomplishment(accomplishment: string): Promise<void> {
    const currentState = await this.getState()
    const currentAccomplishments = currentState.recent_accomplishments || []

    if (!currentAccomplishments.includes(accomplishment)) {
      await this.updateState({
        recent_accomplishments: [...currentAccomplishments, accomplishment]
      })
    }
  }

  private async writeState(state: BoulderState): Promise<void> {
    const targetPath = this.boulderPaths[0]
    const dir = path.dirname(targetPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    const tempPath = `${targetPath}.tmp`
    try {
      fs.writeFileSync(tempPath, JSON.stringify(state, null, 2))
      fs.renameSync(tempPath, targetPath)
    } catch (error) {
      console.error('[BoulderState] Failed to write state file:', error)
      if (fs.existsSync(tempPath)) {
        try {
          fs.unlinkSync(tempPath)
        } catch {
          // ignore cleanup errors
        }
      }
      throw error
    }
  }

  private createDefaultState(): BoulderState {
    const defaultPlanName = 'codeall-unified-plan'
    const defaultPlanPath = path.join(process.cwd(), '.fuxi', 'plans', `${defaultPlanName}.md`)

    return {
      active_plan: defaultPlanPath,
      started_at: new Date().toISOString(),
      session_ids: [],
      plan_name: defaultPlanName,
      status: 'not_started',
      completed_tasks: 0,
      total_tasks: 0,
      completion_percentage: '0.0%',
      last_updated: new Date().toISOString(),
      phase_status: {},
      blockers: [],
      next_actionable_tasks: []
    }
  }

  async isSessionTracked(sessionId: string): Promise<boolean> {
    const state = await this.getState()
    const sessionIds = state.session_ids || []
    if (sessionIds.length === 0) {
      return true
    }
    return sessionIds.includes(sessionId)
  }

  private normalizeState(raw: unknown): BoulderState {
    if (!raw || typeof raw !== 'object') {
      throw new Error('Invalid boulder state structure')
    }

    const record = raw as Record<string, unknown>
    const activePlan = typeof record.active_plan === 'string' && record.active_plan.trim()
      ? record.active_plan.trim()
      : this.createDefaultState().active_plan

    const completedTasks = this.toNonNegativeNumber(record.completed_tasks)
    const rawTotalTasks = this.toNonNegativeNumber(record.total_tasks)
    const totalTasks = Math.max(rawTotalTasks, completedTasks)
    const status = this.normalizeStatus(record.status, completedTasks, totalTasks)
    const now = new Date().toISOString()

    return {
      active_plan: activePlan,
      started_at: this.normalizeOptionalString(record.started_at),
      session_ids: this.normalizeStringArray(record.session_ids),
      plan_name: this.normalizePlanName(record.plan_name, activePlan),
      agent: this.normalizeOptionalString(record.agent),
      status,
      completed_tasks: completedTasks,
      total_tasks: totalTasks,
      completion_percentage:
        this.normalizePercentage(record.completion_percentage) ||
        this.calculatePercentage(completedTasks, totalTasks),
      last_updated: this.normalizeOptionalString(record.last_updated) || now,
      current_phase: this.normalizeOptionalString(record.current_phase),
      phase_status: this.normalizeStringRecord(record.phase_status),
      blockers: this.normalizeStringArray(record.blockers),
      next_actionable_tasks: this.normalizeStringArray(record.next_actionable_tasks),
      recent_accomplishments: this.normalizeOptionalStringArray(record.recent_accomplishments)
    }
  }

  private normalizeStatus(
    value: unknown,
    completed: number,
    total: number
  ): BoulderState['status'] {
    if (value === 'not_started' || value === 'in_progress' || value === 'complete' || value === 'blocked') {
      return value
    }

    if (total === 0) return 'not_started'
    if (completed >= total) return 'complete'
    return 'in_progress'
  }

  private normalizeStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return []
    return value.filter(item => typeof item === 'string' && item.trim().length > 0)
  }

  private normalizeOptionalStringArray(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) return undefined
    return this.normalizeStringArray(value)
  }

  private normalizeStringRecord(value: unknown): Record<string, string> {
    if (!value || typeof value !== 'object') return {}
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => typeof v === 'string')
      .map(([k, v]) => [k, v as string])
    return Object.fromEntries(entries)
  }

  private normalizeOptionalString(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : undefined
  }

  private normalizePlanName(value: unknown, activePlan: string): string | undefined {
    const explicit = this.normalizeOptionalString(value)
    if (explicit) return explicit

    const fileName = path.basename(activePlan)
    if (!fileName) return undefined

    const ext = path.extname(fileName)
    const baseName = ext ? fileName.slice(0, -ext.length) : fileName
    return baseName || undefined
  }

  private normalizePercentage(value: unknown): string | null {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return /^\d+(\.\d+)?%$/.test(trimmed) ? trimmed : null
  }

  private toNonNegativeNumber(value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      return 0
    }
    return Math.floor(value)
  }

  private calculatePercentage(completed: number, total: number): string {
    if (total === 0) return '0.0%'
    return ((completed / total) * 100).toFixed(1) + '%'
  }
}
