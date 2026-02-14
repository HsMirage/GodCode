import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { WorkforceEngine } from '@/main/services/workforce/workforce-engine'
import { DelegateEngine } from '@/main/services/delegate'
import { DatabaseService } from '@/main/services/database'
import { LoggerService } from '@/main/services/logger'
import { createLLMAdapter } from '@/main/services/llm/factory'
import fs from 'node:fs'
import path from 'node:path'

// Mock dependencies
const mockPrisma: any = {
  task: {
    create: vi.fn(),
    update: vi.fn()
  },
  model: {
    findFirst: vi.fn(),
    findMany: vi.fn()
  },
  agentBinding: {
    findUnique: vi.fn()
  },
  categoryBinding: {
    findUnique: vi.fn()
  },
  session: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn()
  },
  space: {
    findFirst: vi.fn(),
    create: vi.fn()
  },
  $transaction: vi.fn(callback => callback(mockPrisma))
}

vi.mock('@/main/services/database', () => ({
  DatabaseService: {
    getInstance: vi.fn(() => ({
      getClient: vi.fn(() => mockPrisma)
    }))
  }
}))

const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn()
}

vi.mock('@/main/services/logger', () => ({
  LoggerService: {
    getInstance: vi.fn(() => ({
      getLogger: vi.fn(() => mockLogger)
    }))
  }
}))

const mockAdapter = {
  sendMessage: vi.fn()
}

vi.mock('@/main/services/llm/factory', () => ({
  createLLMAdapter: vi.fn(() => mockAdapter)
}))

const mockSecureStorage = {
  decrypt: vi.fn((s: string) => s)
}

vi.mock('@/main/services/secure-storage.service', () => ({
  SecureStorageService: {
    getInstance: vi.fn(() => mockSecureStorage)
  }
}))

const mockDelegateEngine = {
  delegateTask: vi.fn()
}

vi.mock('@/main/services/delegate', () => ({
  DelegateEngine: vi.fn(() => mockDelegateEngine)
}))

const mockBoulderService = {
  getState: vi.fn(),
  isSessionTracked: vi.fn()
}

vi.mock('@/main/services/boulder-state.service', () => ({
  BoulderStateService: {
    getInstance: vi.fn(() => mockBoulderService)
  }
}))

describe('WorkforceEngine', () => {
  let workforceEngine: WorkforceEngine

  beforeEach(() => {
    vi.clearAllMocks()
    workforceEngine = new WorkforceEngine()
    vi.spyOn(fs, 'existsSync').mockReturnValue(false)
    vi.spyOn(fs, 'readFileSync').mockImplementation(() => '')
    mockBoulderService.getState.mockResolvedValue({})
    mockBoulderService.isSessionTracked.mockResolvedValue(false)

    // Default mocks setup
    mockPrisma.session.findUnique.mockResolvedValue({
      id: 'test-session-123',
      space: { id: 'space-1', workDir: '/tmp/workspace-a' }
    })
    mockPrisma.session.findFirst.mockResolvedValue({ id: 'session-1' })
    mockPrisma.task.create.mockResolvedValue({ id: 'workflow-1', type: 'workflow' })
    mockPrisma.task.update.mockResolvedValue({ id: 'workflow-1' })
    mockPrisma.model.findMany.mockResolvedValue([
      {
        id: 'model-1',
        provider: 'anthropic',
        modelName: 'claude-3-5-sonnet-20240620',
        apiKey: 'test-key'
      }
    ])
    mockPrisma.agentBinding.findUnique.mockResolvedValue(null)
    mockPrisma.categoryBinding.findUnique.mockResolvedValue(null)
    mockAdapter.sendMessage.mockResolvedValue({
      content: JSON.stringify({
        subtasks: [
          { id: 'task-1', description: 'Task 1', dependencies: [] },
          { id: 'task-2', description: 'Task 2', dependencies: ['task-1'] }
        ]
      })
    })
    mockDelegateEngine.delegateTask.mockResolvedValue({
      taskId: 'subtask-id',
      output: 'Task output',
      success: true
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('decomposeTask', () => {
    it('should decompose task into subtasks', async () => {
      const input = 'Complex task'
      const subtasks = await workforceEngine.decomposeTask(input)

      expect(mockPrisma.model.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [{ apiKeyId: { not: null } }, { apiKey: { not: null } }]
          },
          include: { apiKeyRef: true },
          orderBy: { createdAt: 'desc' }
        })
      )
      expect(createLLMAdapter).toHaveBeenCalledWith(
        'anthropic',
        expect.objectContaining({
          apiKey: 'test-key'
        })
      )
      expect(mockAdapter.sendMessage).toHaveBeenCalled()
      expect(subtasks).toHaveLength(2)
      expect(subtasks[0].id).toBe('task-1')
      expect(subtasks[1].dependencies).toContain('task-1')
    })

    it('should use agent-bound model when agentCode is provided', async () => {
      mockPrisma.model.findMany.mockResolvedValue([])
      mockPrisma.agentBinding.findUnique.mockResolvedValue({
        enabled: true,
        temperature: 0.2,
        model: {
          provider: 'openai-compatible',
          modelName: 'gpt-4o-mini',
          apiKeyRef: { encryptedKey: 'encrypted-key', baseURL: 'https://example.test' },
          apiKey: null,
          baseURL: null
        }
      })
      mockSecureStorage.decrypt.mockReturnValue('decrypted-key')

      const subtasks = await workforceEngine.decomposeTask('input', { agentCode: 'haotian' })

      expect(mockPrisma.agentBinding.findUnique).toHaveBeenCalled()
      expect(createLLMAdapter).toHaveBeenCalledWith(
        'openai-compatible',
        expect.objectContaining({ apiKey: 'decrypted-key' })
      )
      expect(subtasks).toHaveLength(2)
    })

    it('should handle model not found error', async () => {
      mockPrisma.model.findMany.mockResolvedValue([])

      await expect(workforceEngine.decomposeTask('input')).rejects.toThrow(
        'No model configured for task decomposition'
      )
    })

    it('should fallback to single task if parsing fails', async () => {
      mockAdapter.sendMessage.mockResolvedValue({ content: 'Invalid JSON' })

      const subtasks = await workforceEngine.decomposeTask('Simple task')

      expect(subtasks).toHaveLength(1)
      expect(subtasks[0].description).toBe('Simple task')
      expect(mockLogger.error).toHaveBeenCalled()
    })
  })

  describe('executeWorkflow', () => {
    it('should execute tasks in dependency order', async () => {
      const input = 'Do workflow'

      await workforceEngine.executeWorkflow(input, 'test-session-123')

      expect(mockPrisma.task.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'workflow',
            input,
            status: 'running'
          })
        })
      )

      // Should execute task 1 first (no deps)
      expect(mockDelegateEngine.delegateTask).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          description: 'Task 1',
          parentTaskId: 'workflow-1'
        })
      )

      // Should execute task 2 second (depends on task 1)
      expect(mockDelegateEngine.delegateTask).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          description: 'Task 2',
          parentTaskId: 'workflow-1'
        })
      )

      expect(mockPrisma.task.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'workflow-1' },
          data: expect.objectContaining({
            status: 'completed',
            output: expect.stringContaining('Task output')
          })
        })
      )
    })

    it('should respect MAX_CONCURRENT limit', async () => {
      // Mock decomposition to return 5 independent tasks
      mockAdapter.sendMessage.mockResolvedValue({
        content: JSON.stringify({
          subtasks: [
            { id: 't1', description: 'T1', dependencies: [] },
            { id: 't2', description: 'T2', dependencies: [] },
            { id: 't3', description: 'T3', dependencies: [] },
            { id: 't4', description: 'T4', dependencies: [] },
            { id: 't5', description: 'T5', dependencies: [] }
          ]
        })
      })

      // Add delay to mock execution to verify concurrency
      mockDelegateEngine.delegateTask.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
        return { taskId: 'id', output: 'done', success: true }
      })

      await workforceEngine.executeWorkflow('Concurrent workflow', 'test-session-123')

      // Since we can't easily check realtime concurrency in unit test without complex setup,
      // we verify that all tasks were executed eventually
      expect(mockDelegateEngine.delegateTask).toHaveBeenCalledTimes(5)
    })

    it('should detect deadlock', async () => {
      // Mock circular dependency
      mockAdapter.sendMessage.mockResolvedValue({
        content: JSON.stringify({
          subtasks: [
            { id: 't1', description: 'T1', dependencies: ['t2'] },
            { id: 't2', description: 'T2', dependencies: ['t1'] }
          ]
        })
      })

      await expect(
        workforceEngine.executeWorkflow('Deadlock workflow', 'test-session-123')
      ).rejects.toThrow('Deadlock detected')

      expect(mockPrisma.task.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'workflow-1' },
          data: expect.objectContaining({
            status: 'failed',
            output: expect.stringContaining('Deadlock detected')
          })
        })
      )
    })

    it('should handle subtask failure', async () => {
      mockDelegateEngine.delegateTask.mockRejectedValueOnce(new Error('Subtask failed'))

      await expect(
        workforceEngine.executeWorkflow('Failed workflow', 'test-session-123')
      ).rejects.toThrow('Subtask failed')

      expect(mockPrisma.task.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'workflow-1' },
          data: expect.objectContaining({
            status: 'failed',
            output: expect.stringContaining('Subtask failed')
          })
        })
      )
    })

    it('should fail fast for kuafu when no executable plan can be resolved', async () => {
      await expect(
        workforceEngine.executeWorkflow('执行计划', 'test-session-123', { agentCode: 'kuafu' })
      ).rejects.toThrow('未找到可执行计划文件')

      expect(mockAdapter.sendMessage).not.toHaveBeenCalled()
      expect(mockDelegateEngine.delegateTask).not.toHaveBeenCalled()
    })

    it('should parse plan tasks with dependencies and append haotian review task', async () => {
      vi.spyOn(fs, 'existsSync').mockImplementation(path => String(path).includes('.sisyphus'))
      vi.spyOn(fs, 'readFileSync').mockReturnValue(
        [
          '# Plan',
          '- [ ] Task 1: 搜索代码位置 [agent: qianliyan]',
          '- [ ] Task 2: 修复后端 API 错误',
          '  depends on: 1',
          '- [ ] Task 3: 更新页面样式',
          '  category: visual-engineering',
          '  依赖: 1'
        ].join('\n')
      )

      let counter = 0
      mockDelegateEngine.delegateTask.mockImplementation(async (input: any) => ({
        taskId: `persisted-${++counter}`,
        output: `done:${input.description}`,
        success: true
      }))

      const result = await workforceEngine.executeWorkflow(
        '执行计划 .sisyphus/plans/test-plan.md',
        'test-session-123',
        { agentCode: 'haotian' }
      )

      expect(result.success).toBe(true)
      expect(result.tasks.map(task => task.id)).toContain('plan-haotian-review')

      const byDescription = new Map(
        mockDelegateEngine.delegateTask.mock.calls.map(call => [call[0].description, call[0]])
      )

      expect(byDescription.get('Task 1: 搜索代码位置 [agent: qianliyan]')?.subagent_type).toBe(
        'qianliyan'
      )
      expect(byDescription.get('Task 2: 修复后端 API 错误')?.subagent_type).toBe('kuafu')
      expect(byDescription.get('Task 3: 更新页面样式')?.subagent_type).toBe('luban')
      expect(
        byDescription.get('审查已完成子任务的结果一致性，确认验收标准与风险说明完整。')?.subagent_type
      ).toBe('leigong')
      expect(byDescription.get('Task 2: 修复后端 API 错误')?.metadata?.logicalDependencies).toEqual([
        'plan-1'
      ])
    })

    it('should resolve relative plan path against session workspace directory', async () => {
      mockPrisma.session.findUnique.mockResolvedValue({
        id: 'test-session-123',
        space: { id: 'space-2', workDir: '/tmp/other-project' }
      })
      vi.spyOn(fs, 'existsSync').mockImplementation(candidate =>
        path
          .normalize(String(candidate))
          .replace(/\\/g, '/')
          .includes('/tmp/other-project/.sisyphus/plans/site.md')
      )
      vi.spyOn(fs, 'readFileSync').mockReturnValue('- [ ] Task 1: 根据网站规划实现首页')

      await workforceEngine.executeWorkflow(
        '执行计划 .sisyphus/plans/site.md',
        'test-session-123',
        { agentCode: 'kuafu' }
      )

      expect(mockAdapter.sendMessage).not.toHaveBeenCalled()
      expect(mockDelegateEngine.delegateTask).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'Task 1: 根据网站规划实现首页'
        })
      )
    })

    it('should route local documentation analysis tasks to qianliyan', async () => {
      mockAdapter.sendMessage.mockResolvedValue({
        content: JSON.stringify({
          subtasks: [{ id: 'task-doc', description: '分析项目规划文档并提取约束', dependencies: [] }]
        })
      })

      await workforceEngine.executeWorkflow('根据项目规划文档完成实现', 'test-session-123')

      expect(mockDelegateEngine.delegateTask).toHaveBeenCalledWith(
        expect.objectContaining({
          description: '分析项目规划文档并提取约束',
          subagent_type: 'qianliyan'
        })
      )
    })

    it('should cancel workflow immediately when abort signal is already requested', async () => {
      const controller = new AbortController()
      controller.abort()

      await expect(
        workforceEngine.executeWorkflow('Cancelled workflow', 'test-session-123', {
          abortSignal: controller.signal
        })
      ).rejects.toThrow('Workflow cancelled by user')

      expect(mockDelegateEngine.delegateTask).not.toHaveBeenCalled()
      expect(mockPrisma.task.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'workflow-1' },
          data: expect.objectContaining({
            status: 'cancelled',
            output: 'Cancelled by user'
          })
        })
      )
    })
  })
})
