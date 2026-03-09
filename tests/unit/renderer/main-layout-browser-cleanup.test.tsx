import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, waitFor } from '@testing-library/react'

import { MainLayout } from '../../../src/renderer/src/components/layout/MainLayout'
import { useUIStore } from '../../../src/renderer/src/store/ui.store'
import { useDataStore } from '../../../src/renderer/src/store/data.store'

vi.mock('react-resizable-panels', () => ({
  useDefaultLayout: () => ({ defaultLayout: [], onLayoutChanged: vi.fn() })
}))

vi.mock('../../../src/renderer/src/components/layout/Sidebar', () => ({
  Sidebar: () => <div data-testid="sidebar" />
}))

vi.mock('../../../src/renderer/src/components/layout/TopNavigation', () => ({
  TopNavigation: () => <div data-testid="top-nav" />
}))

vi.mock('../../../src/renderer/src/components/panels/BrowserPanel', () => ({
  BrowserPanel: () => <div data-testid="browser-panel" />
}))

vi.mock('../../../src/renderer/src/components/panels/TaskPanel', () => ({
  TaskPanel: () => <div data-testid="task-panel" />
}))

vi.mock('../../../src/renderer/src/components/artifact/ArtifactRail', () => ({
  ArtifactRail: () => <div data-testid="artifact-rail" />
}))

vi.mock('../../../src/renderer/src/components/session/SessionRecoveryPrompt', () => ({
  SessionRecoveryPrompt: () => <div data-testid="session-recovery" />
}))

vi.mock('../../../src/renderer/src/components/updater/UpdaterManager', () => ({
  UpdaterManager: () => null
}))

vi.mock('../../../src/renderer/src/pages/ChatPage', () => ({
  ChatPage: () => <div data-testid="chat-page" />
}))

vi.mock('../../../src/renderer/src/components/ui/resizable', () => ({
  ResizablePanelGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ResizablePanel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ResizableHandle: () => <div data-testid="resize-handle" />
}))

describe('<MainLayout /> browser cleanup', () => {
  beforeEach(() => {
    localStorage.removeItem('codeall-ui-storage')
    vi.restoreAllMocks()

    useUIStore.setState({
      showSidebar: false,
      showArtifactRail: false,
      isTaskPanelOpen: false,
      isBrowserPanelOpen: true,
      browserTabs: [{ id: 'view-1', title: 'One', url: 'https://one.test', isLoading: false }],
      activeBrowserTabId: 'view-1',
      browserUrl: 'https://one.test',
      canGoBack: true,
      canGoForward: true,
      isAIOperating: true,
      aiOperationTool: 'browser_navigate',
      aiOperationStatus: 'running'
    })

    useDataStore.setState({
      currentSpaceId: 'space-1',
      currentSessionId: 'session-1'
    })
  })

  it('destroys existing browser views and resets browser state when session changes', async () => {
    const invoke = vi.fn(async (channel: string, payload?: { viewId?: string }) => {
      if (channel === 'browser:list-tabs') {
        return {
          success: true,
          data: [{ id: 'view-1' }, { id: 'session-session-1' }]
        }
      }

      if (channel === 'browser:hide' || channel === 'browser:destroy') {
        return { success: true, data: payload?.viewId }
      }

      return { success: true }
    })

    Object.defineProperty(window, 'codeall', {
      configurable: true,
      value: {
        invoke,
        on: vi.fn(() => () => {})
      }
    })

    render(<MainLayout />)

    await act(async () => {
      useDataStore.setState({ currentSessionId: 'session-2' })
    })

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('browser:list-tabs')
    })

    expect(invoke).toHaveBeenCalledWith('browser:hide', { viewId: 'view-1' })
    expect(invoke).toHaveBeenCalledWith('browser:destroy', { viewId: 'view-1' })
    expect(invoke).toHaveBeenCalledWith('browser:hide', { viewId: 'session-session-1' })
    expect(invoke).toHaveBeenCalledWith('browser:destroy', { viewId: 'session-session-1' })

    await waitFor(() => {
      expect(useUIStore.getState().browserTabs).toEqual([])
    })

    expect(useUIStore.getState().activeBrowserTabId).toBeNull()
    expect(useUIStore.getState().browserUrl).toBe('')
    expect(useUIStore.getState().isBrowserPanelOpen).toBe(false)
    expect(useUIStore.getState().aiOperationStatus).toBe('idle')
   })
 })
