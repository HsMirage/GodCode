import * as fs from 'fs'
import * as path from 'path'

export interface PlanTask {
  id: string // e.g., "8.1.1"
  description: string // Full task description
  completed: boolean // Checkbox status
  lineNumber: number // Line number in file (1-based)
  phase: string // e.g., "Phase 8: State System"
  section: string // e.g., "8.1 状态系统"
}

export interface PlanMetadata {
  name: string // Plan file name (without .md)
  path: string // Absolute file path
  totalTasks: number
  completedTasks: number
  pendingTasks: number
  completionPercentage: string
  phases: string[] // List of phase names
}

export class PlanFileService {
  private static instance: PlanFileService | null = null
  private readonly plansDir: string

  private constructor() {
    this.plansDir = path.join(process.cwd(), '.sisyphus', 'plans')
  }

  static getInstance(): PlanFileService {
    if (!PlanFileService.instance) {
      PlanFileService.instance = new PlanFileService()
    }
    return PlanFileService.instance
  }

  /**
   * List all available plan files in .sisyphus/plans/
   */
  async listPlans(): Promise<string[]> {
    if (!fs.existsSync(this.plansDir)) {
      return []
    }

    const files = fs.readdirSync(this.plansDir)
    return files.filter(file => file.endsWith('.md')).map(file => file.replace('.md', ''))
  }

  /**
   * Get the absolute path for a plan file
   */
  async getPlanPath(planName: string): Promise<string> {
    return path.join(this.plansDir, `${planName}.md`)
  }

  /**
   * Read the raw content of a plan file
   */
  async readPlan(planName: string): Promise<string> {
    const filePath = await this.getPlanPath(planName)
    if (!fs.existsSync(filePath)) {
      throw new Error(`Plan file not found: ${planName}`)
    }
    return fs.readFileSync(filePath, 'utf-8')
  }

  /**
   * Create a new plan file with content
   */
  async createPlan(planName: string, content: string): Promise<void> {
    if (!fs.existsSync(this.plansDir)) {
      fs.mkdirSync(this.plansDir, { recursive: true })
    }
    const filePath = await this.getPlanPath(planName)
    fs.writeFileSync(filePath, content, 'utf-8')
  }

  /**
   * Parse a plan file and extract all tasks
   */
  async parsePlan(planName: string): Promise<PlanTask[]> {
    const content = await this.readPlan(planName)
    return this.extractTasks(content)
  }

  /**
   * Get metadata and statistics for a plan
   */
  async getPlanMetadata(planName: string): Promise<PlanMetadata> {
    const tasks = await this.parsePlan(planName)
    const completed = tasks.filter(t => t.completed).length
    const total = tasks.length
    // Use Set to get unique phases, maintaining order of appearance
    const phases = [...new Set(tasks.map(t => t.phase))]

    return {
      name: planName,
      path: await this.getPlanPath(planName),
      totalTasks: total,
      completedTasks: completed,
      pendingTasks: total - completed,
      completionPercentage: this.calculatePercentage(completed, total),
      phases
    }
  }

  /**
   * Get a specific task by its ID
   */
  async getTaskById(planName: string, taskId: string): Promise<PlanTask | null> {
    const tasks = await this.parsePlan(planName)
    return tasks.find(t => t.id === taskId) || null
  }

  /**
   * Get all tasks belonging to a specific phase
   */
  async getTasksByPhase(planName: string, phaseName: string): Promise<PlanTask[]> {
    const tasks = await this.parsePlan(planName)
    // Match phase name exactly or partially (e.g. "Phase 8" matches "Phase 8: State System")
    return tasks.filter(t => t.phase === phaseName || t.phase.startsWith(phaseName))
  }

  /**
   * Extract tasks from markdown content using regex
   */
  private extractTasks(content: string): PlanTask[] {
    const tasks: PlanTask[] = []
    const lines = content.split('\n')

    let currentPhase = ''
    let currentSection = ''

    lines.forEach((line, index) => {
      // Extract phase: ## Phase N: Name
      // Matches both "## Phase 1" and "## Phase 1: Name"
      if (line.startsWith('## Phase')) {
        currentPhase = line.replace(/^##\s+/, '').trim()
      }

      // Extract section: ### N.M Section Name
      if (line.startsWith('###')) {
        currentSection = line.replace(/^###\s+/, '').trim()
      }

      // Extract task: - [ ] **Task N.M.P**: Description
      // Matches both "- [ ]" and "- [x]"
      // Capture groups: 1=checkbox status, 2=task ID, 3=description
      const taskMatch = line.match(/^- \[([ x])\] \*\*Task ([0-9.]+)\*\*:\s*(.+)$/)

      if (taskMatch) {
        const [, checkbox, taskId, description] = taskMatch
        tasks.push({
          id: taskId,
          description: description.trim(),
          completed: checkbox === 'x',
          lineNumber: index + 1,
          phase: currentPhase,
          section: currentSection
        })
      }
    })

    return tasks
  }

  /**
   * Calculate percentage string with 1 decimal place
   */
  private calculatePercentage(completed: number, total: number): string {
    if (total === 0) return '0.0%'
    return ((completed / total) * 100).toFixed(1) + '%'
  }
}
