import { ChildProcess } from 'child_process'
import { logger } from '../../shared/logger'

export class ProcessCleanupService {
  private childProcesses = new Set<ChildProcess>()
  private abortControllers = new Set<AbortController>()
  private cleanupCallbacks: Array<() => void | Promise<void>> = []

  registerProcess(process: ChildProcess): void {
    this.childProcesses.add(process)
    process.once('exit', () => {
      this.childProcesses.delete(process)
    })
    process.once('error', () => {
      this.childProcesses.delete(process)
    })
  }

  registerAbortController(controller: AbortController): void {
    this.abortControllers.add(controller)
  }

  unregisterAbortController(controller: AbortController): void {
    this.abortControllers.delete(controller)
  }

  onCleanup(callback: () => void | Promise<void>): void {
    this.cleanupCallbacks.push(callback)
  }

  async cleanupAll(): Promise<void> {
    logger.info('[ProcessCleanup] Starting cleanup', {
      processes: this.childProcesses.size,
      abortControllers: this.abortControllers.size,
      callbacks: this.cleanupCallbacks.length
    })

    for (const controller of this.abortControllers) {
      try {
        controller.abort()
      } catch (err) {
        logger.error('[ProcessCleanup] Failed to abort controller', { error: String(err) })
      }
    }
    this.abortControllers.clear()

    for (const process of this.childProcesses) {
      try {
        if (!process.killed) {
          process.kill('SIGTERM')

          await new Promise<void>(resolve => {
            const timeout = setTimeout(() => {
              if (!process.killed) {
                process.kill('SIGKILL')
              }
              resolve()
            }, 3000)

            process.once('exit', () => {
              clearTimeout(timeout)
              resolve()
            })
          })
        }
      } catch (err) {
        logger.error('[ProcessCleanup] Failed to kill process', { error: String(err) })
      }
    }
    this.childProcesses.clear()

    for (const callback of this.cleanupCallbacks) {
      try {
        await callback()
      } catch (err) {
        logger.error('[ProcessCleanup] Cleanup callback error', { error: String(err) })
      }
    }

    logger.info('[ProcessCleanup] Cleanup complete')
  }

  getStats(): { processes: number; abortControllers: number; callbacks: number } {
    return {
      processes: this.childProcesses.size,
      abortControllers: this.abortControllers.size,
      callbacks: this.cleanupCallbacks.length
    }
  }
}

export const processCleanupService = new ProcessCleanupService()
