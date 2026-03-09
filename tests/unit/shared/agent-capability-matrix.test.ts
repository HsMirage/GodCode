import { describe, expect, it } from 'vitest'
import {
  AGENT_CAPABILITY_BOUNDARIES,
  CATEGORY_CAPABILITY_BOUNDARIES,
  getAgentCapabilityBoundary,
  getCategoryCapabilityBoundary
} from '@/shared/agent-capability-matrix'

describe('agent capability matrix', () => {
  it('exposes boundaries for all agents and categories', () => {
    expect(AGENT_CAPABILITY_BOUNDARIES.length).toBeGreaterThan(0)
    expect(CATEGORY_CAPABILITY_BOUNDARIES.length).toBeGreaterThan(0)
  })

  it('derives high-risk boundary for execution-heavy agents', () => {
    const luban = getAgentCapabilityBoundary('luban')
    expect(luban).toBeDefined()
    expect(luban?.riskLevel).toBe('high')
    expect(luban?.allowedTools).toContain('bash')
    expect(luban?.unsuitableTasks).toContain('高层规划评审')
  })

  it('returns category-specific task fit guidance', () => {
    const dayu = getCategoryCapabilityBoundary('dayu')
    expect(dayu).toBeDefined()
    expect(dayu?.suitableTasks).toContain('高复杂度实现')
    expect(dayu?.capabilityIds.length).toBeGreaterThan(0)
  })
})

