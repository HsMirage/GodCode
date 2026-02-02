import { Group, Panel, Separator } from 'react-resizable-panels'
import { Sidebar } from './Sidebar'
import { ChatPage } from '../../pages/ChatPage'
import { ArtifactRail } from '../artifact/ArtifactRail'
import { ContentCanvas } from '../canvas/ContentCanvas'
import { TopNavigation } from './TopNavigation'
import { useUIStore } from '../../store/ui.store'
import { PanelRight, PanelBottom } from 'lucide-react'
import { UpdaterManager } from '../updater/UpdaterManager'

export function MainLayout() {
  const { showSidebar, showArtifactRail, showContentCanvas, setView } = useUIStore()

  return (
    <div className="h-screen flex flex-col bg-slate-950 text-slate-200 overflow-hidden">
      <UpdaterManager />
      <TopNavigation />

      <div className="flex-1 flex overflow-hidden relative">
        <Group orientation="horizontal">
          {showSidebar && (
            <>
              <Panel defaultSize={20} minSize={15} maxSize={30} id="sidebar">
                <Sidebar />
              </Panel>
              <Separator className="w-1 bg-slate-800 hover:bg-indigo-500 transition-colors" />
            </>
          )}

          <Panel defaultSize={60} id="chat">
            <ChatPage />
          </Panel>

          {(showArtifactRail || showContentCanvas) && (
            <Separator className="w-1 bg-slate-800 hover:bg-indigo-500 transition-colors" />
          )}

          {showArtifactRail && (
            <Panel defaultSize={25} minSize={20} id="artifact">
              <ArtifactRail />
            </Panel>
          )}

          {showContentCanvas && (
            <Panel defaultSize={40} minSize={30} id="canvas">
              <ContentCanvas />
            </Panel>
          )}
        </Group>

        <div className="absolute bottom-4 right-4 flex gap-2">
          {!showArtifactRail && !showContentCanvas && (
            <div className="flex gap-2 bg-slate-900 border border-slate-700 rounded-lg p-1 shadow-xl">
              <button
                type="button"
                onClick={() => setView('artifact')}
                className="p-2 hover:bg-slate-800 rounded text-slate-400 hover:text-indigo-400"
                title="Open Artifacts"
              >
                <PanelRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setView('canvas')}
                className="p-2 hover:bg-slate-800 rounded text-slate-400 hover:text-indigo-400"
                title="Open Preview"
              >
                <PanelBottom className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
