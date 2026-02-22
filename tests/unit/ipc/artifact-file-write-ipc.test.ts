import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ipcMain } from 'electron'
import { registerArtifactHandlers } from '../../../src/main/ipc/handlers/artifact'

const mockExistsSync = vi.fn()
const mockReadFileSync = vi.fn()
const mockWriteFileSync = vi.fn()
const mockMkdirSync = vi.fn()
const mockStatSync = vi.fn()

const mockFindSession = vi.fn()
const mockCreateArtifact = vi.fn()

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn()
  },
  shell: {
    openPath: vi.fn()
  }
}))

vi.mock('fs', () => ({
  default: {
    existsSync: (...args: any[]) => mockExistsSync(...args),
    readFileSync: (...args: any[]) => mockReadFileSync(...args),
    writeFileSync: (...args: any[]) => mockWriteFileSync(...args),
    mkdirSync: (...args: any[]) => mockMkdirSync(...args),
    statSync: (...args: any[]) => mockStatSync(...args)
  }
}))

vi.mock('../../../src/main/services/database', () => ({
  DatabaseService: {
    getInstance: () => ({
      getClient: () => ({
        session: {
          findUnique: (...args: any[]) => mockFindSession(...args)
        }
      })
    })
  }
}))

vi.mock('../../../src/main/services/artifact.service', () => ({
  ArtifactService: {
    getInstance: () => ({
      createArtifact: (...args: any[]) => mockCreateArtifact(...args)
    })
  }
}))

vi.mock('../../../src/main/services/audit-log.service', () => ({
  AuditLogService: {
    getInstance: () => ({
      log: vi.fn().mockResolvedValue(undefined)
    })
  }
}))

describe('artifact IPC file:write', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockFindSession.mockResolvedValue({
      id: 'session-1',
      space: { workDir: '/workspace' }
    })

    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue('old content')
    mockWriteFileSync.mockImplementation(() => undefined)
    mockMkdirSync.mockImplementation(() => undefined)
    mockCreateArtifact.mockResolvedValue({ id: 'artifact-1' })

    mockStatSync
      .mockReturnValueOnce({ mtimeMs: 1000 })
      .mockReturnValueOnce({ mtimeMs: 2000 })
  })

  it('registers file:write handler', () => {
    registerArtifactHandlers()

    const channels = (ipcMain.handle as any).mock.calls.map((call: any[]) => call[0])
    expect(channels).toContain('file:write')
  })

  it('writes file in workspace and returns new mtime', async () => {
    registerArtifactHandlers()

    const writeHandler = (ipcMain.handle as any).mock.calls.find(
      (call: any[]) => call[0] === 'file:write'
    )?.[1]

    const result = await writeHandler({}, {
      filePath: 'src/main.ts',
      sessionId: 'session-1',
      content: 'new content',
      expectedMtimeMs: 1000
    })

    expect(result.success).toBe(true)
    expect(result.mtimeMs).toBe(2000)
    expect(result.changeType).toBe('modified')
    expect(mockWriteFileSync).toHaveBeenCalled()
    expect(mockCreateArtifact).toHaveBeenCalled()
  })

  it('rejects path outside workspace', async () => {
    registerArtifactHandlers()

    const writeHandler = (ipcMain.handle as any).mock.calls.find(
      (call: any[]) => call[0] === 'file:write'
    )?.[1]

    const result = await writeHandler({}, {
      filePath: '../outside.ts',
      sessionId: 'session-1',
      content: 'new content'
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('outside workspace')
    expect(mockWriteFileSync).not.toHaveBeenCalled()
  })

  it('returns conflict when external mtime changed', async () => {
    mockStatSync.mockReset()
    mockStatSync.mockReturnValue({ mtimeMs: 3000 })

    registerArtifactHandlers()

    const writeHandler = (ipcMain.handle as any).mock.calls.find(
      (call: any[]) => call[0] === 'file:write'
    )?.[1]

    const result = await writeHandler({}, {
      filePath: 'src/main.ts',
      sessionId: 'session-1',
      content: 'new content',
      expectedMtimeMs: 1000
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('modified externally')
    expect(result.conflict?.currentContent).toBe('old content')
    expect(result.conflict?.currentMtimeMs).toBe(3000)
    expect(mockWriteFileSync).not.toHaveBeenCalled()
  })
})
