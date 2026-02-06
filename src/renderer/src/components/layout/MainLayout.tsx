import { useEffect } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import { Sidebar } from './Sidebar'
import { ChatPage } from '../../pages/ChatPage'
import { TaskPanel } from '../panels/TaskPanel'
import { BrowserPanel } from '../panels/BrowserPanel'
import { TopNavigation } from './TopNavigation'
import { useUIStore } from '../../store/ui.store'
import { ListTodo, Globe } from 'lucide-react'
import { UpdaterManager } from '../updater/UpdaterManager'

export function MainLayout() {
  const {
    showSidebar,
    sidebarWidth,
    isTaskPanelOpen,
    isBrowserPanelOpen,
    taskPanelWidth,
    browserPanelWidth,
    toggleTaskPanel,
    toggleBrowserPanel,
    openBrowserPanel,
    setTaskPanelWidth,
    setBrowserPanelWidth,
    setPanelSizes
  } = useUIStore()

  // 监听浏览器面板自动展开事件
  useEffect(() => {
    if (!window.codeall) return

    const removeListener = window.codeall.on('browser:panel-show', () => {
      openBrowserPanel()
    })

    return () => {
      removeListener()
    }
  }, [openBrowserPanel])

  return (
    <div className="h-screen flex flex-col bg-slate-950 text-slate-200 overflow-hidden">
      <UpdaterManager />
      <TopNavigation />

      <div className="flex-1 flex overflow-hidden relative">
        <Group orientation="horizontal">
          {/* Sidebar - 会话列表 */}
          {showSidebar && (
            <>
              <Panel
                defaultSize={sidebarWidth}
                minSize={15}
                maxSize={25}
                id="sidebar"
                onResize={(size: any) => {
                  // Cast to number because we know it returns percentage in this context
                  const newSize = typeof size === 'number' ? size : (size.asPercentage ?? 20)
                  setPanelSizes({ sidebar: newSize })
                }}
              >
                <Sidebar />
              </Panel>
              <Separator className="w-1 bg-slate-800 hover:bg-indigo-500 transition-colors" />
            </>
          )}

          {/* Chat Panel - 主对话界面 */}
          <Panel id="chat">
            <ChatPage />
          </Panel>

          {/* Task Panel - 后台任务 (手动展开) */}
          {isTaskPanelOpen && (
            <>
              <Separator className="w-1 bg-slate-800 hover:bg-indigo-500 transition-colors" />
              <Panel
                defaultSize={taskPanelWidth}
                minSize={18}
                maxSize={35}
                id="task"
                onResize={(size: any) => {
                  const newSize = typeof size === 'number' ? size : (size.asPercentage ?? 25)
                  setTaskPanelWidth(newSize)
                }}
              >
                <TaskPanel />
              </Panel>
            </>
          )}

          {/* Browser Panel - 浏览器预览 (自动展开) */}
          {isBrowserPanelOpen && (
            <>
              <Separator className="w-1 bg-slate-800 hover:bg-indigo-500 transition-colors" />
              <Panel
                defaultSize={browserPanelWidth}
                minSize={25}
                maxSize={50}
                id="browser"
                onResize={(size: any) => {
                  const newSize = typeof size === 'number' ? size : (size.asPercentage ?? 35)
                  setBrowserPanelWidth(newSize)
                }}
              >
                <BrowserPanel />
              </Panel>
            </>
          )}
        </Group>

        {/* Floating Action Buttons */}
        <div className="absolute bottom-4 right-4 flex gap-2">
          <div className="flex gap-2 bg-slate-900 border border-slate-700 rounded-lg p-1 shadow-xl">
            {/* Task Panel Toggle */}
            <button
              type="button"
              onClick={toggleTaskPanel}
              className={[
                'p-2 rounded transition-colors',
                isTaskPanelOpen
                  ? 'bg-indigo-600 text-white'
                  : 'hover:bg-slate-800 text-slate-400 hover:text-indigo-400'
              ].join(' ')}
              title={isTaskPanelOpen ? '关闭任务面板' : '打开任务面板'}
            >
              <ListTodo className="w-4 h-4" />
            </button>

            {/* Browser Panel Toggle */}
            <button
              type="button"
              onClick={toggleBrowserPanel}
              className={[
                'p-2 rounded transition-colors',
                isBrowserPanelOpen
                  ? 'bg-indigo-600 text-white'
                  : 'hover:bg-slate-800 text-slate-400 hover:text-indigo-400'
              ].join(' ')}
              title={isBrowserPanelOpen ? '关闭浏览器' : '打开浏览器'}
            >
              <Globe className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
