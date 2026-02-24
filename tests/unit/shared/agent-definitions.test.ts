import { describe, expect, it } from 'vitest'
import { getAgentByCode } from '@/shared/agent-definitions'

describe('agent-definitions', () => {
  it('should set fuxi defaultStrategy to workforce', () => {
    const fuxi = getAgentByCode('fuxi')

    expect(fuxi?.defaultStrategy).toBe('workforce')
  })
})
