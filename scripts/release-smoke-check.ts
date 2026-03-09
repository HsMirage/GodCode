import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

interface ParsedArgs {
  platform: string
  candidate?: string
  args: string[]
  timeoutMs: number
  report?: string
}

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    platform: process.platform,
    args: [],
    timeoutMs: 3000
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = argv[index + 1]

    if (arg === '--platform' && next) {
      parsed.platform = next
      index += 1
    } else if (arg === '--candidate' && next) {
      parsed.candidate = next
      index += 1
    } else if (arg === '--timeout-ms' && next) {
      parsed.timeoutMs = Number(next) || parsed.timeoutMs
      index += 1
    } else if (arg === '--report' && next) {
      parsed.report = next
      index += 1
    } else if (arg === '--arg' && next) {
      parsed.args.push(next)
      index += 1
    }
  }

  return parsed
}

function findFirstMatchingFile(root: string, suffix: string): string | null {
  if (!existsSync(root)) {
    return null
  }

  const entries = readdirSync(root)
  for (const entry of entries) {
    const fullPath = join(root, entry)
    const stats = statSync(fullPath)
    if (stats.isDirectory()) {
      const nested = findFirstMatchingFile(fullPath, suffix)
      if (nested) {
        return nested
      }
      continue
    }

    if (fullPath.endsWith(suffix)) {
      return fullPath
    }
  }

  return null
}

function resolveDefaultCandidate(platform: string): string | null {
  if (platform === 'windows' || platform === 'win32') {
    const candidate = join(process.cwd(), 'dist', 'win-unpacked', 'CodeAll.exe')
    return existsSync(candidate) ? candidate : null
  }

  if (platform === 'macos' || platform === 'darwin') {
    return findFirstMatchingFile(join(process.cwd(), 'dist'), 'CodeAll.app/Contents/MacOS/CodeAll')
  }

  return null
}

async function sleep(ms: number) {
  await new Promise(resolve => setTimeout(resolve, ms))
}

function terminateProcessTree(pid: number) {
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' })
    return
  }

  try {
    process.kill(-pid, 'SIGKILL')
  } catch {
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      // noop
    }
  }
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2))
  const candidate = parsed.candidate || resolveDefaultCandidate(parsed.platform)

  if (!candidate || !existsSync(candidate)) {
    const report = {
      status: 'FAIL',
      platform: parsed.platform,
      candidate: candidate || null,
      note: 'No executable candidate found for smoke check.'
    }
    if (parsed.report) {
      writeFileSync(parsed.report, JSON.stringify(report, null, 2))
    }
    console.error(report.note)
    process.exit(1)
  }

  const startedAt = new Date().toISOString()
  const child = spawn(candidate, parsed.args, {
    detached: true,
    stdio: 'ignore'
  })
  child.unref()

  await sleep(parsed.timeoutMs)

  const alive = child.exitCode === null && !child.killed
  if (child.pid) {
    terminateProcessTree(child.pid)
  }

  const report = {
    status: alive ? 'PASS' : 'FAIL',
    platform: parsed.platform,
    candidate,
    args: parsed.args,
    pid: child.pid || null,
    startedAt,
    checkedAt: new Date().toISOString(),
    note: alive ? 'Process stayed alive through smoke window.' : 'Process exited before smoke window finished.'
  }

  if (parsed.report) {
    writeFileSync(parsed.report, JSON.stringify(report, null, 2))
  }

  if (alive) {
    console.log(JSON.stringify(report, null, 2))
    return
  }

  console.error(JSON.stringify(report, null, 2))
  process.exit(1)
}

void main()

