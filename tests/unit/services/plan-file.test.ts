import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { PlanFileService } from '../../../src/main/services/plan-file.service'

vi.mock('fs')
const mockFs = fs as unknown as {
  existsSync: ReturnType<typeof vi.fn>
  readdirSync: ReturnType<typeof vi.fn>
  readFileSync: ReturnType<typeof vi.fn>
  writeFileSync: ReturnType<typeof vi.fn>
  mkdirSync: ReturnType<typeof vi.fn>
}

describe('PlanFileService', () => {
  let service: PlanFileService
  const fuxiPlansDir = path.join(process.cwd(), '.fuxi', 'plans')
  const legacyPlansDir = path.join(process.cwd(), '.sisyphus', 'plans')
  const mockPlanContent = `## Phase 8: State System (Week 11)

### 8.1 状态系统

- [x] **Task 8.1.1**: Implement boulder.json state file
- [ ] **Task 8.1.2**: Implement plan file storage
- [ ] **Task 8.1.3**: Implement TODO tracking system

### 8.2 任务续跑机制

- [ ] **Task 8.2.1**: Implement session idle detection
`

  beforeEach(() => {
    // Reset singleton instance (hacky but necessary for testing singletons)
    // @ts-ignore
    PlanFileService.instance = null

    // Reset mock call history and implementations between tests
    vi.clearAllMocks()

    // Mock FS defaults
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readdirSync.mockReturnValue(['godcode-unified-plan.md', 'archived', 'backup.txt'])
    mockFs.readFileSync.mockReturnValue(mockPlanContent)
    mockFs.writeFileSync.mockImplementation(() => {})
    mockFs.mkdirSync.mockImplementation(() => {})

    service = PlanFileService.getInstance()
  })

  it('should maintain singleton instance', () => {
    const instance1 = PlanFileService.getInstance()
    const instance2 = PlanFileService.getInstance()
    expect(instance1).toBe(instance2)
  })

  it('should list only .md plan files from .fuxi/plans by default', async () => {
    mockFs.readdirSync.mockImplementation(dir => {
      if (dir === fuxiPlansDir) return ['godcode-unified-plan.md', 'backup.txt']
      if (dir === legacyPlansDir) return ['legacy-plan.md']
      return []
    })

    const plans = await service.listPlans()
    expect(plans).toEqual(['godcode-unified-plan', 'legacy-plan'])
    expect(mockFs.readdirSync).toHaveBeenCalledWith(fuxiPlansDir)
    expect(mockFs.readdirSync).toHaveBeenCalledWith(legacyPlansDir)
  })

  it('should handle missing plans directory gracefully', async () => {
    mockFs.existsSync.mockReturnValue(false)
    const plans = await service.listPlans()
    expect(plans).toEqual([])
  })

  it('should get correct plan path in .fuxi/plans by default', async () => {
    mockFs.existsSync.mockImplementation(target => target === path.join(fuxiPlansDir, 'test-plan.md'))

    const planPath = await service.getPlanPath('test-plan')
    expect(planPath).toBe(path.join(fuxiPlansDir, 'test-plan.md'))
  })

  it('should read plan content from .fuxi/plans when present', async () => {
    const targetPath = path.join(fuxiPlansDir, 'godcode-unified-plan.md')
    mockFs.existsSync.mockImplementation(p => p === targetPath)

    const content = await service.readPlan('godcode-unified-plan')
    expect(content).toBe(mockPlanContent)
    expect(mockFs.readFileSync).toHaveBeenCalledWith(targetPath, 'utf-8')
  })

  it('should throw error if plan file does not exist in either primary or legacy locations', async () => {
    mockFs.existsSync.mockReturnValue(false)
    await expect(service.readPlan('non-existent')).rejects.toThrow('Plan file not found')
  })

  it('should fall back to legacy .sisyphus/plans when primary .fuxi file is missing', async () => {
    const fuxiPath = path.join(fuxiPlansDir, 'legacy-only.md')
    const legacyPath = path.join(legacyPlansDir, 'legacy-only.md')
    mockFs.existsSync.mockImplementation(p => p === legacyPath)

    const resolvedPath = await service.getPlanPath('legacy-only')
    const content = await service.readPlan('legacy-only')

    expect(resolvedPath).toBe(legacyPath)
    expect(content).toBe(mockPlanContent)
    expect(mockFs.readFileSync).toHaveBeenCalledWith(legacyPath, 'utf-8')
    expect(mockFs.existsSync).toHaveBeenCalledWith(fuxiPath)
  })

  it('should parse plan tasks correctly', async () => {
    const tasks = await service.parsePlan('godcode-unified-plan')
    expect(tasks).toHaveLength(4)

    // Check first completed task
    expect(tasks[0]).toEqual({
      id: '8.1.1',
      description: 'Implement boulder.json state file',
      completed: true,
      lineNumber: 5,
      phase: 'Phase 8: State System (Week 11)',
      section: '8.1 状态系统'
    })

    // Check pending task
    expect(tasks[1].completed).toBe(false)
    expect(tasks[1].id).toBe('8.1.2')
  })

  it('should calculate metadata correctly', async () => {
    const meta = await service.getPlanMetadata('godcode-unified-plan')

    expect(meta.totalTasks).toBe(4)
    expect(meta.completedTasks).toBe(1)
    expect(meta.pendingTasks).toBe(3)
    expect(meta.completionPercentage).toBe('25.0%')
    expect(meta.phases).toEqual(['Phase 8: State System (Week 11)'])
  })

  it('should get specific task by ID', async () => {
    const task = await service.getTaskById('godcode-unified-plan', '8.1.2')
    expect(task).toBeDefined()
    expect(task?.description).toBe('Implement plan file storage')
  })

  it('should return null for non-existent task ID', async () => {
    const task = await service.getTaskById('godcode-unified-plan', '9.9.9')
    expect(task).toBeNull()
  })

  it('should filter tasks by phase', async () => {
    const tasks = await service.getTasksByPhase('godcode-unified-plan', 'Phase 8')
    expect(tasks).toHaveLength(4)
  })

  it('should create new plan file', async () => {
    mockFs.existsSync.mockReturnValue(false) // Trigger mkdir
    await service.createPlan('new-plan', '# New Plan')

    expect(mockFs.mkdirSync).toHaveBeenCalled()
    expect(mockFs.writeFileSync).toHaveBeenCalledWith(
      path.join(fuxiPlansDir, 'new-plan.md'),
      '# New Plan',
      'utf-8'
    )
  })

  it('should always create plan under .fuxi/plans even when legacy plan exists', async () => {
    const fuxiPath = path.join(fuxiPlansDir, 'legacy-only.md')
    const legacyPath = path.join(legacyPlansDir, 'legacy-only.md')

    mockFs.existsSync.mockImplementation(target => {
      if (target === fuxiPlansDir) return true
      if (target === fuxiPath) return false
      if (target === legacyPath) return true
      return false
    })

    await service.createPlan('legacy-only', '# Updated Plan')

    expect(mockFs.writeFileSync).toHaveBeenCalledWith(fuxiPath, '# Updated Plan', 'utf-8')
  })

  it('should handle empty plan file', async () => {
    mockFs.readFileSync.mockReturnValue('')
    const tasks = await service.parsePlan('empty-plan')
    expect(tasks).toEqual([])
  })

  it('should handle files without phases or sections', async () => {
    mockFs.readFileSync.mockReturnValue('- [ ] **Task 1.0**: Simple task')
    const tasks = await service.parsePlan('simple-plan')

    expect(tasks).toHaveLength(1)
    expect(tasks[0].phase).toBe('')
    expect(tasks[0].section).toBe('')
  })
})
