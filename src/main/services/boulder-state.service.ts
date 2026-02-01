import fs from 'fs'
import path from 'path'

export interface BoulderState {
  active_plan: string
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
  private readonly boulderPath: string

  private constructor() {
    this.boulderPath = path.join(process.cwd(), '.sisyphus', 'boulder.json')
  }

  static getInstance(): BoulderStateService {
    if (!BoulderStateService.instance) {
      BoulderStateService.instance = new BoulderStateService()
    }
    return BoulderStateService.instance
  }

  async getState(): Promise<BoulderState> {
    if (!fs.existsSync(this.boulderPath)) {
      return this.createDefaultState()
    }

    try {
      const content = fs.readFileSync(this.boulderPath, 'utf-8')
      const state = JSON.parse(content) as BoulderState
      this.validateState(state)
      return state
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
    const dir = path.dirname(this.boulderPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    const tempPath = `${this.boulderPath}.tmp`
    try {
      fs.writeFileSync(tempPath, JSON.stringify(state, null, 2))
      fs.renameSync(tempPath, this.boulderPath)
    } catch (error) {
      console.error('[BoulderState] Failed to write state file:', error)
      if (fs.existsSync(tempPath)) {
        try {
          fs.unlinkSync(tempPath)
        } catch {}
      }
      throw error
    }
  }

  private createDefaultState(): BoulderState {
    return {
      active_plan: 'codeall-unified-plan',
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

  private validateState(state: BoulderState): void {
    if (!state.active_plan || typeof state.completed_tasks !== 'number') {
      throw new Error('Invalid boulder state structure')
    }
  }

  private calculatePercentage(completed: number, total: number): string {
    if (total === 0) return '0.0%'
    return ((completed / total) * 100).toFixed(1) + '%'
  }
}
