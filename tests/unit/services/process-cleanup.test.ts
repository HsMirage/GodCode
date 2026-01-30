import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ProcessCleanupService } from '../../../src/main/services/process-cleanup.service'
import { EventEmitter } from 'events'

vi.mock('../../shared/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  }
}))

describe('ProcessCleanupService', () => {
  let service: ProcessCleanupService

  beforeEach(() => {
    service = new ProcessCleanupService()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  describe('registerProcess', () => {
    it('should add process to the set', () => {
      const mockProcess = new EventEmitter() as any
      service.registerProcess(mockProcess)
      expect(service.getStats().processes).toBe(1)
    })

    it('should remove process when it exits', () => {
      const mockProcess = new EventEmitter() as any
      service.registerProcess(mockProcess)
      mockProcess.emit('exit')
      expect(service.getStats().processes).toBe(0)
    })

    it('should remove process when it errors', () => {
      const mockProcess = new EventEmitter() as any
      service.registerProcess(mockProcess)
      mockProcess.emit('error', new Error('fail'))
      expect(service.getStats().processes).toBe(0)
    })
  })

  describe('abort controllers', () => {
    it('should register and unregister abort controllers', () => {
      const controller = new AbortController()
      service.registerAbortController(controller)
      expect(service.getStats().abortControllers).toBe(1)

      service.unregisterAbortController(controller)
      expect(service.getStats().abortControllers).toBe(0)
    })
  })

  describe('onCleanup', () => {
    it('should register cleanup callbacks', () => {
      service.onCleanup(() => {})
      expect(service.getStats().callbacks).toBe(1)
    })
  })

  describe('cleanupAll', () => {
    it('should abort all registered controllers', async () => {
      const controller = new AbortController()
      const abortSpy = vi.spyOn(controller, 'abort')
      service.registerAbortController(controller)

      await service.cleanupAll()

      expect(abortSpy).toHaveBeenCalled()
      expect(service.getStats().abortControllers).toBe(0)
    })

    it('should kill processes with SIGTERM and then SIGKILL if they dont exit', async () => {
      const mockProcess = new EventEmitter() as any
      mockProcess.killed = false
      mockProcess.kill = vi.fn(signal => {
        if (signal === 'SIGTERM') {
        } else if (signal === 'SIGKILL') {
          mockProcess.killed = true
          mockProcess.emit('exit')
        }
      })

      service.registerProcess(mockProcess)

      const cleanupPromise = service.cleanupAll()

      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM')

      await vi.advanceTimersByTimeAsync(3000)

      await cleanupPromise

      expect(mockProcess.kill).toHaveBeenCalledWith('SIGKILL')
      expect(service.getStats().processes).toBe(0)
    })

    it('should resolve immediately if process exits after SIGTERM', async () => {
      const mockProcess = new EventEmitter() as any
      mockProcess.killed = false
      mockProcess.kill = vi.fn(signal => {
        if (signal === 'SIGTERM') {
          setTimeout(() => {
            mockProcess.killed = true
            mockProcess.emit('exit')
          }, 100)
        }
      })

      service.registerProcess(mockProcess)

      const cleanupPromise = service.cleanupAll()

      await vi.advanceTimersByTimeAsync(100)
      await cleanupPromise

      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM')
      expect(mockProcess.kill).not.toHaveBeenCalledWith('SIGKILL')
      expect(service.getStats().processes).toBe(0)
    })

    it('should execute all cleanup callbacks', async () => {
      const callback1 = vi.fn()
      const callback2 = vi.fn().mockRejectedValue(new Error('callback failed'))
      const callback3 = vi.fn()

      service.onCleanup(callback1)
      service.onCleanup(callback2)
      service.onCleanup(callback3)

      await service.cleanupAll()

      expect(callback1).toHaveBeenCalled()
      expect(callback2).toHaveBeenCalled()
      expect(callback3).toHaveBeenCalled()
    })
  })

  describe('getStats', () => {
    it('should return correct counts', () => {
      service.registerProcess(new EventEmitter() as any)
      service.registerAbortController(new AbortController())
      service.onCleanup(() => {})

      const stats = service.getStats()
      expect(stats).toEqual({
        processes: 1,
        abortControllers: 1,
        callbacks: 1
      })
    })
  })
})
