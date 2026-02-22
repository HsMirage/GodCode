export interface BrowserLifecycleBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface BrowserPanelLifecycleSnapshot {
  panelOpen: boolean
  activeViewId: string | null
  bounds: BrowserLifecycleBounds | null
}

export interface BrowserPanelLifecyclePort {
  create: (viewId: string) => Promise<void> | void
  show: (viewId: string, bounds: BrowserLifecycleBounds) => Promise<void> | void
  hide: (viewId: string) => Promise<void> | void
  destroy: (viewId: string) => Promise<void> | void
}

export function createBrowserPanelLifecycle(port: BrowserPanelLifecyclePort) {
  let visibleViewId: string | null = null

  const hideVisible = async () => {
    if (!visibleViewId) {
      return
    }

    const previous = visibleViewId
    visibleViewId = null
    await port.hide(previous)
  }

  return {
    async sync(snapshot: BrowserPanelLifecycleSnapshot) {
      const { panelOpen, activeViewId, bounds } = snapshot

      if (!panelOpen || !activeViewId || !bounds || bounds.width <= 0 || bounds.height <= 0) {
        await hideVisible()
        return
      }

      await port.create(activeViewId)

      if (visibleViewId && visibleViewId !== activeViewId) {
        await port.hide(visibleViewId)
      }

      await port.show(activeViewId, bounds)
      visibleViewId = activeViewId
    },

    async closeView(viewId: string) {
      if (!viewId) {
        return
      }

      if (visibleViewId === viewId) {
        visibleViewId = null
      }

      await port.hide(viewId)
      await port.destroy(viewId)
    },

    getVisibleViewId() {
      return visibleViewId
    }
  }
}
