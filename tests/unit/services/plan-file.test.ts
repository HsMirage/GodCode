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

    // Mock FS
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readdirSync.mockReturnValue(['codeall-unified-plan.md', 'archived', 'backup.txt'])
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

  it('should list only .md plan files', async () => {
    const plans = await service.listPlans()
    expect(plans).toEqual(['codeall-unified-plan'])
    expect(mockFs.readdirSync).toHaveBeenCalledWith(expect.stringContaining('.sisyphus/plans'))
  })

  it('should handle missing plans directory gracefully', async () => {
    mockFs.existsSync.mockReturnValue(false)
    const plans = await service.listPlans()
    expect(plans).toEqual([])
  })

  it('should get correct plan path', async () => {
    const planPath = await service.getPlanPath('test-plan')
    expect(planPath).toContain('.sisyphus/plans/test-plan.md')
  })

  it('should read plan content', async () => {
    const content = await service.readPlan('codeall-unified-plan')
    expect(content).toBe(mockPlanContent)
    expect(mockFs.readFileSync).toHaveBeenCalled()
  })

  it('should throw error if plan file does not exist', async () => {
    mockFs.existsSync.mockReturnValue(false)
    await expect(service.readPlan('non-existent')).rejects.toThrow('Plan file not found')
  })

  it('should parse plan tasks correctly', async () => {
    const tasks = await service.parsePlan('codeall-unified-plan')
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
    const meta = await service.getPlanMetadata('codeall-unified-plan')

    expect(meta.totalTasks).toBe(4)
    expect(meta.completedTasks).toBe(1)
    expect(meta.pendingTasks).toBe(3)
    expect(meta.completionPercentage).toBe('25.0%')
    expect(meta.phases).toEqual(['Phase 8: State System (Week 11)'])
  })

  it('should get specific task by ID', async () => {
    const task = await service.getTaskById('codeall-unified-plan', '8.1.2')
    expect(task).toBeDefined()
    expect(task?.description).toBe('Implement plan file storage')
  })

  it('should return null for non-existent task ID', async () => {
    const task = await service.getTaskById('codeall-unified-plan', '9.9.9')
    expect(task).toBeNull()
  })

  it('should filter tasks by phase', async () => {
    const tasks = await service.getTasksByPhase('codeall-unified-plan', 'Phase 8')
    expect(tasks).toHaveLength(4)
  })

  it('should create new plan file', async () => {
    mockFs.existsSync.mockReturnValue(false) // Trigger mkdir
    await service.createPlan('new-plan', '# New Plan')

    expect(mockFs.mkdirSync).toHaveBeenCalled()
    expect(mockFs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('new-plan.md'),
      '# New Plan',
      'utf-8'
    )
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
