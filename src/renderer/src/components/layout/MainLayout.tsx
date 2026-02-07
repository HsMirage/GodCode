import { useEffect, useMemo } from 'react'
import { useDefaultLayout } from 'react-resizable-panels'

import { Sidebar } from './Sidebar'
import { TopNavigation } from './TopNavigation'
import { BrowserPanel } from '../panels/BrowserPanel'
import { TaskPanel } from '../panels/TaskPanel'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '../ui/resizable'
import { UpdaterManager } from '../updater/UpdaterManager'
import { ChatPage } from '../../pages/ChatPage'
import { useUIStore } from '../../store/ui.store'

export function MainLayout() {
  const {
    showSidebar,
    isTaskPanelOpen,
    isBrowserPanelOpen,
    openBrowserPanel,
    setPanelSizes,
    setTaskPanelWidth,
    setBrowserPanelWidth
  } = useUIStore()

  // 监听浏览器面板自动展开事件
  useEffect(() => {
    if (!window.codeall) return

    const removeListener = window.codeall.on('browser:panel-show', () => {
      openBrowserPanel()
    })

    return () => removeListener()
  }, [openBrowserPanel])

  // Panels are conditionally mounted; panelIds must match rendered panels
  const outerPanelIds = useMemo(
    () => [
      ...(showSidebar ? ['sidebar'] : []),
      'chat',
      ...(isTaskPanelOpen ? ['task'] : []),
      ...(isBrowserPanelOpen ? ['browser'] : [])
    ],
    [showSidebar, isTaskPanelOpen, isBrowserPanelOpen]
  )

  const outerLayout = useDefaultLayout({
    id: 'main-layout:outer',
    panelIds: outerPanelIds
  })

  return (
    <div className="h-screen flex flex-col bg-slate-950 text-slate-200 overflow-hidden">
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
          <ResizablePanel id="chat" minSize="320px">
            <ChatPage />
          </ResizablePanel>

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
