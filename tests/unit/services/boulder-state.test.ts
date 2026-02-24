import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { BoulderStateService, BoulderState } from '@/main/services/boulder-state.service'
import fs from 'fs'

// Mock fs module
vi.mock('fs', () => {
  return {
    default: {
      existsSync: vi.fn(),
      readFileSync: vi.fn(),
      writeFileSync: vi.fn(),
      renameSync: vi.fn(),
      unlinkSync: vi.fn(),
      mkdirSync: vi.fn()
    }
  }
})

describe('BoulderStateService', () => {
  let mockBoulderData: BoulderState

  beforeEach(() => {
    // Reset singleton instance
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(BoulderStateService as any).instance = null

    mockBoulderData = {
      active_plan: 'test-plan',
      status: 'in_progress',
      completed_tasks: 10,
      total_tasks: 100,
      completion_percentage: '10.0%',
      last_updated: '2026-01-31T12:00:00Z',
      phase_status: {},
      blockers: [],
      next_actionable_tasks: [],
      recent_accomplishments: []
    }

    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockBoulderData))
    vi.mocked(fs.writeFileSync).mockImplementation(() => undefined)
    vi.mocked(fs.renameSync).mockImplementation(() => undefined)
    vi.mocked(fs.mkdirSync).mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should implement singleton pattern', () => {
    const instance1 = BoulderStateService.getInstance()
    const instance2 = BoulderStateService.getInstance()
    expect(instance1).toBe(instance2)
  })

  it('should get state from existing boulder.json', async () => {
    const service = BoulderStateService.getInstance()
    const state = await service.getState()

    expect(state).toEqual(expect.objectContaining(mockBoulderData))
    expect(state.session_ids).toEqual([])
    expect(fs.readFileSync).toHaveBeenCalled()
  })

  it('should create default state when file is missing', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false)

    const service = BoulderStateService.getInstance()
    const state = await service.getState()

    expect(state.status).toBe('not_started')
    expect(state.completed_tasks).toBe(0)
    expect(fs.readFileSync).not.toHaveBeenCalled()
  })

  it('should update state with partial data', async () => {
    const service = BoulderStateService.getInstance()
    await service.updateState({ status: 'complete' })

    expect(fs.writeFileSync).toHaveBeenCalled()
    const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0]
    const writtenData = JSON.parse(writeCall[1] as string)

    expect(writtenData.status).toBe('complete')
    expect(writtenData.active_plan).toBe('test-plan')
    expect(writtenData.last_updated).not.toBe(mockBoulderData.last_updated)
  })

  it('should update task progress and recalculate percentage', async () => {
    const service = BoulderStateService.getInstance()
    await service.updateTaskProgress(50, 200)

    expect(fs.writeFileSync).toHaveBeenCalled()
    const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0]
    const writtenData = JSON.parse(writeCall[1] as string)

    expect(writtenData.completed_tasks).toBe(50)
    expect(writtenData.total_tasks).toBe(200)
    expect(writtenData.completion_percentage).toBe('25.0%')
  })

  it('should update phase status', async () => {
    const service = BoulderStateService.getInstance()
    await service.updatePhaseStatus('phase_1', 'complete')

    expect(fs.writeFileSync).toHaveBeenCalled()
    const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0]
    const writtenData = JSON.parse(writeCall[1] as string)

    expect(writtenData.phase_status['phase_1']).toBe('complete')
  })

  it('should add blocker and update status to blocked', async () => {
    const service = BoulderStateService.getInstance()
    await service.addBlocker('New Blocker')

    expect(fs.writeFileSync).toHaveBeenCalled()
    const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0]
    const writtenData = JSON.parse(writeCall[1] as string)

    expect(writtenData.blockers).toContain('New Blocker')
    expect(writtenData.status).toBe('blocked')
  })

  it('should not add duplicate blocker', async () => {
    mockBoulderData.blockers = ['Existing Blocker']
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockBoulderData))

    const service = BoulderStateService.getInstance()
    await service.addBlocker('Existing Blocker')

    expect(fs.writeFileSync).not.toHaveBeenCalled()
  })

  it('should remove blocker and potentially unblock status', async () => {
    mockBoulderData.blockers = ['Old Blocker']
    mockBoulderData.status = 'blocked'
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockBoulderData))

    const service = BoulderStateService.getInstance()
    await service.removeBlocker('Old Blocker')

    expect(fs.writeFileSync).toHaveBeenCalled()
    const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0]
    const writtenData = JSON.parse(writeCall[1] as string)

    expect(writtenData.blockers).toHaveLength(0)
    expect(writtenData.status).toBe('in_progress')
  })

  it('should add accomplishment without duplicates', async () => {
    const service = BoulderStateService.getInstance()
    await service.addAccomplishment('Did something cool')

    expect(fs.writeFileSync).toHaveBeenCalled()
    const writtenData = JSON.parse(vi.mocked(fs.writeFileSync).mock.calls[0][1] as string)
    expect(writtenData.recent_accomplishments).toContain('Did something cool')

    vi.clearAllMocks()
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(writtenData))

    await service.addAccomplishment('Did something cool')
    expect(fs.writeFileSync).not.toHaveBeenCalled()
  })

  it('should use atomic writes (temp file + rename)', async () => {
    const service = BoulderStateService.getInstance()
    await service.updateState({ status: 'complete' })

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringMatching(/\.json\.tmp$/),
      expect.any(String)
    )
    expect(fs.renameSync).toHaveBeenCalledWith(
      expect.stringMatching(/\.json\.tmp$/),
      expect.stringMatching(/\.json$/)
    )
  })

  it('should handle corrupted JSON file gracefully by returning default', async () => {
    vi.mocked(fs.readFileSync).mockReturnValue('{ invalid json ...')

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const service = BoulderStateService.getInstance()
    const state = await service.getState()

    expect(state.active_plan).toBeDefined()
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it('should normalize minimal OMO-style boulder state', async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        active_plan: '/tmp/.sisyphus/plans/demo.md',
        started_at: '2026-02-08T09:47:26.003Z',
        session_ids: ['ses_abc'],
        plan_name: 'demo'
      })
    )

    const service = BoulderStateService.getInstance()
    const state = await service.getState()

    expect(state.active_plan).toBe('/tmp/.sisyphus/plans/demo.md')
    expect(state.session_ids).toEqual(['ses_abc'])
    expect(state.plan_name).toBe('demo')
    expect(state.status).toBe('not_started')
    expect(state.completed_tasks).toBe(0)
    expect(state.total_tasks).toBe(0)
    expect(state.completion_percentage).toBe('0.0%')
  })

  it('should create default boulder state under .fuxi', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false)

    const service = BoulderStateService.getInstance()
    const state = await service.getState()

    expect(state.active_plan.replace(/\\/g, '/')).toContain('/.fuxi/plans/')
  })

  it('should read legacy .sisyphus boulder when .fuxi boulder is absent', async () => {
    vi.mocked(fs.existsSync).mockImplementation(p => String(p).includes('.sisyphus/boulder.json'))
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        active_plan: '/tmp/.sisyphus/plans/legacy.md',
        session_ids: ['ses_1'],
        status: 'in_progress',
        completed_tasks: 1,
        total_tasks: 2,
        completion_percentage: '50.0%',
        last_updated: new Date().toISOString(),
        phase_status: {},
        blockers: [],
        next_actionable_tasks: []
      })
    )

    const service = BoulderStateService.getInstance()
    const state = await service.getState()

    expect(state.active_plan).toBe('/tmp/.sisyphus/plans/legacy.md')
    expect(state.session_ids).toEqual(['ses_1'])
  })

  it('should report session tracking using boulder session_ids', async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        active_plan: '/tmp/.sisyphus/plans/demo.md',
        session_ids: ['ses_1', 'ses_2']
      })
    )

    const service = BoulderStateService.getInstance()

    await expect(service.isSessionTracked('ses_1')).resolves.toBe(true)
    await expect(service.isSessionTracked('ses_3')).resolves.toBe(false)
  })
})
