import { describe, expect, it, vi } from 'vitest'

import { createBrowserPanelLifecycle } from '../../../src/renderer/src/components/panels/browser-panel-lifecycle'

describe('browser panel lifecycle', () => {
  it('opens active view when panel opens', async () => {
    const port = {
      create: vi.fn(async (_viewId: string) => {}),
      show: vi.fn(async (_viewId: string, _bounds: { x: number; y: number; width: number; height: number }) => {}),
      hide: vi.fn(async (_viewId: string) => {}),
      destroy: vi.fn(async (_viewId: string) => {}),
      resize: vi.fn(async (_viewId: string, _bounds: { x: number; y: number; width: number; height: number }) => {})
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
    expect(lifecycle.getDebugSnapshot().viewState).toBe('visible')
  })

  it('resizes active view instead of re-showing it', async () => {
    const port = {
      create: vi.fn(async (_viewId: string) => {}),
      show: vi.fn(async (_viewId: string, _bounds: { x: number; y: number; width: number; height: number }) => {}),
      hide: vi.fn(async (_viewId: string) => {}),
      destroy: vi.fn(async (_viewId: string) => {}),
      resize: vi.fn(async (_viewId: string, _bounds: { x: number; y: number; width: number; height: number }) => {})
    }

    const lifecycle = createBrowserPanelLifecycle(port)

    await lifecycle.sync({
      panelOpen: true,
      activeViewId: 'tab-1',
      bounds: { x: 0, y: 0, width: 800, height: 600 }
    })
    vi.clearAllMocks()

    await lifecycle.sync({
      panelOpen: true,
      activeViewId: 'tab-1',
      bounds: { x: 0, y: 0, width: 820, height: 620 }
    })

    expect(port.show).not.toHaveBeenCalled()
    expect(port.resize).toHaveBeenCalledWith('tab-1', { x: 0, y: 0, width: 820, height: 620 })
    expect(lifecycle.getVisibleViewId()).toBe('tab-1')
  })

  it('switches visible view when active tab changes', async () => {
    const port = {
      create: vi.fn(async (_viewId: string) => {}),
      show: vi.fn(async (_viewId: string, _bounds: { x: number; y: number; width: number; height: number }) => {}),
      hide: vi.fn(async (_viewId: string) => {}),
      destroy: vi.fn(async (_viewId: string) => {}),
      resize: vi.fn(async (_viewId: string, _bounds: { x: number; y: number; width: number; height: number }) => {})
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

  it('hides visible view when panel closes', async () => {
    const port = {
      create: vi.fn(async (_viewId: string) => {}),
      show: vi.fn(async (_viewId: string, _bounds: { x: number; y: number; width: number; height: number }) => {}),
      hide: vi.fn(async (_viewId: string) => {}),
      destroy: vi.fn(async (_viewId: string) => {}),
      resize: vi.fn(async (_viewId: string, _bounds: { x: number; y: number; width: number; height: number }) => {})
    }

    const lifecycle = createBrowserPanelLifecycle(port)
    const bounds = { x: 0, y: 0, width: 640, height: 360 }

    await lifecycle.sync({ panelOpen: true, activeViewId: 'tab-1', bounds })
    vi.clearAllMocks()

    await lifecycle.sync({ panelOpen: false, activeViewId: 'tab-1', bounds })

    expect(port.hide).toHaveBeenCalledWith('tab-1')
    expect(port.show).not.toHaveBeenCalled()
    expect(lifecycle.getDebugSnapshot().blockedReason).toBe('panel-closed')
  })

  it('hides visible view while overlays block the panel', async () => {
    const port = {
      create: vi.fn(async (_viewId: string) => {}),
      show: vi.fn(async (_viewId: string, _bounds: { x: number; y: number; width: number; height: number }) => {}),
      hide: vi.fn(async (_viewId: string) => {}),
      destroy: vi.fn(async (_viewId: string) => {}),
      resize: vi.fn(async (_viewId: string, _bounds: { x: number; y: number; width: number; height: number }) => {})
    }

    const lifecycle = createBrowserPanelLifecycle(port)
    const bounds = { x: 0, y: 0, width: 700, height: 500 }

    await lifecycle.sync({ panelOpen: true, activeViewId: 'tab-1', bounds, canShow: true })
    vi.clearAllMocks()

    await lifecycle.sync({ panelOpen: true, activeViewId: 'tab-1', bounds, canShow: false })

    expect(port.hide).toHaveBeenCalledWith('tab-1')
    expect(port.show).not.toHaveBeenCalled()
    expect(lifecycle.getDebugSnapshot().blockedReason).toBe('overlay-blocked')
  })

  it('hides and destroys view when tab is closed', async () => {
    const port = {
      create: vi.fn(async (_viewId: string) => {}),
      show: vi.fn(async (_viewId: string, _bounds: { x: number; y: number; width: number; height: number }) => {}),
      hide: vi.fn(async (_viewId: string) => {}),
      destroy: vi.fn(async (_viewId: string) => {}),
      resize: vi.fn(async (_viewId: string, _bounds: { x: number; y: number; width: number; height: number }) => {})
    }

    const lifecycle = createBrowserPanelLifecycle(port)
    const bounds = { x: 0, y: 0, width: 480, height: 320 }

    await lifecycle.sync({ panelOpen: true, activeViewId: 'tab-1', bounds })
    vi.clearAllMocks()

    await lifecycle.closeView('tab-1')

    expect(port.hide).toHaveBeenCalledWith('tab-1')
    expect(port.destroy).toHaveBeenCalledWith('tab-1')
    expect(lifecycle.getDebugSnapshot().tabState).toBe('disposed')
  })

  it('suspends the visible view without destroying it', async () => {
    const port = {
      create: vi.fn(async (_viewId: string) => {}),
      show: vi.fn(async (_viewId: string, _bounds: { x: number; y: number; width: number; height: number }) => {}),
      hide: vi.fn(async (_viewId: string) => {}),
      destroy: vi.fn(async (_viewId: string) => {}),
      resize: vi.fn(async (_viewId: string, _bounds: { x: number; y: number; width: number; height: number }) => {})
    }

    const lifecycle = createBrowserPanelLifecycle(port)
    const bounds = { x: 0, y: 0, width: 640, height: 360 }

    await lifecycle.sync({ panelOpen: true, activeViewId: 'tab-1', bounds })
    vi.clearAllMocks()

    await lifecycle.suspend()

    expect(port.hide).toHaveBeenCalledWith('tab-1')
    expect(port.destroy).not.toHaveBeenCalled()
    expect(lifecycle.getVisibleViewId()).toBeNull()
    expect(lifecycle.getDebugSnapshot().blockedReason).toBe('component-unmount')
  })

  it('disposes all tracked views during session cleanup', async () => {
    const port = {
      create: vi.fn(async (_viewId: string) => {}),
      show: vi.fn(async (_viewId: string, _bounds: { x: number; y: number; width: number; height: number }) => {}),
      hide: vi.fn(async (_viewId: string) => {}),
      destroy: vi.fn(async (_viewId: string) => {}),
      resize: vi.fn(async (_viewId: string, _bounds: { x: number; y: number; width: number; height: number }) => {})
    }

    const lifecycle = createBrowserPanelLifecycle(port)
    const bounds = { x: 0, y: 0, width: 800, height: 600 }

    await lifecycle.sync({ panelOpen: true, activeViewId: 'tab-1', bounds })
    await lifecycle.sync({ panelOpen: true, activeViewId: 'tab-2', bounds })
    vi.clearAllMocks()

    await lifecycle.disposeAll()

    expect(port.hide).toHaveBeenCalledWith('tab-2')
    expect(port.destroy).toHaveBeenCalledWith('tab-1')
    expect(port.destroy).toHaveBeenCalledWith('tab-2')
    expect(lifecycle.getVisibleViewId()).toBeNull()
    expect(lifecycle.getDebugSnapshot().tabState).toBe('disposed')
  })
})
