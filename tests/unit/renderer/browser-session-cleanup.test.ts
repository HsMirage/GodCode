import { describe, expect, it, vi } from 'vitest'

import { cleanupBrowserSessionViews } from '../../../src/renderer/src/services/browser-session-cleanup'

describe('cleanupBrowserSessionViews', () => {
  it('hides and destroys each unique browser view', async () => {
    const hide = vi.fn(async (_viewId: string) => {})
    const destroy = vi.fn(async (_viewId: string) => {})

    const result = await cleanupBrowserSessionViews({
      listTabs: async () => [{ id: 'tab-1' }, { id: 'tab-2' }, { id: 'tab-1' }],
      hide,
      destroy
    })

    expect(hide).toHaveBeenNthCalledWith(1, 'tab-1')
    expect(hide).toHaveBeenNthCalledWith(2, 'tab-2')
    expect(destroy).toHaveBeenNthCalledWith(1, 'tab-1')
    expect(destroy).toHaveBeenNthCalledWith(2, 'tab-2')
    expect(result).toEqual({ cleanedViewIds: ['tab-1', 'tab-2'], failedViewIds: [] })
  })

  it('continues destroy even when hide fails', async () => {
    const destroy = vi.fn(async (_viewId: string) => {})
    const warn = vi.fn()

    const result = await cleanupBrowserSessionViews(
      {
        listTabs: async () => [{ id: 'tab-1' }],
        hide: async () => {
          throw new Error('hide failed')
        },
        destroy
      },
      { warn }
    )

    expect(destroy).toHaveBeenCalledWith('tab-1')
    expect(warn).toHaveBeenCalledOnce()
    expect(result).toEqual({ cleanedViewIds: ['tab-1'], failedViewIds: [] })
  })

  it('tracks destroy failures separately', async () => {
    const warn = vi.fn()

    const result = await cleanupBrowserSessionViews(
      {
        listTabs: async () => [{ id: 'tab-1' }],
        hide: async () => {},
        destroy: async () => {
          throw new Error('destroy failed')
        }
      },
      { warn }
    )

    expect(warn).toHaveBeenCalledOnce()
    expect(result).toEqual({ cleanedViewIds: [], failedViewIds: ['tab-1'] })
  })
})
