import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getCommandItemsMock } = vi.hoisted(() => ({
  getCommandItemsMock: vi.fn()
}))

vi.mock('@/main/services/skills/registry', () => ({
  skillRegistry: {
    getCommandItems: (...args: any[]) => getCommandItemsMock(...args)
  }
}))

import { handleSkillCommandItems } from '@/main/ipc/handlers/skill'

describe('skill IPC handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('forwards query string to skill registry command item lookup', async () => {
    const expected = [{ command: '/review', skillId: 'review', title: 'Review', description: 'desc' }]
    getCommandItemsMock.mockReturnValue(expected)

    const result = await handleSkillCommandItems({} as any, { query: '/rev' })

    expect(getCommandItemsMock).toHaveBeenCalledWith('/rev')
    expect(result).toEqual(expected)
  })

  it('falls back to empty query when input is missing or invalid', async () => {
    getCommandItemsMock.mockReturnValue([])

    await handleSkillCommandItems({} as any)
    await handleSkillCommandItems({} as any, {} as any)
    await handleSkillCommandItems({} as any, { query: 123 as any })

    expect(getCommandItemsMock).toHaveBeenNthCalledWith(1, '')
    expect(getCommandItemsMock).toHaveBeenNthCalledWith(2, '')
    expect(getCommandItemsMock).toHaveBeenNthCalledWith(3, '')
  })
})
