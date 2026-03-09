export interface BrowserSessionCleanupPort {
  listTabs: () => Promise<Array<{ id?: string | null }>>
  hide: (viewId: string) => Promise<void> | void
  destroy: (viewId: string) => Promise<void> | void
}

export interface BrowserSessionCleanupLogger {
  debug?: (message: string, context?: Record<string, unknown>) => void
  warn?: (message: string, context?: Record<string, unknown>) => void
}

export interface BrowserSessionCleanupResult {
  cleanedViewIds: string[]
  failedViewIds: string[]
}

export async function cleanupBrowserSessionViews(
  port: BrowserSessionCleanupPort,
  logger: BrowserSessionCleanupLogger = console
): Promise<BrowserSessionCleanupResult> {
  const shouldDebug = !(process.env.NODE_ENV === 'test' || process.env.VITEST === 'true')
  const tabs = await port.listTabs()
  const viewIds = Array.from(new Set(tabs.map(tab => tab?.id).filter(Boolean) as string[]))

  if (viewIds.length === 0) {
    if (shouldDebug) {
      logger.debug?.('[BrowserPanel] no browser views to cleanup on session switch')
    }

    return {
      cleanedViewIds: [],
      failedViewIds: []
    }
  }

  if (shouldDebug) {
    logger.debug?.('[BrowserPanel] cleaning browser views on session switch', { viewIds })
  }

  const cleanedViewIds: string[] = []
  const failedViewIds: string[] = []

  for (const viewId of viewIds) {
    try {
      await port.hide(viewId)
    } catch (error) {
      logger.warn?.('[BrowserPanel] failed to hide browser view during session cleanup', {
        viewId,
        error: error instanceof Error ? error.message : String(error)
      })
    }

    try {
      await port.destroy(viewId)
      cleanedViewIds.push(viewId)
    } catch (error) {
      failedViewIds.push(viewId)
      logger.warn?.('[BrowserPanel] failed to destroy browser view during session cleanup', {
        viewId,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  return {
    cleanedViewIds,
    failedViewIds
  }
}
