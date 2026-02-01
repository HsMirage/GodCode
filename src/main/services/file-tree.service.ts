import { FSWatcher, watch } from 'chokidar'
import fs from 'fs/promises'
import path from 'path'
import { PathValidator } from '@/shared/path-validator'
import { LoggerService } from './logger'
import { EventEmitter } from 'events'

export interface FileTreeNode {
  name: string
  path: string
  type: 'file' | 'directory'
  size?: number
  children?: FileTreeNode[]
}

export interface FileWatchEvent {
  type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir'
  path: string
}

export class FileTreeService extends EventEmitter {
  private watchers: Map<string, FSWatcher> = new Map()
  private logger = LoggerService.getInstance().getLogger()

  /**
   * Retrieves the file tree structure from a root directory.
   * Required for the frontend file explorer component.
   */
  async getTree(rootDir: string, relativePath: string = '.'): Promise<FileTreeNode> {
    const targetPath = PathValidator.resolveSafePath(relativePath, rootDir)
    const stats = await fs.stat(targetPath)

    if (stats.isFile()) {
      return {
        name: path.basename(targetPath),
        path: relativePath,
        type: 'file',
        size: stats.size
      }
    }

    const entries = await fs.readdir(targetPath, { withFileTypes: true })
    const children: FileTreeNode[] = []

    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') {
        continue
      }

      const childRelPath = path.join(relativePath, entry.name)
      try {
        const childNode = await this.getTree(rootDir, childRelPath)
        children.push(childNode)
      } catch (error) {
        this.logger.warn(`Failed to read ${childRelPath}`, error)
      }
    }

    return {
      name: path.basename(targetPath),
      path: relativePath,
      type: 'directory',
      children
    }
  }

  /**
   * Starts watching a directory for changes.
   * Required for real-time file updates in the UI.
   */
  watchDirectory(watchId: string, rootDir: string): void {
    if (this.watchers.has(watchId)) {
      this.logger.warn(`Watcher ${watchId} already exists`)
      return
    }

    const watcher = watch(rootDir, {
      ignored: /(^|[\/\\])\../,
      persistent: true,
      ignoreInitial: true,
      depth: 10
    })

    watcher
      .on('add', filePath => this.emitChange(watchId, 'add', filePath, rootDir))
      .on('change', filePath => this.emitChange(watchId, 'change', filePath, rootDir))
      .on('unlink', filePath => this.emitChange(watchId, 'unlink', filePath, rootDir))
      .on('addDir', dirPath => this.emitChange(watchId, 'addDir', dirPath, rootDir))
      .on('unlinkDir', dirPath => this.emitChange(watchId, 'unlinkDir', dirPath, rootDir))
      .on('error', error => this.logger.error(`Watcher ${watchId} error:`, error))

    this.watchers.set(watchId, watcher)
    this.logger.info(`Started watching: ${rootDir} (id: ${watchId})`)
  }

  /**
   * Stops watching a specific directory.
   * Required for resource cleanup when closing tabs/projects.
   */
  async unwatchDirectory(watchId: string): Promise<void> {
    const watcher = this.watchers.get(watchId)
    if (watcher) {
      await watcher.close()
      this.watchers.delete(watchId)
      this.logger.info(`Stopped watching: ${watchId}`)
    }
  }

  /**
   * Stops all active watchers.
   * Required for application shutdown or reset.
   */
  async closeAll(): Promise<void> {
    for (const [watchId, watcher] of this.watchers.entries()) {
      await watcher.close()
      this.logger.info(`Closed watcher: ${watchId}`)
    }
    this.watchers.clear()
  }

  private emitChange(
    watchId: string,
    type: FileWatchEvent['type'],
    fullPath: string,
    rootDir: string
  ): void {
    const relativePath = path.relative(rootDir, fullPath)
    const event: FileWatchEvent = {
      type,
      path: PathValidator.normalizePath(relativePath)
    }
    this.emit('change', watchId, event)
    this.logger.debug(`File ${type}: ${relativePath} (watcher: ${watchId})`)
  }
}

export const fileTreeService = new FileTreeService()
