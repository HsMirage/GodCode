import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'

import { BrowserShell } from '../../src/renderer/src/components/browser/BrowserShell'
import { useUIStore } from '../../src/renderer/src/store/ui.store'

vi.mock('../../src/renderer/src/components/browser/AddressBar', () => ({
  AddressBar: () => <div data-testid="address-bar" />
}))

vi.mock('../../src/renderer/src/components/browser/NavigationBar', () => ({
  NavigationBar: () => <div data-testid="navigation-bar" />
}))

vi.mock('../../src/renderer/src/components/browser/Toolbar', () => ({
  Toolbar: () => <div data-testid="toolbar" />
}))

vi.mock('../../src/renderer/src/components/browser/AIIndicator', () => ({
  AIIndicator: () => <div data-testid="ai-indicator" />
}))

describe('<BrowserShell /> lifecycle cleanup', () => {
  beforeEach(() => {
    vi.restoreAllMocks()

    useUIStore.setState({
      browserUrl: '',
      canGoBack: false,
      canGoForward: false,
      isAIOperating: false,
      isBrowserLoading: false,
      aiOperationTool: null,
      aiOperationStatus: 'idle',
      browserTabs: [
        {
          id: 'tab-1',
          title: 'Example',
          url: 'https://example.com',
          isLoading: false
        }
      ],
      activeBrowserTabId: 'tab-1',
      isBrowserPanelOpen: true,
      browserOperationHistory: [],
      browserHandoff: {
        isManualControl: false,
        viewId: null,
        lastHandoffAt: null
      }
    })

    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      }
    )

    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 10,
      y: 20,
      width: 800,
      height: 600,
      top: 20,
      right: 810,
      bottom: 620,
      left: 10,
      toJSON: () => ''
    } as DOMRect)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    Reflect.deleteProperty(window, 'codeall')
  })

  it('hides the visible browser view when component unmounts', async () => {
    const invoke = vi.fn(async (channel: string, payload?: unknown) => {
      if (channel === 'browser:list-tabs') {
        return {
          success: true,
          data: [
            {
              id: 'tab-1',
              title: 'Example',
              url: 'https://example.com',
              isLoading: false
            }
          ]
        }
      }

      if (channel === 'browser:get-state') {
        return {
          success: true,
          data: {
            url: 'https://example.com',
            canGoBack: false,
            canGoForward: false,
            isLoading: false,
            zoomLevel: 1
          }
        }
      }

      return { success: true, payload }
    })

    Object.defineProperty(window, 'codeall', {
      configurable: true,
      value: {
        invoke,
        on: vi.fn(() => () => {})
      }
    })

    const view = render(<BrowserShell />)

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith(
        'browser:show',
        expect.objectContaining({ viewId: 'tab-1' })
      )
    })

    view.unmount()

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('browser:hide', { viewId: 'tab-1' })
    })
  })
})
