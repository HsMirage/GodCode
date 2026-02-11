/**
 * CodeAll Skill Registry
 *
 * Manages registration and retrieval of skills.
 */

import { logger } from '@/shared/logger'
import type { Skill, SkillRegistration, SkillSource, SkillTrigger } from './types'

class SkillRegistry {
  private skills: Map<string, SkillRegistration> = new Map()
  private commandIndex: Map<string, string> = new Map() // command -> skillId
  private keywordIndex: Map<string, Set<string>> = new Map() // keyword -> skillIds

  /**
   * Register a skill
   */
  register(skill: Skill, source: SkillSource = 'user'): void {
    if (this.skills.has(skill.id)) {
      logger.warn(`Skill "${skill.id}" is already registered, overwriting`, { source })
    }

    const registration: SkillRegistration = {
      skill,
      source,
      loadedAt: new Date()
    }

    this.skills.set(skill.id, registration)
    this.indexTriggers(skill)

    logger.info(`Registered skill: ${skill.id}`, {
      name: skill.name,
      source,
      triggers: skill.triggers
    })
  }

  /**
   * Unregister a skill
   */
  unregister(skillId: string): boolean {
    const registration = this.skills.get(skillId)
    if (!registration) {
      return false
    }

    // Remove from indexes
    this.removeFromIndexes(registration.skill)
    this.skills.delete(skillId)

    logger.info(`Unregistered skill: ${skillId}`)
    return true
  }

  /**
   * Get a skill by ID
   */
  get(skillId: string): Skill | undefined {
    return this.skills.get(skillId)?.skill
  }

  /**
   * Get all registered skills
   */
  getAll(): Skill[] {
    return Array.from(this.skills.values()).map((r) => r.skill)
  }

  /**
   * Get skills by source
   */
  getBySource(source: SkillSource): Skill[] {
    return Array.from(this.skills.values())
      .filter((r) => r.source === source)
      .map((r) => r.skill)
  }

  /**
   * Get enabled skills only
   */
  getEnabled(): Skill[] {
    return Array.from(this.skills.values())
      .filter((r) => r.skill.enabled !== false)
      .map((r) => r.skill)
  }

  /**
   * Find skill by command (e.g., "/commit")
   */
  findByCommand(command: string): Skill | undefined {
    const normalizedCommand = command.startsWith('/') ? command.slice(1) : command
    const skillId = this.commandIndex.get(normalizedCommand)
    return skillId ? this.get(skillId) : undefined
  }

  /**
   * Find skills matching input text
   */
  findByInput(input: string): Skill[] {
    const matches: Set<string> = new Set()
    const lowerInput = input.toLowerCase()

    // Check command prefix
    if (input.startsWith('/')) {
      const command = input.slice(1).split(/\s/)[0]
      const skillId = this.commandIndex.get(command)
      if (skillId) {
        matches.add(skillId)
      }
    }

    // Check keywords
    for (const [keyword, skillIds] of this.keywordIndex) {
      if (lowerInput.includes(keyword.toLowerCase())) {
        skillIds.forEach((id) => matches.add(id))
      }
    }

    // Check regex patterns
    for (const [, registration] of this.skills) {
      const skill = registration.skill
      if (skill.triggers?.patterns) {
        for (const pattern of skill.triggers.patterns) {
          if (pattern.test(input)) {
            matches.add(skill.id)
            break
          }
        }
      }
    }

    return Array.from(matches)
      .map((id) => this.get(id))
      .filter((s): s is Skill => s !== undefined)
  }

  /**
   * Check if a skill is registered
   */
  has(skillId: string): boolean {
    return this.skills.has(skillId)
  }

  /**
   * Get registration info for a skill
   */
  getRegistration(skillId: string): SkillRegistration | undefined {
    return this.skills.get(skillId)
  }

  /**
   * Clear all skills (useful for testing)
   */
  clear(): void {
    this.skills.clear()
    this.commandIndex.clear()
    this.keywordIndex.clear()
    logger.info('Cleared all skills from registry')
  }

  /**
   * Index skill triggers for fast lookup
   */
  private indexTriggers(skill: Skill): void {
    const triggers = skill.triggers
    if (!triggers) return

    // Index command
    if (triggers.command) {
      const cmd = triggers.command.startsWith('/') ? triggers.command.slice(1) : triggers.command
      this.commandIndex.set(cmd, skill.id)
    }

    // Index keywords
    if (triggers.keywords) {
      for (const keyword of triggers.keywords) {
        const existing = this.keywordIndex.get(keyword) || new Set()
        existing.add(skill.id)
        this.keywordIndex.set(keyword, existing)
      }
    }
  }

  /**
   * Remove skill from indexes
   */
  private removeFromIndexes(skill: Skill): void {
    const triggers = skill.triggers
    if (!triggers) return

    // Remove from command index
    if (triggers.command) {
      const cmd = triggers.command.startsWith('/') ? triggers.command.slice(1) : triggers.command
      if (this.commandIndex.get(cmd) === skill.id) {
        this.commandIndex.delete(cmd)
      }
    }

    // Remove from keyword index
    if (triggers.keywords) {
      for (const keyword of triggers.keywords) {
        const existing = this.keywordIndex.get(keyword)
        if (existing) {
          existing.delete(skill.id)
          if (existing.size === 0) {
            this.keywordIndex.delete(keyword)
          }
        }
      }
    }
  }
}

// Singleton instance
export const skillRegistry = new SkillRegistry()
