import { describe, it, expect } from 'vitest'
import {
  AGENT_DEFINITIONS,
  resolvePrimaryAgentRolePolicy,
  listPrimaryAgentRoleAliases,
  getAgentByCode,
  getAgentPresetById,
  getAgentPresetMappedDefinition,
  listAgentPresets
} from '@/shared/agent-definitions'

describe('primary agent role mapping', () => {
  it('maps canonical aliases to primary agents', () => {
    expect(resolvePrimaryAgentRolePolicy('fuxi')).toEqual({
      alias: 'fuxi',
      canonicalAgent: 'fuxi',
      canonicalRole: 'planning'
    })

    expect(resolvePrimaryAgentRolePolicy('haotian')).toEqual({
      alias: 'haotian',
      canonicalAgent: 'haotian',
      canonicalRole: 'orchestration'
    })

    expect(resolvePrimaryAgentRolePolicy('kuafu')).toEqual({
      alias: 'kuafu',
      canonicalAgent: 'kuafu',
      canonicalRole: 'execution'
    })
  })

  it('resolves native aliases and is case-insensitive', () => {
    expect(resolvePrimaryAgentRolePolicy('FuXi')).toEqual({
      alias: 'fuxi',
      canonicalAgent: 'fuxi',
      canonicalRole: 'planning'
    })
    expect(resolvePrimaryAgentRolePolicy('HAOTIAN')).toEqual({
      alias: 'haotian',
      canonicalAgent: 'haotian',
      canonicalRole: 'orchestration'
    })
    expect(resolvePrimaryAgentRolePolicy('KuAfu')).toEqual({
      alias: 'kuafu',
      canonicalAgent: 'kuafu',
      canonicalRole: 'execution'
    })
  })

  it('returns null for unknown role aliases and exposes known aliases list', () => {
    expect(resolvePrimaryAgentRolePolicy('unknown-role')).toBeNull()

    const aliases = listPrimaryAgentRoleAliases()
    expect(aliases).toContain('fuxi')
    expect(aliases).toContain('haotian')
    expect(aliases).toContain('kuafu')
  })

  it('defines primaryRole metadata for the three primary orchestrator agents', () => {
    const fuxi = AGENT_DEFINITIONS.find(agent => agent.code === 'fuxi')
    const haotian = AGENT_DEFINITIONS.find(agent => agent.code === 'haotian')
    const kuafu = AGENT_DEFINITIONS.find(agent => agent.code === 'kuafu')

    expect(fuxi?.primaryRole?.canonicalRole).toBe('planning')
    expect(haotian?.primaryRole?.canonicalRole).toBe('orchestration')
    expect(kuafu?.primaryRole?.canonicalRole).toBe('execution')
  })

  it('should set fuxi defaultStrategy to workforce', () => {
    const fuxi = getAgentByCode('fuxi')
    expect(fuxi?.defaultStrategy).toBe('workforce')
  })

  it('maps presets to existing agent definitions and returns safe copies', () => {
    const plannerPreset = getAgentPresetById('planner')
    expect(plannerPreset.mappedAgentCode).toBe('fuxi')

    const mappedPlannerAgent = getAgentPresetMappedDefinition('planner')
    expect(mappedPlannerAgent.code).toBe('fuxi')

    const presets = listAgentPresets()
    expect(presets.length).toBeGreaterThanOrEqual(5)

    const planner = presets.find(preset => preset.id === 'planner')
    expect(planner).toBeDefined()
    expect(planner?.recommendedModelKeywords.length).toBeGreaterThan(0)

    const originalKeyword = planner?.recommendedModelKeywords[0]
    if (!originalKeyword) {
      throw new Error('Planner preset should define at least one recommended keyword')
    }

    planner?.recommendedModelKeywords.splice(0, 1, 'mutated-keyword')

    const plannerReloaded = getAgentPresetById('planner')
    expect(plannerReloaded.recommendedModelKeywords[0]).toBe(originalKeyword)
  })

  it('ensures each preset points to a valid mapped agent', () => {
    for (const preset of listAgentPresets()) {
      const mappedAgent = getAgentByCode(preset.mappedAgentCode)
      expect(mappedAgent, `Preset ${preset.id} maps to unknown agent`).toBeDefined()
    }
  })
})
