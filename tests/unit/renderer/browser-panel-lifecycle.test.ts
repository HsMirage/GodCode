import { describe, expect, it, vi } from 'vitest'

import { createBrowserPanelLifecycle } from '../../../src/renderer/src/components/panels/browser-panel-lifecycle'

describe('browser panel lifecycle', () => {
  it('opens active view when panel opens', async () => {
    const port = {
      create: vi.fn(async (_viewId: string) => {}),
      show: vi.fn(async (_viewId: string, _bounds: { x: number; y: number; width: number; height: number }) => {}),
      hide: vi.fn(async (_viewId: string) => {}),
      destroy: vi.fn(async (_viewId: string) => {})
    }

    const lifecycle = createBrowserPanelLifecycle(port)
    const bounds = { x: 10, y: 20, width: 400, height: 300 }

    await lifecycle.sync({
      panelOpen: true,
      activeViewId: 'tab-1',
      bounds
    })

    expect(port.create).toHaveBeenCalledWith('tab-1')
    expect(port.show).toHaveBeenCalledWith('tab-1', bounds)
    expect(port.hide).not.toHaveBeenCalled()
  })

  it('switches visible view when active tab changes', async () => {
    const port = {
      create: vi.fn(async (_viewId: string) => {}),
      show: vi.fn(async (_viewId: string, _bounds: { x: number; y: number; width: number; height: number }) => {}),
      hide: vi.fn(async (_viewId: string) => {}),
      destroy: vi.fn(async (_viewId: string) => {})
    }

    const lifecycle = createBrowserPanelLifecycle(port)
    const bounds = { x: 0, y: 0, width: 800, height: 600 }

    await lifecycle.sync({ panelOpen: true, activeViewId: 'tab-1', bounds })
    vi.clearAllMocks()

    await lifecycle.sync({ panelOpen: true, activeViewId: 'tab-2', bounds })

    expect(port.create).toHaveBeenCalledWith('tab-2')
    expect(port.hide).toHaveBeenCalledWith('tab-1')
    expect(port.show).toHaveBeenCalledWith('tab-2', bounds)
  })

  it('hides view when panel closes', async () => {
    const port = {
      create: vi.fn(async (_viewId: string) => {}),
      show: vi.fn(async (_viewId: string, _bounds: { x: number; y: number; width: number; height: number }) => {}),
      hide: vi.fn(async (_viewId: string) => {}),
      destroy: vi.fn(async (_viewId: string) => {})
    }

    const lifecycle = createBrowserPanelLifecycle(port)
    const bounds = { x: 0, y: 0, width: 640, height: 360 }

    await lifecycle.sync({ panelOpen: true, activeViewId: 'tab-1', bounds })
    vi.clearAllMocks()

    await lifecycle.sync({ panelOpen: false, activeViewId: 'tab-1', bounds })

    expect(port.hide).toHaveBeenCalledWith('tab-1')
    expect(port.show).not.toHaveBeenCalled()
  })

  it('hides and destroys view when tab is closed', async () => {
    const port = {
      create: vi.fn(async (_viewId: string) => {}),
      show: vi.fn(async (_viewId: string, _bounds: { x: number; y: number; width: number; height: number }) => {}),
      hide: vi.fn(async (_viewId: string) => {}),
      destroy: vi.fn(async (_viewId: string) => {})
    }

    const lifecycle = createBrowserPanelLifecycle(port)
    const bounds = { x: 0, y: 0, width: 480, height: 320 }

    await lifecycle.sync({ panelOpen: true, activeViewId: 'tab-1', bounds })
    vi.clearAllMocks()

    await lifecycle.closeView('tab-1')

    expect(port.hide).toHaveBeenCalledWith('tab-1')
    expect(port.destroy).toHaveBeenCalledWith('tab-1')
  })
})
