import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { EVENT_CHANNELS, INVOKE_CHANNELS } from '../src/shared/ipc-channels'

type ScanTarget = {
  label: string
  rootDir?: string
  files?: string[]
  regex: RegExp
  allowedChannels: Set<string>
  channelType: 'invoke' | 'event'
}

type Violation = {
  label: string
  file: string
  channel: string
  channelType: 'invoke' | 'event'
}

const projectRoot = process.cwd()
const invokeChannels = new Set(Object.values(INVOKE_CHANNELS))
const eventChannels = new Set(Object.values(EVENT_CHANNELS))

const scanTargets: ScanTarget[] = [
  {
    label: 'Renderer invoke usage',
    rootDir: 'src/renderer',
    regex: /window\.(?:godcode|codeall)\.invoke\(\s*(['"`])([^'"`]+)\1/g,
    allowedChannels: invokeChannels,
    channelType: 'invoke'
  },
  {
    label: 'Renderer event subscription',
    rootDir: 'src/renderer',
    regex: /window\.(?:godcode|codeall)\.(?:on|once|off)\(\s*(['"`])([^'"`]+)\1/g,
    allowedChannels: eventChannels,
    channelType: 'event'
  },
  {
    label: 'Renderer API invoke helper',
    files: ['src/renderer/src/api.ts'],
    regex: /\binvoke\(\s*(['"`])([^'"`]+)\1/g,
    allowedChannels: invokeChannels,
    channelType: 'invoke'
  },
  {
    label: 'Renderer API safeInvoke helper',
    files: ['src/renderer/src/api.ts'],
    regex: /\bsafeInvoke\(\s*(['"`])([^'"`]+)\1/g,
    allowedChannels: invokeChannels,
    channelType: 'invoke'
  },
  {
    label: 'Renderer API event helper',
    files: ['src/renderer/src/api.ts'],
    regex: /\bonEvent\(\s*(['"`])([^'"`]+)\1/g,
    allowedChannels: eventChannels,
    channelType: 'event'
  },
  {
    label: 'Main ipcMain.handle registration',
    rootDir: 'src/main',
    regex: /ipcMain\.handle\(\s*(['"`])([^'"`]+)\1/g,
    allowedChannels: invokeChannels,
    channelType: 'invoke'
  },
  {
    label: 'Main ipcMain.on registration',
    rootDir: 'src/main',
    regex: /ipcMain\.on\(\s*(['"`])([^'"`]+)\1/g,
    allowedChannels: eventChannels,
    channelType: 'event'
  },
  {
    label: 'Main webContents.send emission',
    rootDir: 'src/main',
    regex: /\.webContents\.send\(\s*(['"`])([^'"`]+)\1/g,
    allowedChannels: eventChannels,
    channelType: 'event'
  }
]

async function collectSourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async entry => {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        return collectSourceFiles(fullPath)
      }

      if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
        return [fullPath]
      }

      return []
    })
  )

  return files.flat()
}

async function scanTarget(target: ScanTarget): Promise<Violation[]> {
  const files = target.files
    ? target.files.map(file => path.join(projectRoot, file))
    : await collectSourceFiles(path.join(projectRoot, target.rootDir ?? '.'))
  const violations: Violation[] = []

  for (const file of files) {
    const source = await readFile(file, 'utf8')
    const matches = source.matchAll(target.regex)

    for (const match of matches) {
      const channel = match[2]
      if (!target.allowedChannels.has(channel)) {
        violations.push({
          label: target.label,
          file: path.relative(projectRoot, file),
          channel,
          channelType: target.channelType
        })
      }
    }
  }

  return violations
}

async function verifyPreloadUsesSharedChannels(): Promise<string[]> {
  const preloadApiPath = path.join(projectRoot, 'src/preload/api.ts')
  const preloadSource = await readFile(preloadApiPath, 'utf8')
  const issues: string[] = []

  const requiredSnippets = [
    "from '../shared/ipc-channels'",
    'Object.values(INVOKE_CHANNELS)',
    'Object.values(EVENT_CHANNELS)'
  ]

  for (const snippet of requiredSnippets) {
    if (!preloadSource.includes(snippet)) {
      issues.push(`src/preload/api.ts 缺少共享 channel 片段: ${snippet}`)
    }
  }

  return issues
}

function verifyUniqueness(channels: string[], label: string): string[] {
  const duplicates = new Set<string>()
  const seen = new Set<string>()

  for (const channel of channels) {
    if (seen.has(channel)) {
      duplicates.add(channel)
      continue
    }
    seen.add(channel)
  }

  return [...duplicates].map(channel => `${label} 存在重复值: ${channel}`)
}

function verifyNoOverlap(invokeChannelList: string[], eventChannelList: string[]): string[] {
  const overlaps = invokeChannelList.filter(channel => eventChannelList.includes(channel))

  return overlaps.map(channel => `INVOKE_CHANNELS 与 EVENT_CHANNELS 存在重复值: ${channel}`)
}

async function main(): Promise<void> {
  const violations = (await Promise.all(scanTargets.map(target => scanTarget(target)))).flat()
  const preloadIssues = await verifyPreloadUsesSharedChannels()
  const channelDefinitionIssues = [
    ...verifyUniqueness(Object.values(INVOKE_CHANNELS), 'INVOKE_CHANNELS'),
    ...verifyUniqueness(Object.values(EVENT_CHANNELS), 'EVENT_CHANNELS'),
    ...verifyNoOverlap(Object.values(INVOKE_CHANNELS), Object.values(EVENT_CHANNELS))
  ]

  if (
    violations.length === 0 &&
    preloadIssues.length === 0 &&
    channelDefinitionIssues.length === 0
  ) {
    console.log(
      `✅ IPC alignment verified: ${invokeChannels.size} invoke channels, ${eventChannels.size} event channels, ${scanTargets.length} scan groups.`
    )
    return
  }

  console.error('❌ IPC alignment verification failed.')

  for (const issue of preloadIssues) {
    console.error(`- ${issue}`)
  }

  for (const issue of channelDefinitionIssues) {
    console.error(`- ${issue}`)
  }

  for (const violation of violations) {
    console.error(
      `- ${violation.label}: ${violation.file} 使用了未注册的 ${violation.channelType} channel \`${violation.channel}\``
    )
  }

  process.exitCode = 1
}

void main()
