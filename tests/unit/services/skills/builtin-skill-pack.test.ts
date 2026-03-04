import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { loadBuiltinSkills } from '@/main/services/skills/loader'
import { skillRegistry } from '@/main/services/skills/registry'
import { resolveScopedRuntimeToolNames } from '@/main/services/delegate/tool-allowlist'

const semverPattern = /^\d+\.\d+\.\d+$/

describe('builtin skill pack', () => {
  beforeEach(() => {
    skillRegistry.clear()
  })

  afterEach(() => {
    skillRegistry.clear()
  })

  it('loads review/fix/explain skills with command triggers', () => {
    loadBuiltinSkills()

    expect(skillRegistry.findByCommand('/review')?.id).toBe('review')
    expect(skillRegistry.findByCommand('/fix')?.id).toBe('fix')
    expect(skillRegistry.findByCommand('/explain')?.id).toBe('explain')
  })

  it('ships metadata standard with version, pack version, schema version, tags, scenarios and risk level', () => {
    loadBuiltinSkills()

    const review = skillRegistry.get('review')
    const fix = skillRegistry.get('fix')
    const explain = skillRegistry.get('explain')

    for (const skill of [review, fix, explain]) {
      expect(skill).toBeDefined()
      expect(skill?.metadata?.version).toMatch(semverPattern)
      expect(skill?.metadata?.pack).toBe('builtin-skill-pack')
      expect(skill?.metadata?.packVersion).toMatch(semverPattern)
      expect(skill?.metadata?.schemaVersion).toMatch(semverPattern)
      expect(Array.isArray(skill?.metadata?.tags)).toBe(true)
      expect(Array.isArray(skill?.metadata?.scenarios)).toBe(true)
      expect(['low', 'medium', 'high']).toContain(skill?.metadata?.riskLevel)
    }
  })

  it('uses alias-friendly tool names that resolve to runtime tools', () => {
    loadBuiltinSkills()

    const reviewTools = resolveScopedRuntimeToolNames({
      availableTools: skillRegistry.get('review')?.allowedTools
    })
    const fixTools = resolveScopedRuntimeToolNames({
      availableTools: skillRegistry.get('fix')?.allowedTools
    })
    const explainTools = resolveScopedRuntimeToolNames({
      availableTools: skillRegistry.get('explain')?.allowedTools
    })

    expect(reviewTools).toEqual(expect.arrayContaining(['file_read', 'grep', 'glob', 'bash']))
    expect(fixTools).toEqual(expect.arrayContaining(['file_read', 'file_write', 'grep', 'glob', 'bash']))
    expect(explainTools).toEqual(expect.arrayContaining(['file_read', 'grep', 'glob']))
  })

  it('supports disabling one of the builtin skill pack commands', () => {
    loadBuiltinSkills({ disabledBuiltins: new Set(['fix']) })

    expect(skillRegistry.findByCommand('/review')?.id).toBe('review')
    expect(skillRegistry.findByCommand('/fix')).toBeUndefined()
    expect(skillRegistry.findByCommand('/explain')?.id).toBe('explain')
  })
})
