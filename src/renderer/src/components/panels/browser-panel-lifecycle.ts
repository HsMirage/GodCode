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
  canShow?: boolean
}

export interface BrowserPanelLifecyclePort {
  create: (viewId: string) => Promise<void> | void
  show: (viewId: string, bounds: BrowserLifecycleBounds) => Promise<void> | void
  hide: (viewId: string) => Promise<void> | void
  destroy: (viewId: string) => Promise<void> | void
  resize: (viewId: string, bounds: BrowserLifecycleBounds) => Promise<void> | void
}

function normalizeViewIds(viewIds: string[]) {
  return Array.from(new Set(viewIds.filter(Boolean)))
}

export async function disposeBrowserViews(
  port: Pick<BrowserPanelLifecyclePort, 'hide' | 'destroy'>,
  viewIds: string[]
) {
  for (const viewId of normalizeViewIds(viewIds)) {
    await port.hide(viewId)
    await port.destroy(viewId)
  }
}

export type BrowserViewLifecycleState = 'created' | 'attached' | 'visible' | 'hidden' | 'disposed'

export type BrowserTabLifecycleState = 'inactive' | 'active' | 'closing' | 'disposed'

export type BrowserPanelBlockedReason =
  | 'panel-closed'
  | 'no-active-view'
  | 'invalid-bounds'
  | 'overlay-blocked'
  | 'tab-closing'
  | 'component-unmount'
  | null

export interface BrowserPanelLifecycleDebugSnapshot {
  visibleViewId: string | null
  createdViewIds: string[]
  viewState: BrowserViewLifecycleState
  tabState: BrowserTabLifecycleState
  blockedReason: BrowserPanelBlockedReason
}

function cloneBounds(bounds: BrowserLifecycleBounds): BrowserLifecycleBounds {
  return {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height
  }
}

function areBoundsEqual(
  left: BrowserLifecycleBounds | null,
  right: BrowserLifecycleBounds | null
): boolean {
  if (!left || !right) {
    return left === right
  }

  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  )
}

export function createBrowserPanelLifecycle(port: BrowserPanelLifecyclePort) {
  let visibleViewId: string | null = null
  const createdViewIds = new Set<string>()
  let lastVisibleBounds: BrowserLifecycleBounds | null = null
  let viewState: BrowserViewLifecycleState = 'hidden'
  let tabState: BrowserTabLifecycleState = 'inactive'
  let blockedReason: BrowserPanelBlockedReason = null

  const hideVisible = async (reason: BrowserPanelBlockedReason) => {
    blockedReason = reason

    if (!visibleViewId) {
      viewState = createdViewIds.size > 0 ? 'hidden' : 'disposed'
      if (tabState !== 'closing') {
        tabState = createdViewIds.size > 0 ? 'inactive' : 'disposed'
      }
      lastVisibleBounds = null
      return
    }

    const previous = visibleViewId
    visibleViewId = null
    lastVisibleBounds = null
    viewState = 'hidden'
    if (tabState !== 'closing') {
      tabState = createdViewIds.size > 0 ? 'inactive' : 'disposed'
    }
    await port.hide(previous)
  }

  const ensureCreated = async (viewId: string) => {
    if (createdViewIds.has(viewId)) {
      return
    }

    await port.create(viewId)
    createdViewIds.add(viewId)
    viewState = 'created'
  }

  return {
    async sync(snapshot: BrowserPanelLifecycleSnapshot) {
      const { panelOpen, activeViewId, bounds, canShow = true } = snapshot

      if (!panelOpen) {
        await hideVisible('panel-closed')
        return
      }

      if (!activeViewId) {
        await hideVisible('no-active-view')
        return
      }

      if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
        await hideVisible('invalid-bounds')
        return
      }

      if (!canShow) {
        await hideVisible('overlay-blocked')
        return
      }

      blockedReason = null
      await ensureCreated(activeViewId)

      if (visibleViewId && visibleViewId !== activeViewId) {
        await port.hide(visibleViewId)
        visibleViewId = null
        lastVisibleBounds = null
        viewState = 'hidden'
      }

      if (visibleViewId !== activeViewId) {
        viewState = 'attached'
        await port.show(activeViewId, bounds)
        visibleViewId = activeViewId
        lastVisibleBounds = cloneBounds(bounds)
        viewState = 'visible'
        tabState = 'active'
        return
      }

      if (!areBoundsEqual(lastVisibleBounds, bounds)) {
        await port.resize(activeViewId, bounds)
        lastVisibleBounds = cloneBounds(bounds)
      }

      viewState = 'visible'
      tabState = 'active'
    },

    async closeView(viewId: string) {
      if (!viewId) {
        return
      }

      tabState = 'closing'

      if (visibleViewId === viewId) {
        await hideVisible('tab-closing')
      } else {
        blockedReason = 'tab-closing'
        await port.hide(viewId)
      }

      createdViewIds.delete(viewId)
      if (!visibleViewId) {
        lastVisibleBounds = null
      }

      await port.destroy(viewId)

      tabState = createdViewIds.size > 0 ? 'inactive' : 'disposed'
      viewState = createdViewIds.size > 0 ? 'hidden' : 'disposed'
    },

    async suspend() {
      await hideVisible('component-unmount')
    },

    async disposeAll(viewIds: string[] = Array.from(createdViewIds)) {
      const targets = normalizeViewIds(viewIds)

      if (targets.length === 0) {
        await hideVisible('component-unmount')
        return
      }

      if (visibleViewId && targets.includes(visibleViewId)) {
        await hideVisible('component-unmount')
      }

      for (const viewId of targets) {
        if (visibleViewId === viewId) {
          visibleViewId = null
        }

        createdViewIds.delete(viewId)
      }

      await disposeBrowserViews(port, targets)

      lastVisibleBounds = null
      blockedReason = 'component-unmount'
      tabState = createdViewIds.size > 0 ? 'inactive' : 'disposed'
      viewState = createdViewIds.size > 0 ? 'hidden' : 'disposed'
    },

    async hideVisible(reason: BrowserPanelBlockedReason = 'component-unmount') {
      await hideVisible(reason)
    },

    getVisibleViewId() {
      return visibleViewId
    },

    getDebugSnapshot(): BrowserPanelLifecycleDebugSnapshot {
      return {
        visibleViewId,
        createdViewIds: Array.from(createdViewIds),
        viewState,
        tabState,
        blockedReason
      }
    }
  }
}
