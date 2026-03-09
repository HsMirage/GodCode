import { useEffect, useMemo, useRef } from 'react'
import { useDefaultLayout } from 'react-resizable-panels'

import { Sidebar } from './Sidebar'
import { TopNavigation } from './TopNavigation'
import { BrowserPanel } from '../panels/BrowserPanel'
import { TaskPanel } from '../panels/TaskPanel'
import { ArtifactRail } from '../artifact/ArtifactRail'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '../ui/resizable'
import { SessionRecoveryPrompt } from '../session/SessionRecoveryPrompt'
import { UpdaterManager } from '../updater/UpdaterManager'
import { ChatPage } from '../../pages/ChatPage'
import { useUIStore } from '../../store/ui.store'
import { useDataStore } from '../../store/data.store'
import { cleanupBrowserSessionViews } from '../../services/browser-session-cleanup'

export function MainLayout() {
  const {
    showSidebar,
    showArtifactRail,
    isTaskPanelOpen,
    isBrowserPanelOpen,
    openBrowserPanel,
    setActiveBrowserTab,
    sidebarWidth,
    setPanelSizes,
    setTaskPanelWidth,
    setBrowserPanelWidth,
    resetBrowserWorkspace
  } = useUIStore()
  const { currentSessionId } = useDataStore()
  const previousSessionIdRef = useRef<string | null | undefined>(undefined)

  // 监听浏览器面板自动展开事件
  useEffect(() => {
    if (!window.codeall) return

    const removeListener = window.codeall.on('browser:panel-show', () => {
      openBrowserPanel()
    })

    const removeAIListener = window.codeall.on('browser:ai-operation', data => {
      // Make sure panel opens and AI-controlled view is focused even if BrowserShell isn't mounted yet.
      openBrowserPanel()
      if (data.viewId) setActiveBrowserTab(data.viewId)
    })

    return () => {
      removeListener()
      removeAIListener()
    }
  }, [openBrowserPanel, setActiveBrowserTab])

  useEffect(() => {
    const previousSessionId = previousSessionIdRef.current
    previousSessionIdRef.current = currentSessionId

    if (previousSessionId === undefined || previousSessionId === currentSessionId) {
      return
    }

    resetBrowserWorkspace({ closePanel: true })

    if (!window.codeall) {
      return
    }

    void cleanupBrowserSessionViews(
      {
        listTabs: async () => {
          const result = (await window.codeall.invoke('browser:list-tabs')) as {
            success?: boolean
            data?: Array<{ id: string }>
          }

          return result?.success ? result.data ?? [] : []
        },
        hide: async viewId => {
          await window.codeall.invoke('browser:hide', { viewId })
        },
        destroy: async viewId => {
          await window.codeall.invoke('browser:destroy', { viewId })
        }
      },
      console
    ).catch(error => {
      console.warn('[MainLayout] browser workspace cleanup failed', {
        previousSessionId,
        currentSessionId,
        error: error instanceof Error ? error.message : String(error)
      })
    })
  }, [currentSessionId, resetBrowserWorkspace])

  // Panels are conditionally mounted; panelIds must match rendered panels
  const outerPanelIds = useMemo(
    () => [
      ...(showSidebar ? ['sidebar'] : []),
      'chat',
      ...(showArtifactRail ? ['artifact'] : []),
      ...(isTaskPanelOpen ? ['task'] : []),
      ...(isBrowserPanelOpen ? ['browser'] : [])
    ],
    [showSidebar, showArtifactRail, isTaskPanelOpen, isBrowserPanelOpen]
  )

  const outerLayout = useDefaultLayout({
    id: 'main-layout:outer',
    panelIds: outerPanelIds
  })

  return (
    <div className="h-screen flex flex-col ui-bg-app ui-text-primary overflow-hidden">
      <UpdaterManager />
      <SessionRecoveryPrompt />
      <TopNavigation />

      <div className="flex-1 flex overflow-hidden relative">
        <ResizablePanelGroup
          id="main-layout-outer"
          orientation="horizontal"
          defaultLayout={outerLayout.defaultLayout}
          onLayoutChanged={outerLayout.onLayoutChanged}
        >
          {/* Sidebar - 空间/会话列表 */}
          {showSidebar && (
            <>
              <ResizablePanel
                id="sidebar"
                defaultSize={sidebarWidth}
                minSize="240px"
                maxSize="35%"
                onResize={(size: number | { asPercentage?: number }) => {
                  const newSize = typeof size === 'number' ? size : (size.asPercentage ?? sidebarWidth)
                  setPanelSizes({ sidebar: newSize })
                }}
              >
                <Sidebar />
              </ResizablePanel>
              <ResizableHandle />
            </>
          )}

          {/* Chat Panel - 主对话界面 */}
          <ResizablePanel id="chat" minSize="380px">
            <ChatPage />
          </ResizablePanel>

          {showArtifactRail && (
            <>
              <ResizableHandle withHandle />
              <ResizablePanel
                id="artifact"
                minSize="260px"
                maxSize="40%"
                defaultSize={20}
                onResize={(size: number | { asPercentage?: number }) => {
                  const newSize = typeof size === 'number' ? size : (size.asPercentage ?? 20)
                  setPanelSizes({ artifact: newSize })
                }}
              >
                <ArtifactRail sessionId={currentSessionId} className="h-full ui-bg-panel" />
              </ResizablePanel>
            </>
          )}

          {/* Task Panel - 后台任务（独立占据一列） */}
          {isTaskPanelOpen && (
            <>
              <ResizableHandle withHandle />
              <ResizablePanel
                id="task"
                minSize="260px"
                maxSize="40%"
                defaultSize={25}
                onResize={(size: number | { asPercentage?: number }) => {
                  const newSize = typeof size === 'number' ? size : (size.asPercentage ?? 25)
                  setTaskPanelWidth(newSize)
                }}
              >
                <TaskPanel />
              </ResizablePanel>
            </>
          )}

          {/* Browser Panel - 浏览器始终在最右侧，独立占据一列 */}
          {isBrowserPanelOpen && (
            <>
              <ResizableHandle withHandle />
              <ResizablePanel
                id="browser"
                minSize="360px"
                maxSize="60%"
                defaultSize={35}
                onResize={(size: number | { asPercentage?: number }) => {
                  const newSize = typeof size === 'number' ? size : (size.asPercentage ?? 35)
                  setBrowserPanelWidth(newSize)
                }}
              >
                <BrowserPanel />
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </div>
    </div>
  )
}
