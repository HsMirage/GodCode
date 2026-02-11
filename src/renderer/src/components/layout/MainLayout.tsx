import { useEffect, useMemo } from 'react'
import { useDefaultLayout } from 'react-resizable-panels'

import { Sidebar } from './Sidebar'
import { TopNavigation } from './TopNavigation'
import { BrowserPanel } from '../panels/BrowserPanel'
import { TaskPanel } from '../panels/TaskPanel'
import { ArtifactRail } from '../artifact/ArtifactRail'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '../ui/resizable'
import { UpdaterManager } from '../updater/UpdaterManager'
import { ChatPage } from '../../pages/ChatPage'
import { useUIStore } from '../../store/ui.store'
import { useDataStore } from '../../store/data.store'

export function MainLayout() {
  const {
    showSidebar,
    showArtifactRail,
    isTaskPanelOpen,
    isBrowserPanelOpen,
    openBrowserPanel,
    setActiveBrowserTab,
    setPanelSizes,
    setTaskPanelWidth,
    setBrowserPanelWidth
  } = useUIStore()
  const { currentSessionId } = useDataStore()

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
                defaultSize={15}
                minSize="160px"
                maxSize="35%"
                onResize={(size: number | { asPercentage?: number }) => {
                  const newSize = typeof size === 'number' ? size : (size.asPercentage ?? 15)
                  setPanelSizes({ sidebar: newSize })
                }}
              >
                <Sidebar />
              </ResizablePanel>
              <ResizableHandle />
            </>
          )}

          {/* Chat Panel - 主对话界面 */}
          <ResizablePanel id="chat" minSize="420px">
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
