import { exec } from 'child_process'
import { promisify } from 'util'
import { logger } from '../../shared/logger'

const execAsync = promisify(exec)

// Safe path patterns to identify our bundled PostgreSQL
const SAFE_PATH_PATTERNS = [
  /node_modules[\\\/]@embedded-postgres[\\\/]/,
  /app\.asar\.unpacked[\\\/]node_modules[\\\/]@embedded-postgres[\\\/]/
]

interface PostgresProcess {
  pid: number
  executablePath: string
}

/**
 * Parses WMIC CSV output to extract PID and ExecutablePath
 * @param stdout WMIC command output
 */
function parseWmicOutput(stdout: string): PostgresProcess[] {
  const lines = stdout.trim().split('\r\n')
  // Remove empty lines
  const nonEmptyLines = lines.filter(line => line.trim())

  // WMIC CSV format usually starts with a blank line, then header
  // Node,ExecutablePath,ProcessId
  if (nonEmptyLines.length < 2) return []

  // Skip header, process data lines
  const processes: PostgresProcess[] = []

  // Skip the first line which is the header
  for (let i = 1; i < nonEmptyLines.length; i++) {
    const line = nonEmptyLines[i]
    // CSV format from wmic: Node,ExecutablePath,ProcessId
    const parts = line.split(',')

    // We expect at least 3 parts.
    // parts[0] is Node (computer name)
    // parts[1] is ExecutablePath
    // parts[2] is ProcessId
    if (parts.length >= 3) {
      // The path might contain commas, so we need to handle that.
      // ProcessId is always the last element.
      const pidStr = parts[parts.length - 1]
      const pid = parseInt(pidStr, 10)

      // Reconstruct path if it was split by commas
      // parts[1] to parts[length-2] forms the path
      const executablePath = parts.slice(1, parts.length - 1).join(',')

      if (!isNaN(pid) && executablePath) {
        processes.push({ pid, executablePath })
      }
    }
  }

  return processes
}

/**
 * Finds running PostgreSQL processes (postgres, initdb, pg_ctl)
 * using wmic on Windows to ensure we get the full path.
 */
export async function findPostgresProcesses(): Promise<PostgresProcess[]> {
  if (process.platform !== 'win32') {
    logger.warn(
      `[process-utils] Process discovery not implemented for platform: ${process.platform}`
    )
    return []
  }

  try {
    // wmic process where "name='postgres.exe' or name='initdb.exe' or name='pg_ctl.exe'" get ProcessId,ExecutablePath /FORMAT:CSV
    const cmd = `wmic process where "name='postgres.exe' or name='initdb.exe' or name='pg_ctl.exe'" get ProcessId,ExecutablePath /FORMAT:CSV`
    const { stdout } = await execAsync(cmd)
    return parseWmicOutput(stdout)
  } catch (error) {
    // If no processes are found, wmic might exit with non-zero or return "No Instance(s) Available"
    const err = error as any
    if (err.message && err.message.includes('No Instance(s) Available')) {
      return []
    }
    logger.error('[process-utils] Failed to find postgres processes', { error })
    return []
  }
}

/**
 * Kills PostgreSQL processes that match the safe path patterns.
 * This ensures we don't kill a user's system PostgreSQL installation.
 */
export async function killPostgresProcesses(): Promise<void> {
  if (process.platform !== 'win32') {
    logger.warn(`[process-utils] Process cleanup not implemented for platform: ${process.platform}`)
    return
  }

  const processes = await findPostgresProcesses()
  if (processes.length === 0) {
    return
  }

  const procsToKill = processes.filter(proc => {
    const isSafe = SAFE_PATH_PATTERNS.some(pattern => pattern.test(proc.executablePath))
    if (!isSafe) {
      logger.warn(
        `[process-utils] Skipping unsafe process: PID=${proc.pid}, Path=${proc.executablePath}`
      )
    }
    return isSafe
  })

  logger.info(
    `[process-utils] Found ${procsToKill.length} embedded postgres processes to kill out of ${processes.length} total candidates`
  )

  for (const proc of procsToKill) {
    try {
      logger.info(`[process-utils] Killing process PID=${proc.pid}`)
      // Add 5 second timeout protection
      await Promise.race([
        execAsync(`taskkill /F /PID ${proc.pid}`),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Taskkill timeout')), 5000))
      ])
    } catch (error) {
      // Ignore error if process is already gone "The process ... not found"
      const msg = error instanceof Error ? error.message : String(error)
      if (!msg.includes('not found')) {
        logger.error(`[process-utils] Failed to kill process ${proc.pid}`, { error: msg })
      }
    }
  }
}
