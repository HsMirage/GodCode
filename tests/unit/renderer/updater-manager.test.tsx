import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import { EVENT_CHANNELS, INVOKE_CHANNELS } from '../../../src/shared/ipc-channels'

import { UpdaterManager } from '../../../src/renderer/src/components/updater/UpdaterManager'
import { useUpdaterStore } from '../../../src/renderer/src/store/updater.store'

vi.mock('../../../src/renderer/src/components/updater/UpdateDialog', () => ({
  UpdateDialog: () => <div data-testid="update-dialog" />
}))

vi.mock('../../../src/renderer/src/components/updater/UpdateToast', () => ({
  UpdateToast: () => <div data-testid="update-toast" />
}))

describe('<UpdaterManager />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useUpdaterStore.getState().reset()
  })

  it('subscribes to updater events and mirrors them into the updater store', () => {
    const listeners = new Map<string, (...args: unknown[]) => void>()
    const invoke = vi.fn().mockResolvedValue(undefined)

    Object.defineProperty(window, 'codeall', {
      configurable: true,
      value: {
        invoke,
        on: vi.fn((channel: string, callback: (...args: unknown[]) => void) => {
          listeners.set(channel, callback)
          return () => listeners.delete(channel)
        })
      }
    })

    render(<UpdaterManager />)

    expect(invoke).toHaveBeenCalledWith(INVOKE_CHANNELS.UPDATER_CHECK_FOR_UPDATES)

    act(() => {
      listeners.get(EVENT_CHANNELS.UPDATER_CHECKING_FOR_UPDATE)?.()
    })
    expect(useUpdaterStore.getState().status).toBe('checking')

    act(() => {
      listeners.get(EVENT_CHANNELS.UPDATER_UPDATE_AVAILABLE)?.({ version: '1.2.3' })
    })
    expect(useUpdaterStore.getState().status).toBe('available')
    expect(useUpdaterStore.getState().updateInfo).toEqual({ version: '1.2.3' })

    act(() => {
      listeners.get(EVENT_CHANNELS.UPDATER_DOWNLOAD_PROGRESS)?.({ percent: 55, bytesPerSecond: 1024 })
    })
    expect(useUpdaterStore.getState().status).toBe('downloading')
    expect(useUpdaterStore.getState().progress).toEqual({ percent: 55, bytesPerSecond: 1024 })

    act(() => {
      listeners.get(EVENT_CHANNELS.UPDATER_UPDATE_DOWNLOADED)?.({ version: '1.2.3' })
    })
    expect(useUpdaterStore.getState().status).toBe('downloaded')

    act(() => {
      listeners.get(EVENT_CHANNELS.UPDATER_ERROR)?.('network failed')
    })
    expect(useUpdaterStore.getState().status).toBe('error')
    expect(useUpdaterStore.getState().error).toBe('network failed')
  })
})
