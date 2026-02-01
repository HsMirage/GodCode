import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { browserViewManager } from '../../src/main/services/browser-view.service'

vi.mock('electron', () => {
  return {
    BrowserView: vi.fn(() => ({
      webContents: {
        loadURL: vi.fn().mockResolvedValue(undefined),
        executeJavaScript: vi.fn().mockResolvedValue(undefined),
        setUserAgent: vi.fn(),
        on: vi.fn(),
        setWindowOpenHandler: vi.fn(),
        destroy: vi.fn(),
        closeDevTools: vi.fn(),
        isDestroyed: vi.fn().mockReturnValue(false),
        canGoBack: vi.fn().mockReturnValue(false),
        canGoForward: vi.fn().mockReturnValue(false),
        goBack: vi.fn(),
        goForward: vi.fn(),
        reload: vi.fn(),
        stop: vi.fn(),
        capturePage: vi.fn().mockResolvedValue({ toDataURL: () => 'data:image/png;base64,' }),
        setZoomFactor: vi.fn()
      },
      setBounds: vi.fn(),
      setAutoResize: vi.fn(),
      setBackgroundColor: vi.fn()
    })),
    BrowserWindow: {
      getFocusedWindow: vi.fn()
    }
  }
})

function getMemoryMB(): number {
  const usage = process.memoryUsage()
  return Math.round(usage.heapUsed / 1024 / 1024)
}

function forceGC(): void {
  if (global.gc) {
    global.gc()
  }
}

describe('Performance: Browser Resources', () => {
  const mainWindowMock = {
    on: vi.fn(),
    addBrowserView: vi.fn(),
    removeBrowserView: vi.fn(),
    isDestroyed: vi.fn().mockReturnValue(false),
    webContents: {
      send: vi.fn()
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    browserViewManager.initialize(mainWindowMock as any)
  })

  afterEach(() => {
    browserViewManager.destroyAll()
    forceGC()
  })

  test('creates and destroys multiple BrowserViews without memory leak', async () => {
    forceGC()
    const startMemory = getMemoryMB()

    for (let i = 0; i < 10; i++) {
      const viewId = `view-perf-${i}`
      await browserViewManager.create(viewId, 'https://example.com')
      browserViewManager.destroy(viewId)
    }

    forceGC()
    const endMemory = getMemoryMB()
    const memoryDelta = endMemory - startMemory

    console.log(`
=== BrowserView Create/Destroy Cycle ===
Iterations: 10
Start Memory: ${startMemory}MB
End Memory: ${endMemory}MB
Memory Delta: ${memoryDelta}MB
`)

    expect(memoryDelta).toBeLessThan(50)
  })

  test('enforces maximum tab limit (FIFO eviction)', async () => {
    const maxTabs = 5

    for (let i = 1; i <= maxTabs + 2; i++) {
      await browserViewManager.create(`limit-view-${i}`)
    }

    const oldestRemoved = browserViewManager.getState('limit-view-1')
    const secondOldestRemoved = browserViewManager.getState('limit-view-2')

    expect(oldestRemoved).toBeNull()
    expect(secondOldestRemoved).toBeNull()

    let activeCount = 0
    for (let i = 1; i <= maxTabs + 2; i++) {
      if (browserViewManager.getState(`limit-view-${i}`)) {
        activeCount++
      }
    }

    console.log(`
=== Tab Limit Enforcement ===
Max tabs: ${maxTabs}
Created: ${maxTabs + 2}
Active: ${activeCount}
Evicted: ${maxTabs + 2 - activeCount}
`)

    expect(activeCount).toBe(maxTabs)
  })

  test('handles rapid tab creation and destruction', async () => {
    const startTime = Date.now()
    const iterations = 20

    for (let i = 0; i < iterations; i++) {
      const viewId = `rapid-${i}`
      await browserViewManager.create(viewId)

      if (i % 3 === 0) {
        browserViewManager.destroy(viewId)
      }
    }

    const duration = Date.now() - startTime

    console.log(`
=== Rapid Tab Operations ===
Iterations: ${iterations}
Duration: ${duration}ms
Ops/sec: ${Math.round(iterations / (duration / 1000))}
`)

    expect(duration).toBeLessThan(5000)
  })

  test('manages concurrent navigation requests', async () => {
    const viewCount = 3
    const viewIds: string[] = []

    for (let i = 0; i < viewCount; i++) {
      const viewId = `nav-view-${i}`
      viewIds.push(viewId)
      await browserViewManager.create(viewId)
    }

    const urls = ['https://google.com', 'https://github.com', 'https://stackoverflow.com']

    const startTime = Date.now()

    const navPromises = viewIds.map((viewId, idx) =>
      browserViewManager.navigate(viewId, urls[idx % urls.length])
    )

    const results = await Promise.all(navPromises)
    const duration = Date.now() - startTime

    console.log(`
=== Concurrent Navigation ===
Views: ${viewCount}
Duration: ${duration}ms
All succeeded: ${results.every(r => r)}
`)

    expect(results.every(r => r)).toBe(true)
    expect(duration).toBeLessThan(2000)
  })

  test('measures memory footprint of multiple active views', async () => {
    forceGC()
    const baseline = getMemoryMB()
    const memoryPerView: number[] = []

    for (let i = 0; i < 5; i++) {
      await browserViewManager.create(`mem-view-${i}`, 'https://example.com')
      forceGC()
      memoryPerView.push(getMemoryMB() - baseline)
    }

    const avgMemoryPerView = memoryPerView.reduce((a, b) => a + b, 0) / memoryPerView.length

    console.log(`
=== Memory Per View ===
Baseline: ${baseline}MB
Memory readings: ${memoryPerView.join(', ')}MB
Average per view: ${avgMemoryPerView.toFixed(2)}MB
`)

    expect(avgMemoryPerView).toBeLessThan(20)
  })

  test('cleanup releases resources properly', async () => {
    for (let i = 0; i < 5; i++) {
      await browserViewManager.create(`cleanup-view-${i}`)
    }

    forceGC()
    const beforeCleanup = getMemoryMB()

    browserViewManager.destroyAll()

    forceGC()
    const afterCleanup = getMemoryMB()

    console.log(`
=== Cleanup Resource Release ===
Before cleanup: ${beforeCleanup}MB
After cleanup: ${afterCleanup}MB
Memory freed: ${beforeCleanup - afterCleanup}MB
`)

    let remainingViews = 0
    for (let i = 0; i < 5; i++) {
      if (browserViewManager.getState(`cleanup-view-${i}`)) {
        remainingViews++
      }
    }

    expect(remainingViews).toBe(0)
  })

  test('show/hide operations do not leak memory', async () => {
    const viewId = 'toggle-view'
    await browserViewManager.create(viewId)

    forceGC()
    const startMemory = getMemoryMB()
    const bounds = { x: 0, y: 0, width: 800, height: 600 }

    for (let i = 0; i < 50; i++) {
      browserViewManager.show(viewId, bounds)
      browserViewManager.hide(viewId)
    }

    forceGC()
    const endMemory = getMemoryMB()

    console.log(`
=== Show/Hide Toggle Test ===
Iterations: 50
Start Memory: ${startMemory}MB
End Memory: ${endMemory}MB
Memory Delta: ${endMemory - startMemory}MB
`)

    expect(endMemory - startMemory).toBeLessThan(20)
  })
})
