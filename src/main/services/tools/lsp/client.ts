/**
 * LSP Client - Language Server Protocol client implementation
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { Readable, Writable } from 'node:stream'
import { existsSync, readFileSync, statSync } from 'fs'
import { extname, resolve, join } from 'path'
import { pathToFileURL } from 'node:url'
import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
  type MessageConnection
} from 'vscode-jsonrpc/node.js'
import { EXT_TO_LANG } from './constants'
import type { Diagnostic, ResolvedServer } from './types'

/**
 * Validates that a working directory exists and is accessible
 */
export function validateCwd(cwd: string): { valid: boolean; error?: string } {
  try {
    if (!existsSync(cwd)) {
      return { valid: false, error: `Working directory does not exist: ${cwd}` }
    }
    const stats = statSync(cwd)
    if (!stats.isDirectory()) {
      return { valid: false, error: `Path is not a directory: ${cwd}` }
    }
    return { valid: true }
  } catch (err) {
    return {
      valid: false,
      error: `Cannot access working directory: ${cwd} (${err instanceof Error ? err.message : String(err)})`
    }
  }
}

/**
 * Get language ID from file extension
 */
export function getLanguageId(ext: string): string {
  return EXT_TO_LANG[ext] || 'plaintext'
}

interface ManagedClient {
  client: LSPClient
  lastUsedAt: number
  refCount: number
  initPromise?: Promise<void>
  isInitializing: boolean
  initializingSince?: number
}

/**
 * LSP Server Manager - manages LSP client connections with pooling
 */
class LSPServerManager {
  private static instance: LSPServerManager
  private clients = new Map<string, ManagedClient>()
  private cleanupInterval: ReturnType<typeof setInterval> | null = null
  private readonly IDLE_TIMEOUT = 5 * 60 * 1000
  private readonly INIT_TIMEOUT = 60 * 1000

  private constructor() {
    this.startCleanupTimer()
    this.registerProcessCleanup()
  }

  private registerProcessCleanup(): void {
    const syncCleanup = (): void => {
      for (const [, managed] of this.clients) {
        try {
          void managed.client.stop().catch(() => {})
        } catch {
          /* empty */
        }
      }
      this.clients.clear()
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval)
        this.cleanupInterval = null
      }
    }

    process.on('exit', syncCleanup)
    process.on('SIGINT', syncCleanup)
    process.on('SIGTERM', syncCleanup)
  }

  static getInstance(): LSPServerManager {
    if (!LSPServerManager.instance) {
      LSPServerManager.instance = new LSPServerManager()
    }
    return LSPServerManager.instance
  }

  private getKey(root: string, serverId: string): string {
    return `${root}::${serverId}`
  }

  private startCleanupTimer(): void {
    if (this.cleanupInterval) return
    this.cleanupInterval = setInterval(() => {
      this.cleanupIdleClients()
    }, 60000)
  }

  private cleanupIdleClients(): void {
    const now = Date.now()
    for (const [key, managed] of this.clients) {
      if (managed.refCount === 0 && now - managed.lastUsedAt > this.IDLE_TIMEOUT) {
        void managed.client.stop()
        this.clients.delete(key)
      }
    }
  }

  async getClient(root: string, server: ResolvedServer): Promise<LSPClient> {
    const key = this.getKey(root, server.id)

    let managed = this.clients.get(key)
    if (managed) {
      const now = Date.now()
      if (
        managed.isInitializing &&
        managed.initializingSince !== undefined &&
        now - managed.initializingSince >= this.INIT_TIMEOUT
      ) {
        try {
          await managed.client.stop()
        } catch {
          /* empty */
        }
        this.clients.delete(key)
        managed = undefined
      }
    }

    if (managed) {
      if (managed.initPromise) {
        try {
          await managed.initPromise
        } catch {
          try {
            await managed.client.stop()
          } catch {
            /* empty */
          }
          this.clients.delete(key)
          managed = undefined
        }
      }

      if (managed) {
        if (managed.client.isAlive()) {
          managed.refCount++
          managed.lastUsedAt = Date.now()
          return managed.client
        }
        try {
          await managed.client.stop()
        } catch {
          /* empty */
        }
        this.clients.delete(key)
      }
    }

    const client = new LSPClient(root, server)
    const initPromise = (async (): Promise<void> => {
      await client.start()
      await client.initialize()
    })()

    const initStartedAt = Date.now()
    this.clients.set(key, {
      client,
      lastUsedAt: initStartedAt,
      refCount: 1,
      initPromise,
      isInitializing: true,
      initializingSince: initStartedAt
    })

    try {
      await initPromise
    } catch (error) {
      this.clients.delete(key)
      try {
        await client.stop()
      } catch {
        /* empty */
      }
      throw error
    }
    const m = this.clients.get(key)
    if (m) {
      m.initPromise = undefined
      m.isInitializing = false
      m.initializingSince = undefined
    }

    return client
  }

  releaseClient(root: string, serverId: string): void {
    const key = this.getKey(root, serverId)
    const managed = this.clients.get(key)
    if (managed && managed.refCount > 0) {
      managed.refCount--
      managed.lastUsedAt = Date.now()
    }
  }

  isServerInitializing(root: string, serverId: string): boolean {
    const key = this.getKey(root, serverId)
    const managed = this.clients.get(key)
    return managed?.isInitializing ?? false
  }

  async stopAll(): Promise<void> {
    for (const [, managed] of this.clients) {
      await managed.client.stop()
    }
    this.clients.clear()
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
  }
}

export const lspManager = LSPServerManager.getInstance()

/**
 * LSP Client - handles communication with a language server
 */
export class LSPClient {
  private proc: ChildProcess | null = null
  private connection: MessageConnection | null = null
  private openedFiles = new Set<string>()
  private documentVersions = new Map<string, number>()
  private lastSyncedText = new Map<string, string>()
  private stderrBuffer: string[] = []
  private processExited = false
  private diagnosticsStore = new Map<string, Diagnostic[]>()
  private readonly REQUEST_TIMEOUT = 15000

  constructor(
    private root: string,
    private server: ResolvedServer
  ) {}

  async start(): Promise<void> {
    const cwdValidation = validateCwd(this.root)
    if (!cwdValidation.valid) {
      throw new Error(`[LSP] ${cwdValidation.error}`)
    }

    const [cmd, ...args] = this.server.command

    this.proc = spawn(cmd, args, {
      cwd: this.root,
      env: { ...process.env, ...this.server.env },
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true
    })

    if (!this.proc) {
      throw new Error(`Failed to spawn LSP server: ${this.server.command.join(' ')}`)
    }

    this.startStderrReading()

    await new Promise((resolve) => setTimeout(resolve, 100))

    if (this.proc.exitCode !== null) {
      const stderr = this.stderrBuffer.join('\n')
      throw new Error(
        `LSP server exited immediately with code ${this.proc.exitCode}` +
          (stderr ? `\nstderr: ${stderr}` : '')
      )
    }

    const nodeReadable = this.proc.stdout as Readable
    const nodeWritable = this.proc.stdin as Writable

    this.connection = createMessageConnection(
      new StreamMessageReader(nodeReadable),
      new StreamMessageWriter(nodeWritable)
    )

    this.connection.onNotification(
      'textDocument/publishDiagnostics',
      (params: { uri?: string; diagnostics?: Diagnostic[] }) => {
        if (params.uri) {
          this.diagnosticsStore.set(params.uri, params.diagnostics ?? [])
        }
      }
    )

    this.connection.onRequest(
      'workspace/configuration',
      (params: { items?: Array<{ section?: string }> }) => {
        const items = params?.items ?? []
        return items.map((item) => {
          if (item.section === 'json') return { validate: { enable: true } }
          return {}
        })
      }
    )

    this.connection.onRequest('client/registerCapability', () => null)
    this.connection.onRequest('window/workDoneProgress/create', () => null)

    this.connection.onClose(() => {
      this.processExited = true
    })

    this.connection.onError((e: [Error, unknown, unknown]) => {
      console.error('LSP connection error:', e[0])
    })

    this.connection.listen()
  }

  private startStderrReading(): void {
    if (!this.proc?.stderr) return

    this.proc.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      this.stderrBuffer.push(text)
      if (this.stderrBuffer.length > 100) {
        this.stderrBuffer.shift()
      }
    })
  }

  private async sendRequest<T>(method: string, params?: unknown): Promise<T> {
    if (!this.connection) throw new Error('LSP client not started')

    if (this.processExited || (this.proc && this.proc.exitCode !== null)) {
      const stderr = this.stderrBuffer.slice(-10).join('\n')
      throw new Error(
        `LSP server already exited (code: ${this.proc?.exitCode})` +
          (stderr ? `\nstderr: ${stderr}` : '')
      )
    }

    let timeoutId: ReturnType<typeof setTimeout>
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        const stderr = this.stderrBuffer.slice(-5).join('\n')
        reject(
          new Error(
            `LSP request timeout (method: ${method})` + (stderr ? `\nrecent stderr: ${stderr}` : '')
          )
        )
      }, this.REQUEST_TIMEOUT)
    })

    const requestPromise = this.connection.sendRequest(method, params) as Promise<T>

    try {
      const result = await Promise.race([requestPromise, timeoutPromise])
      clearTimeout(timeoutId!)
      return result
    } catch (error) {
      clearTimeout(timeoutId!)
      throw error
    }
  }

  private sendNotification(method: string, params?: unknown): void {
    if (!this.connection) return
    if (this.processExited || (this.proc && this.proc.exitCode !== null)) return

    this.connection.sendNotification(method, params)
  }

  async initialize(): Promise<void> {
    const rootUri = pathToFileURL(this.root).href
    await this.sendRequest('initialize', {
      processId: process.pid,
      rootUri,
      rootPath: this.root,
      workspaceFolders: [{ uri: rootUri, name: 'workspace' }],
      capabilities: {
        textDocument: {
          hover: { contentFormat: ['markdown', 'plaintext'] },
          definition: { linkSupport: true },
          references: {},
          documentSymbol: { hierarchicalDocumentSymbolSupport: true },
          publishDiagnostics: {}
        },
        workspace: {
          symbol: {},
          workspaceFolders: true,
          configuration: true
        }
      },
      ...this.server.initialization
    })
    this.sendNotification('initialized')
    await new Promise((r) => setTimeout(r, 300))
  }

  async openFile(filePath: string): Promise<void> {
    const absPath = resolve(filePath)
    const uri = pathToFileURL(absPath).href
    const text = readFileSync(absPath, 'utf-8')

    if (!this.openedFiles.has(absPath)) {
      const ext = extname(absPath)
      const languageId = getLanguageId(ext)
      const version = 1

      this.sendNotification('textDocument/didOpen', {
        textDocument: {
          uri,
          languageId,
          version,
          text
        }
      })

      this.openedFiles.add(absPath)
      this.documentVersions.set(uri, version)
      this.lastSyncedText.set(uri, text)
      await new Promise((r) => setTimeout(r, 1000))
      return
    }

    const prevText = this.lastSyncedText.get(uri)
    if (prevText === text) {
      return
    }

    const nextVersion = (this.documentVersions.get(uri) ?? 1) + 1
    this.documentVersions.set(uri, nextVersion)
    this.lastSyncedText.set(uri, text)

    this.sendNotification('textDocument/didChange', {
      textDocument: { uri, version: nextVersion },
      contentChanges: [{ text }]
    })
  }

  async definition(filePath: string, line: number, character: number): Promise<unknown> {
    const absPath = resolve(filePath)
    await this.openFile(absPath)
    return this.sendRequest('textDocument/definition', {
      textDocument: { uri: pathToFileURL(absPath).href },
      position: { line: line - 1, character }
    })
  }

  async references(
    filePath: string,
    line: number,
    character: number,
    includeDeclaration = true
  ): Promise<unknown> {
    const absPath = resolve(filePath)
    await this.openFile(absPath)
    return this.sendRequest('textDocument/references', {
      textDocument: { uri: pathToFileURL(absPath).href },
      position: { line: line - 1, character },
      context: { includeDeclaration }
    })
  }

  async documentSymbols(filePath: string): Promise<unknown> {
    const absPath = resolve(filePath)
    await this.openFile(absPath)
    return this.sendRequest('textDocument/documentSymbol', {
      textDocument: { uri: pathToFileURL(absPath).href }
    })
  }

  async workspaceSymbols(query: string): Promise<unknown> {
    return this.sendRequest('workspace/symbol', { query })
  }

  async diagnostics(filePath: string): Promise<{ items: Diagnostic[] }> {
    const absPath = resolve(filePath)
    const uri = pathToFileURL(absPath).href
    await this.openFile(absPath)
    await new Promise((r) => setTimeout(r, 500))

    try {
      const result = await this.sendRequest<{ items?: Diagnostic[] }>('textDocument/diagnostic', {
        textDocument: { uri }
      })
      if (result && typeof result === 'object' && 'items' in result) {
        return result as { items: Diagnostic[] }
      }
    } catch {
      /* empty */
    }

    return { items: this.diagnosticsStore.get(uri) ?? [] }
  }

  isAlive(): boolean {
    return this.proc !== null && !this.processExited && this.proc.exitCode === null
  }

  async stop(): Promise<void> {
    if (this.connection) {
      try {
        this.sendNotification('shutdown', {})
        this.sendNotification('exit')
      } catch {
        /* empty */
      }
      this.connection.dispose()
      this.connection = null
    }
    const proc = this.proc
    if (proc) {
      this.proc = null
      try {
        proc.kill()
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(() => {
            try {
              proc.kill('SIGKILL')
            } catch {
              /* empty */
            }
            resolve()
          }, 5000)

          proc.on('exit', () => {
            clearTimeout(timeout)
            resolve()
          })
        })
      } catch {
        /* empty */
      }
    }
    this.processExited = true
    this.diagnosticsStore.clear()
  }
}

/**
 * Check if a server binary is installed
 */
export function isServerInstalled(command: string[]): boolean {
  if (command.length === 0) return false

  const cmd = command[0]

  if (cmd.includes('/') || cmd.includes('\\')) {
    if (existsSync(cmd)) return true
  }

  const isWindows = process.platform === 'win32'

  let exts = ['']
  if (isWindows) {
    const pathExt = process.env.PATHEXT || ''
    if (pathExt) {
      const systemExts = pathExt.split(';').filter(Boolean)
      exts = [...new Set([...exts, ...systemExts, '.exe', '.cmd', '.bat', '.ps1'])]
    } else {
      exts = ['', '.exe', '.cmd', '.bat', '.ps1']
    }
  }

  let pathEnv = process.env.PATH || ''
  if (isWindows && !pathEnv) {
    pathEnv = process.env.Path || ''
  }

  const pathSeparator = isWindows ? ';' : ':'
  const paths = pathEnv.split(pathSeparator)

  for (const p of paths) {
    for (const suffix of exts) {
      if (existsSync(join(p, cmd + suffix))) {
        return true
      }
    }
  }

  return false
}
