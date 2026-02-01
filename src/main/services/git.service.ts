import simpleGit, { SimpleGit, StatusResult, LogResult } from 'simple-git'
import { PathValidator } from '@/shared/path-validator'
import { LoggerService } from './logger'

export interface GitStatus {
  branch: string
  ahead: number
  behind: number
  files: Array<{
    path: string
    status: string
    staged: boolean
  }>
}

export class GitService {
  private logger = LoggerService.getInstance().getLogger()
  private gitInstances: Map<string, SimpleGit> = new Map()

  private getGit(workDir: string): SimpleGit {
    if (!this.gitInstances.has(workDir)) {
      this.gitInstances.set(workDir, simpleGit(workDir))
    }
    return this.gitInstances.get(workDir)!
  }

  /**
   * Checks if the directory is a valid git repository.
   * Necessary for determining if git features should be enabled.
   */
  async isGitRepo(workDir: string): Promise<boolean> {
    try {
      const git = this.getGit(workDir)
      await git.status()
      return true
    } catch (error) {
      return false
    }
  }

  /**
   * Retrieves the current git status including branch and file changes.
   * Necessary for the source control panel.
   */
  async status(workDir: string): Promise<GitStatus> {
    try {
      const git = this.getGit(workDir)
      const status: StatusResult = await git.status()

      return {
        branch: status.current || 'unknown',
        ahead: status.ahead,
        behind: status.behind,
        files: [
          ...status.modified.map(f => ({ path: f, status: 'modified', staged: false })),
          ...status.created.map(f => ({ path: f, status: 'created', staged: false })),
          ...status.deleted.map(f => ({ path: f, status: 'deleted', staged: false })),
          ...status.staged.map(f => ({ path: f, status: 'staged', staged: true }))
        ]
      }
    } catch (error) {
      this.logger.error('Git status failed:', error)
      throw error
    }
  }

  /**
   * Retrieves the diff for the repository or a specific file.
   * Necessary for viewing changes before commit.
   */
  async diff(workDir: string, filePath?: string): Promise<string> {
    try {
      const git = this.getGit(workDir)

      if (filePath) {
        PathValidator.resolveSafePath(filePath, workDir)
        const result = await git.diff([filePath])
        return result
      }

      const result = await git.diff()
      return result
    } catch (error) {
      this.logger.error('Git diff failed:', error)
      throw error
    }
  }

  /**
   * Retrieves the commit history.
   * Necessary for the git history visualization.
   */
  async log(workDir: string, maxCount: number = 10): Promise<LogResult> {
    try {
      const git = this.getGit(workDir)
      const log = await git.log({ maxCount })
      return log
    } catch (error) {
      this.logger.error('Git log failed:', error)
      throw error
    }
  }

  /**
   * Clears cached git instances.
   * Necessary for cleanup and releasing resources.
   */
  clearCache(workDir?: string): void {
    if (workDir) {
      this.gitInstances.delete(workDir)
    } else {
      this.gitInstances.clear()
    }
  }
}

export const gitService = new GitService()
