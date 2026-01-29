import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => path.join(os.tmpdir(), `test-logs-${Date.now()}`))
  }
}))

vi.mock('winston-daily-rotate-file', () => {
  const TransportStream = require('winston-transport')
  class MockDailyRotateFile extends TransportStream {
    constructor(opts: any) {
      super(opts)
    }
    log(info: any, callback: () => void) {
      callback()
    }
  }
  return { default: MockDailyRotateFile }
})

import { app } from 'electron'
import { LoggerService } from '@/main/services/logger'

describe('LoggerService', () => {
  let logger: LoggerService
  let testLogDir: string

  beforeEach(() => {
    // @ts-ignore
    LoggerService.instance = undefined
    testLogDir = path.join(os.tmpdir(), `test-logs-${Date.now()}`)

    fs.mkdirSync(path.join(testLogDir, 'logs'), { recursive: true })

    vi.mocked(app.getPath).mockReturnValue(testLogDir)

    logger = LoggerService.getInstance()
  })

  afterEach(() => {
    if (fs.existsSync(testLogDir)) {
      fs.rmSync(testLogDir, { recursive: true, force: true })
    }
    delete process.env.LOG_DIR
  })

  it('should be a singleton', () => {
    const logger2 = LoggerService.getInstance()
    expect(logger).toBe(logger2)
  })

  it('should provide winston logger', () => {
    const winstonLogger = logger.getLogger()
    expect(winstonLogger).toBeDefined()
    expect(winstonLogger.info).toBeDefined()
    expect(winstonLogger.error).toBeDefined()
  })

  it('should log different levels', () => {
    const winstonLogger = logger.getLogger()
    const infoSpy = vi.spyOn(winstonLogger, 'info')
    const errorSpy = vi.spyOn(winstonLogger, 'error')
    const debugSpy = vi.spyOn(winstonLogger, 'debug')

    winstonLogger.info('Info message')
    winstonLogger.error('Error message')
    winstonLogger.debug('Debug message')

    expect(infoSpy).toHaveBeenCalledWith('Info message')
    expect(errorSpy).toHaveBeenCalledWith('Error message')
    expect(debugSpy).toHaveBeenCalledWith('Debug message')
  })
})
