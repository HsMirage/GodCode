import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { skillRegistry } from '@/main/services/skills/registry'
import type { Skill } from '@/main/services/skills/types'

describe('skill registry command items', () => {
  const baseSkills: Skill[] = [
    {
      id: 'git-master',
      name: 'Git Master',
      description: 'Expert git operations',
      template: 'template',
      triggers: {
        command: 'commit',
        keywords: ['git', 'commit']
      },
      argumentHint: '[message]',
      enabled: true
    },
    {
      id: 'frontend-ui',
      name: 'Frontend UI',
      description: 'UI and UX design helper',
      template: 'template',
      triggers: {
        command: '/ui',
        keywords: ['ui', 'design']
      },
      enabled: true
    },
    {
      id: 'disabled-skill',
      name: 'Disabled',
      description: 'Should not appear',
      template: 'template',
      triggers: {
        command: 'hidden',
        keywords: ['hidden']
      },
      enabled: false
    }
  ]

  beforeEach(() => {
    skillRegistry.clear()
    for (const skill of baseSkills) {
      skillRegistry.register(skill, 'builtin')
    }
  })

  afterEach(() => {
    skillRegistry.clear()
  })

  it('returns enabled command items in registry order for empty query', () => {
    const items = skillRegistry.getCommandItems()

    expect(items.map((item) => item.command)).toEqual(['/commit', '/ui'])
    expect(items[0]).toMatchObject({
      label: 'Git Master',
      command: '/commit',
      description: 'Expert git operations',
      argsHint: '[message]'
    })
  })

  it('supports slash-prefix filtering', () => {
    const items = skillRegistry.getCommandItems('/co')
    expect(items.map((item) => item.command)).toEqual(['/commit'])
  })

  it('supports keyword filtering across metadata fields', () => {
    const byName = skillRegistry.getCommandItems('frontend')
    expect(byName.map((item) => item.command)).toEqual(['/ui'])

    const byDescription = skillRegistry.getCommandItems('ux')
    expect(byDescription.map((item) => item.command)).toEqual(['/ui'])

    const byKeyword = skillRegistry.getCommandItems('git')
    expect(byKeyword.map((item) => item.command)).toEqual(['/commit'])
  })

  it('ranks exact command matches ahead of partial matches', () => {
    skillRegistry.register(
      {
        id: 'commit-helper',
        name: 'Commit Helper',
        description: 'Handles commit related flows',
        template: 'template',
        triggers: {
          command: 'commit-helper',
          keywords: ['commit']
        },
        enabled: true
      },
      'builtin'
    )

    const items = skillRegistry.getCommandItems('/commit')
    expect(items.map((item) => item.command)).toEqual(['/commit', '/commit-helper'])
  })

  it('normalizes command indexing for findByCommand and slash input matching', () => {
    expect(skillRegistry.findByCommand('/COMMIT')?.id).toBe('git-master')
    expect(skillRegistry.findByCommand('commit')?.id).toBe('git-master')
    expect(skillRegistry.findByInput('/CoMmIt now').map((s) => s.id)).toContain('git-master')
  })
})
