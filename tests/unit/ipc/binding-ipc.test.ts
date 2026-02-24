import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { IpcMainInvokeEvent } from 'electron'

const {
  updateAgentBindingMock,
  resetAgentBindingMock,
  updateCategoryBindingMock,
  resetCategoryBindingMock
} = vi.hoisted(() => ({
  updateAgentBindingMock: vi.fn(async () => ({ ok: true })),
  resetAgentBindingMock: vi.fn(async () => ({ ok: true })),
  updateCategoryBindingMock: vi.fn(async () => ({ ok: true })),
  resetCategoryBindingMock: vi.fn(async () => ({ ok: true }))
}))

vi.mock('@/main/services/binding.service', () => ({
  BindingService: {
    getInstance: vi.fn(() => ({
      updateAgentBinding: updateAgentBindingMock,
      resetAgentBinding: resetAgentBindingMock,
      updateCategoryBinding: updateCategoryBindingMock,
      resetCategoryBinding: resetCategoryBindingMock
    }))
  }
}))

import {
  handleAgentBindingReset,
  handleAgentBindingUpdate,
  handleCategoryBindingReset,
  handleCategoryBindingUpdate
} from '@/main/ipc/handlers/binding'

describe('binding IPC handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('passes sender session context to updateAgentBinding', async () => {
    const event = { sender: { id: 321 } } as unknown as IpcMainInvokeEvent
    await handleAgentBindingUpdate(event, {
      agentCode: 'qianliyan',
      data: { modelId: 'model-1', enabled: true }
    })

    expect(updateAgentBindingMock).toHaveBeenCalledWith(
      'qianliyan',
      { modelId: 'model-1', enabled: true },
      { sessionId: '321' }
    )
  })

  it('passes sender session context to resetAgentBinding', async () => {
    const event = { sender: { id: 456 } } as unknown as IpcMainInvokeEvent
    await handleAgentBindingReset(event, 'qianliyan')

    expect(resetAgentBindingMock).toHaveBeenCalledWith('qianliyan', { sessionId: '456' })
  })

  it('passes sender session context to updateCategoryBinding', async () => {
    const event = { sender: { id: 789 } } as unknown as IpcMainInvokeEvent
    await handleCategoryBindingUpdate(event, {
      categoryCode: 'zhinv',
      data: { modelId: 'model-2', enabled: true }
    })

    expect(updateCategoryBindingMock).toHaveBeenCalledWith(
      'zhinv',
      { modelId: 'model-2', enabled: true },
      { sessionId: '789' }
    )
  })

  it('passes sender session context to resetCategoryBinding', async () => {
    const event = { sender: { id: 147 } } as unknown as IpcMainInvokeEvent
    await handleCategoryBindingReset(event, 'zhinv')

    expect(resetCategoryBindingMock).toHaveBeenCalledWith('zhinv', { sessionId: '147' })
  })
})
