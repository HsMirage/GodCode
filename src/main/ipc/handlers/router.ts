import { IpcMainInvokeEvent, app } from 'electron'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { join, dirname } from 'path'
import { existsSync } from 'fs'
import { LoggerService } from '../../services/logger'

interface RoutingRule {
  pattern: string
  strategy: 'delegate' | 'workforce' | 'direct'
  category?: string
  subagent?: string
  model?: string
  baseURL?: string
  apiKey?: string
}

const DEFAULT_RULES: RoutingRule[] = [
  {
    pattern: '前端|UI|页面|组件',
    strategy: 'delegate',
    category: 'visual-engineering',
    model: 'gemini'
  },
  {
    pattern: '后端|API|数据库',
    strategy: 'delegate',
    model: 'gpt-4'
  },
  {
    pattern: '架构|设计',
    strategy: 'delegate',
    subagent: 'oracle',
    model: 'claude-opus'
  },
  {
    pattern: '创建|开发|实现',
    strategy: 'workforce'
  },
  {
    pattern: '.*',
    strategy: 'delegate',
    category: 'quick'
  }
]

function getConfigPath(): string {
  return join(app.getPath('userData'), 'routing-rules.json')
}

export async function handleRouterGetRules(_event: IpcMainInvokeEvent): Promise<RoutingRule[]> {
  const logger = LoggerService.getInstance().getLogger()
  const configPath = getConfigPath()

  try {
    if (!existsSync(configPath)) {
      logger.info('Routing rules config not found, returning defaults')
      return DEFAULT_RULES
    }

    const content = await readFile(configPath, 'utf-8')
    const config = JSON.parse(content)
    logger.info('Loaded routing rules from config')
    return config.rules || DEFAULT_RULES
  } catch (error) {
    logger.error('Failed to load routing rules', { error })
    return DEFAULT_RULES
  }
}

export async function handleRouterSaveRules(
  _event: IpcMainInvokeEvent,
  rules: RoutingRule[]
): Promise<void> {
  const logger = LoggerService.getInstance().getLogger()
  const configPath = getConfigPath()

  try {
    const dirPath = dirname(configPath)
    if (!existsSync(dirPath)) {
      await mkdir(dirPath, { recursive: true })
    }

    const config = { rules }
    await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8')
    logger.info('Saved routing rules to config', { count: rules.length })
  } catch (error) {
    logger.error('Failed to save routing rules', { error })
    throw error
  }
}
