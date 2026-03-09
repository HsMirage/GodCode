import { BoulderStateService } from '../../../src/main/services/boulder-state.service'
import { DatabaseService } from '../../../src/main/services/database'
import { PlanFileService } from '../../../src/main/services/plan-file.service'
import { SessionIdleDetectionService } from '../../../src/main/services/session-idle-detection.service'
import { SessionStateRecoveryService } from '../../../src/main/services/session-state-recovery.service'
import { sessionContinuityService } from '../../../src/main/services/session-continuity.service'
import { TodoIncompleteDetectionService } from '../../../src/main/services/todo-incomplete-detection.service'
import { ResumeContextRestorationService } from '../../../src/main/services/resume-context-restoration.service'
import { RetryableErrorType } from '../../../src/main/services/workforce/retry'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock dependencies
vi.mock('../../../src/main/services/boulder-state.service')
vi.mock('../../../src/main/services/database')
vi.mock('../../../src/main/services/plan-file.service')
vi.mock('../../../src/main/services/session-idle-detection.service')
vi.mock('../../../src/main/services/session-state-recovery.service')
vi.mock('../../../src/main/services/session-continuity.service', () => ({
  sessionContinuityService: {
    getSessionState: vi.fn()
  }
}))
vi.mock('../../../src/main/services/todo-incomplete-detection.service')

describe('ResumeContextRestorationService', () => {
  let service: ResumeContextRestorationService

  beforeEach(() => {
    vi.clearAllMocks()
    // Reset singleton instance via type casting (hacky but needed for testing singleton)
    ;(ResumeContextRestorationService as any).instance = null
    service = ResumeContextRestorationService.getInstance()
    ;(DatabaseService.getInstance as any).mockReturnValue({
      getClient: vi.fn().mockReturnValue({
        task: {
          findMany: vi.fn().mockResolvedValue([])
        }
      })
    })
    vi.mocked(sessionContinuityService.getSessionState).mockResolvedValue(null)
  })

  it('should be a singleton', () => {
    const instance1 = ResumeContextRestorationService.getInstance()
    const instance2 = ResumeContextRestorationService.getInstance()
    expect(instance1).toBe(instance2)
  })

  describe('generateResumeContext', () => {
    it('should generate comprehensive resume context', async () => {
      const sessionId = 'session-123'
      const planName = 'test-plan'

      // Mock dependencies responses
      const idleMock = {
        getLastActivity: vi.fn().mockResolvedValue(new Date()),
        getIdleDuration: vi.fn().mockResolvedValue(600000) // 10 mins
      }
      ;(SessionIdleDetectionService.getInstance as any).mockReturnValue(idleMock)

      const incompleteMock = {
        detectIncompleteWork: vi.fn().mockResolvedValue({
          incompleteTodos: [],
          incompletePlanTasks: [],
          nextTask: null,
          completionRatio: 0.5,
          hasBlockers: false,
          blockers: []
        })
      }
      ;(TodoIncompleteDetectionService.getInstance as any).mockReturnValue(incompleteMock)

      const boulderMock = {
        getState: vi.fn().mockResolvedValue({
          completed_tasks: 5,
          total_tasks: 10,
          completion_percentage: '50%',
          current_phase: 'Phase 1',
          blockers: []
        })
      }
      ;(BoulderStateService.getInstance as any).mockReturnValue(boulderMock)

      const context = await service.generateResumeContext(sessionId, planName)

      expect(context.sessionId).toBe(sessionId)
      expect(context.planName).toBe(planName)
      expect(context.sessionInfo.idleDuration).toBe(600000)
      expect(context.projectStatus.completionPercentage).toBe('50%')
      expect(context.recovery.recoverySource).toBe('manual-resume')
      expect(context.recovery.resumeReason).toBe('no-pending-work')
      expect(context.semanticRecoverySummary.currentTaskGoal).toContain('Phase 1')
      expect(context.resumePrompt).toContain('Session has been idle for 10 minutes')
      expect(context.resumePrompt).toContain('Recovery Source: Manual resume')
    })
  })

  describe('buildResumePrompt', () => {
    it('should include TODOs in prompt', async () => {
      const sessionId = 'session-123'
      const planName = 'test-plan'

      const todoItem = {
        id: '1',
        content: 'Fix bug',
        status: 'pending',
        priority: 'high'
      }

      const incompleteMock = {
        detectIncompleteWork: vi.fn().mockResolvedValue({
          incompleteTodos: [todoItem],
          incompletePlanTasks: [],
          nextTask: null,
          completionRatio: 0.5,
          hasBlockers: false,
          blockers: []
        })
      }
      ;(TodoIncompleteDetectionService.getInstance as any).mockReturnValue(incompleteMock)

      // Mock other required services to avoid errors
      const idleMock = { getIdleDuration: vi.fn().mockResolvedValue(0) }
      ;(SessionIdleDetectionService.getInstance as any).mockReturnValue(idleMock)
      const boulderMock = { getState: vi.fn().mockResolvedValue({ blockers: [] }) }
      ;(BoulderStateService.getInstance as any).mockReturnValue(boulderMock)

      const prompt = await service.buildResumePrompt(sessionId, planName)

      expect(prompt).toContain('Pending TODOs')
      expect(prompt).toContain('Fix bug')
    })

    it('should include plan tasks in prompt', async () => {
      const sessionId = 'session-123'
      const planName = 'test-plan'

      const planTask = {
        id: '1.1',
        description: 'Implement feature',
        completed: false,
        lineNumber: 10
      }

      const incompleteMock = {
        detectIncompleteWork: vi.fn().mockResolvedValue({
          incompleteTodos: [],
          incompletePlanTasks: [planTask],
          nextTask: planTask,
          completionRatio: 0.5,
          hasBlockers: false,
          blockers: []
        })
      }
      ;(TodoIncompleteDetectionService.getInstance as any).mockReturnValue(incompleteMock)

      const idleMock = { getIdleDuration: vi.fn().mockResolvedValue(0) }
      ;(SessionIdleDetectionService.getInstance as any).mockReturnValue(idleMock)
      const boulderMock = { getState: vi.fn().mockResolvedValue({ blockers: [] }) }
      ;(BoulderStateService.getInstance as any).mockReturnValue(boulderMock)

      const prompt = await service.buildResumePrompt(sessionId, planName)

      expect(prompt).toContain('Pending Plan Tasks')
      expect(prompt).toContain('Implement feature')
      expect(prompt).toContain('Resume with Task 1.1')
    })

    it('should include blockers in prompt', async () => {
      const sessionId = 'session-123'
      const planName = 'test-plan'

      const incompleteMock = {
        detectIncompleteWork: vi.fn().mockResolvedValue({
          incompleteTodos: [],
          incompletePlanTasks: [],
          nextTask: null,
          completionRatio: 0.5,
          hasBlockers: true,
          blockers: ['API down']
        })
      }
      ;(TodoIncompleteDetectionService.getInstance as any).mockReturnValue(incompleteMock)

      const boulderMock = {
        getState: vi.fn().mockResolvedValue({
          completed_tasks: 0,
          total_tasks: 0,
          completion_percentage: '0%',
          blockers: ['API down']
        })
      }
      ;(BoulderStateService.getInstance as any).mockReturnValue(boulderMock)

      const idleMock = { getIdleDuration: vi.fn().mockResolvedValue(0) }
      ;(SessionIdleDetectionService.getInstance as any).mockReturnValue(idleMock)

      const prompt = await service.buildResumePrompt(sessionId, planName)

      expect(prompt).toContain('Blockers:')
      expect(prompt).toContain('API down')
    })

    it('should include semantic recovery summary in prompt', async () => {
      const sessionId = 'session-123'
      const planName = 'test-plan'

      const incompleteMock = {
        detectIncompleteWork: vi.fn().mockResolvedValue({
          incompleteTodos: [{ id: 'todo-1', content: 'Finish migration', status: 'in_progress', priority: 'high' }],
          incompletePlanTasks: [{ id: '3.1', description: 'Apply schema fix', completed: false, lineNumber: 31 }],
          nextTask: { id: '3.1', description: 'Apply schema fix', completed: false, lineNumber: 31 },
          completionRatio: 0.75,
          hasBlockers: false,
          blockers: []
        })
      }
      ;(TodoIncompleteDetectionService.getInstance as any).mockReturnValue(incompleteMock)

      const idleMock = { getIdleDuration: vi.fn().mockResolvedValue(0) }
      ;(SessionIdleDetectionService.getInstance as any).mockReturnValue(idleMock)

      const boulderMock = {
        getState: vi.fn().mockResolvedValue({
          completed_tasks: 3,
          total_tasks: 4,
          completion_percentage: '75%',
          current_phase: 'Phase 3',
          blockers: []
        })
      }
      ;(BoulderStateService.getInstance as any).mockReturnValue(boulderMock)

      ;(DatabaseService.getInstance as any).mockReturnValue({
        getClient: vi.fn().mockReturnValue({
          task: {
            findMany: vi.fn().mockResolvedValue([
              {
                id: 'task-completed',
                input: '完成迁移脚本',
                output: null,
                status: 'completed',
                assignedAgent: 'luban',
                metadata: {
                  taskBrief: {
                    goal: '完成数据库迁移',
                    forbiddenModificationScope: ['不要回退已通过的 migration 文件。']
                  }
                },
                createdAt: new Date(),
                completedAt: new Date()
              },
              {
                id: 'task-failed',
                input: '修复 schema',
                output: 'migration checksum mismatch',
                status: 'failed',
                assignedAgent: 'luban',
                metadata: {},
                createdAt: new Date(),
                completedAt: null
              }
            ])
          }
        })
      })

      vi.mocked(sessionContinuityService.getSessionState).mockResolvedValue({
        id: 'state-1',
        sessionId,
        status: 'idle',
        checkpoint: {
          pendingTasks: [],
          inProgressTasks: [],
          completedTasks: ['task-completed'],
          messageCount: 0,
          lastActivityAt: new Date(),
          checkpointAt: new Date()
        },
        context: {
          spaceId: 'space-1',
          workDir: '/tmp/test',
          suggestedNextAction: 'Resume Task 3.1 with existing migration baseline',
          executionEvents: [
            {
              id: 'evt-1',
              type: 'checkpoint-saved',
              sessionId,
              timestamp: new Date().toISOString(),
              payload: {
                phase: 'between-waves',
                status: 'continue',
                reason: 'evidence complete'
              }
            },
            {
              id: 'evt-2',
              type: 'tool-call-completed',
              sessionId,
              timestamp: new Date().toISOString(),
              payload: {
                error: 'migration checksum mismatch',
                retryClassification: RetryableErrorType.NETWORK_ERROR
              }
            }
          ]
        },
        createdAt: new Date(),
        updatedAt: new Date()
      } as any)

      const prompt = await service.buildResumePrompt(sessionId, planName)

      expect(prompt).toContain('## Current Goal:')
      expect(prompt).toContain('## Completed Items:')
      expect(prompt).toContain('完成数据库迁移')
      expect(prompt).toContain('## Recent Decisions:')
      expect(prompt).toContain('Checkpoint between-waves 结果为 continue')
      expect(prompt).toContain('## No-Revert Constraints:')
      expect(prompt).toContain('不要回退已通过的 migration 文件。')
      expect(prompt).toContain('## Latest Failure:')
      expect(prompt).toContain('migration checksum mismatch')
      expect(prompt).toContain('## Suggested Next Action:')
      expect(prompt).toContain('Resume Task 3.1 with existing migration baseline')
    })
  })

  describe('getNextSteps', () => {
    it('should recommend next task', async () => {
      const sessionId = 'session-123'
      const planName = 'test-plan'

      const planTask = {
        id: '2.0',
        description: 'Next task',
        completed: false,
        lineNumber: 20
      }

      const incompleteMock = {
        detectIncompleteWork: vi.fn().mockResolvedValue({
          incompleteTodos: [],
          incompletePlanTasks: [],
          nextTask: planTask,
          hasBlockers: false,
          blockers: []
        })
      }
      ;(TodoIncompleteDetectionService.getInstance as any).mockReturnValue(incompleteMock)

      const steps = await service.getNextSteps(sessionId, planName)

      expect(steps[0]).toContain('Start Task 2.0')
    })

    it('should handle no pending work', async () => {
      const sessionId = 'session-123'
      const planName = 'test-plan'

      const incompleteMock = {
        detectIncompleteWork: vi.fn().mockResolvedValue({
          incompleteTodos: [],
          incompletePlanTasks: [],
          nextTask: null,
          hasBlockers: false,
          blockers: []
        })
      }
      ;(TodoIncompleteDetectionService.getInstance as any).mockReturnValue(incompleteMock)

      const steps = await service.getNextSteps(sessionId, planName)

      expect(steps[0]).toBe('No pending work detected')
    })

    it('should recommend addressing blockers', async () => {
      const sessionId = 'session-123'
      const planName = 'test-plan'

      const incompleteMock = {
        detectIncompleteWork: vi.fn().mockResolvedValue({
          incompleteTodos: [],
          incompletePlanTasks: [],
          nextTask: null,
          hasBlockers: true,
          blockers: ['Some blocker']
        })
      }
      ;(TodoIncompleteDetectionService.getInstance as any).mockReturnValue(incompleteMock)

      const steps = await service.getNextSteps(sessionId, planName)

      expect(steps).toContain('Address 1 blocker(s)')
    })
  })

  describe('restoreSessionState', () => {
    it('should delegate to SessionStateRecoveryService', async () => {
      const sessionId = 'session-123'
      const planName = 'test-plan'

      const recoveryMock = {
        captureSessionState: vi.fn().mockResolvedValue({ sessionId })
      }
      ;(SessionStateRecoveryService.getInstance as any).mockReturnValue(recoveryMock)

      await service.restoreSessionState(sessionId, planName)

      expect(recoveryMock.captureSessionState).toHaveBeenCalledWith(sessionId, planName)
    })
  })
})
