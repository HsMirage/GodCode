/**
 * CodeAll Skill Loader
 *
 * Loads skills from various sources:
 * - Builtin skills (shipped with CodeAll)
 * - User skills (from user config directory)
 * - Workspace skills (from .codeall/skills/ in workspace)
 */

import * as fs from 'fs'
import * as path from 'path'
import { logger } from '@/shared/logger'
import { skillRegistry } from './registry'
import type { Skill, SkillSource } from './types'

// Builtin skills
import { gitMasterSkill } from './builtin/git-master'
import { frontendUiUxSkill } from './builtin/frontend-ui-ux'

/**
 * Loader options
 */
export interface SkillLoaderOptions {
  /** Disable specific builtin skills by ID */
  disabledBuiltins?: Set<string>
  /** User skills directory path */
  userSkillsDir?: string
  /** Workspace directory for loading workspace skills */
  workspaceDir?: string
}

/**
 * Load all builtin skills
 */
export function loadBuiltinSkills(options: SkillLoaderOptions = {}): void {
  const { disabledBuiltins = new Set() } = options

  const builtinSkills: Skill[] = [gitMasterSkill, frontendUiUxSkill]

  for (const skill of builtinSkills) {
    if (disabledBuiltins.has(skill.id)) {
      logger.info(`Skipping disabled builtin skill: ${skill.id}`)
      continue
    }

    skillRegistry.register(skill, 'builtin')
  }

  logger.info(`Loaded ${builtinSkills.length - disabledBuiltins.size} builtin skills`)
}

/**
 * Load skills from a directory
 */
export async function loadSkillsFromDirectory(
  directory: string,
  source: SkillSource
): Promise<number> {
  if (!fs.existsSync(directory)) {
    logger.debug(`Skills directory does not exist: ${directory}`)
    return 0
  }

  let loadedCount = 0
  const files = fs.readdirSync(directory)

  for (const file of files) {
    if (!file.endsWith('.json') && !file.endsWith('.skill.json')) {
      continue
    }

    const filePath = path.join(directory, file)
    try {
      const content = fs.readFileSync(filePath, 'utf-8')
      const skillData = JSON.parse(content)

      // Validate required fields
      if (!skillData.id || !skillData.name || !skillData.template) {
        logger.warn(`Invalid skill file (missing required fields): ${filePath}`)
        continue
      }

      const skill: Skill = {
        id: skillData.id,
        name: skillData.name,
        description: skillData.description || '',
        template: skillData.template,
        triggers: parseSkillTriggers(skillData.triggers),
        allowedTools: skillData.allowedTools,
        agent: skillData.agent,
        model: skillData.model,
        subtask: skillData.subtask,
        argumentHint: skillData.argumentHint,
        mcpConfig: skillData.mcpConfig,
        metadata: skillData.metadata,
        builtin: false,
        enabled: skillData.enabled ?? true
      }

      skillRegistry.register(skill, source)
      loadedCount++
    } catch (error) {
      logger.error(`Failed to load skill from ${filePath}`, { error })
    }
  }

  logger.info(`Loaded ${loadedCount} skills from ${directory}`, { source })
  return loadedCount
}

/**
 * Load user skills from config directory
 */
export async function loadUserSkills(userSkillsDir?: string): Promise<number> {
  const dir = userSkillsDir || getDefaultUserSkillsDir()
  return loadSkillsFromDirectory(dir, 'user')
}

/**
 * Load workspace skills from .codeall/skills/
 */
export async function loadWorkspaceSkills(workspaceDir: string): Promise<number> {
  const skillsDir = path.join(workspaceDir, '.codeall', 'skills')
  return loadSkillsFromDirectory(skillsDir, 'workspace')
}

/**
 * Initialize skill system - load all skills
 */
export async function initializeSkills(options: SkillLoaderOptions = {}): Promise<void> {
  logger.info('Initializing skill system...')

  // Load builtin skills first
  loadBuiltinSkills(options)

  // Load user skills
  if (options.userSkillsDir) {
    await loadUserSkills(options.userSkillsDir)
  }

  // Load workspace skills
  if (options.workspaceDir) {
    await loadWorkspaceSkills(options.workspaceDir)
  }

  const totalSkills = skillRegistry.getAll().length
  logger.info(`Skill system initialized with ${totalSkills} skills`)
}

/**
 * Reload skills (useful after config change)
 */
export async function reloadSkills(options: SkillLoaderOptions = {}): Promise<void> {
  logger.info('Reloading skills...')
  skillRegistry.clear()
  await initializeSkills(options)
}

/**
 * Parse skill triggers from JSON data
 */
function parseSkillTriggers(data: unknown): Skill['triggers'] | undefined {
  if (!data || typeof data !== 'object') {
    return undefined
  }

  const triggers = data as Record<string, unknown>
  const result: Skill['triggers'] = {}

  if (Array.isArray(triggers.keywords)) {
    result.keywords = triggers.keywords.filter((k) => typeof k === 'string')
  }

  if (typeof triggers.command === 'string') {
    result.command = triggers.command
  }

  if (Array.isArray(triggers.patterns)) {
    result.patterns = triggers.patterns
      .filter((p) => typeof p === 'string')
      .map((p) => {
        try {
          return new RegExp(p, 'i')
        } catch {
          return null
        }
      })
      .filter((p): p is RegExp => p !== null)
  }

  return Object.keys(result).length > 0 ? result : undefined
}

/**
 * Get default user skills directory
 */
function getDefaultUserSkillsDir(): string {
  const homeDir = process.env.HOME || process.env.USERPROFILE || ''
  return path.join(homeDir, '.codeall', 'skills')
}
