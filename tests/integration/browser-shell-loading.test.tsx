import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

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

describe('<BrowserShell /> loading overlay', () => {
  beforeEach(() => {
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
          title: '示例页面',
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

    Object.defineProperty(window, 'codeall', {
      configurable: true,
      value: {
        invoke: vi.fn(async (channel: string) => {
          if (channel === 'browser:list-tabs') {
            return { success: true, data: useUIStore.getState().browserTabs }
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
          return { success: true }
        }),
        on: vi.fn(() => () => {})
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

  it('hides the loading overlay once the active tab is ready', () => {
    render(<BrowserShell />)

    expect(screen.queryByText('浏览器视图加载中…')).not.toBeInTheDocument()
    expect(screen.queryByText('暂无标签页')).not.toBeInTheDocument()
  })
})
