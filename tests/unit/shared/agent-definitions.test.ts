import { describe, it, expect } from 'vitest'
import {
  AGENT_DEFINITIONS,
  resolvePrimaryAgentRolePolicy,
  listPrimaryAgentRoleAliases
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
})
