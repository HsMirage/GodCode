import { describe, expect, it } from 'vitest'
import { evaluateReleaseGateResults } from '@/shared/release-gate-matrix'

describe('release gate matrix', () => {
  it('marks release sign-off failed when a required gate fails', () => {
    const evaluation = evaluateReleaseGateResults([
      { id: 'RLS-BUILD-WIN', status: 'FAIL' },
      { id: 'RLS-BUILD-MAC', status: 'PASS' },
      { id: 'RLS-BOOT-WIN', status: 'BLOCKED' },
      { id: 'RLS-BOOT-MAC', status: 'PASS' },
      { id: 'RLS-FLOW-CHAT', status: 'PASS' },
      { id: 'RLS-FLOW-DELEGATE', status: 'PASS' },
      { id: 'RLS-FLOW-BROWSER', status: 'PASS' }
    ])

    expect(evaluation.overallStatus).toBe('FAIL')
    expect(evaluation.layers.find(layer => layer.layer === 'platform')?.status).toBe('FAIL')
    expect(evaluation.layers.find(layer => layer.layer === 'agent-capability')?.status).toBe('PASS')
    expect(evaluation.failingIds).toContain('RLS-BUILD-WIN')
    expect(evaluation.blockedIds).toContain('RLS-BOOT-WIN')
  })

  it('treats missing required gates as blocked', () => {
    const evaluation = evaluateReleaseGateResults([
      { id: 'RLS-BUILD-WIN', status: 'PASS' },
      { id: 'RLS-BUILD-MAC', status: 'PASS' }
    ])

    expect(evaluation.overallStatus).toBe('BLOCKED')
    expect(evaluation.missingRequiredIds).toContain('RLS-BOOT-WIN')
    expect(evaluation.missingRequiredIds).toContain('RLS-FLOW-BROWSER')
  })
})
