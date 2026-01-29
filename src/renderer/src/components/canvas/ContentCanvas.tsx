import { BrowserViewer } from './BrowserViewer'
import { useCanvasLifecycle } from '../../hooks/useCanvasLifecycle'
import { X } from 'lucide-react'

export function ContentCanvas() {
  const { tabs, activeTab, isOpen, closeTab, setOpen } = useCanvasLifecycle()

  if (!isOpen || !activeTab) return null

  return (
    <div className="flex flex-col h-full border-l border-slate-800 bg-slate-950">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-800 bg-slate-900/50">
        <div className="flex-1 flex items-center gap-2 overflow-x-auto">
          {tabs.map(tab => (
            <div
              key={tab.id}
              className={`flex items-center gap-2 px-3 py-1.5 rounded ${
                tab.id === activeTab.id
                  ? 'bg-slate-800 text-sky-400'
                  : 'bg-slate-900/50 text-slate-400 hover:bg-slate-800/50'
              }`}
            >
              <span className="text-sm truncate max-w-[150px]">{tab.title}</span>
              <button
                type="button"
                onClick={() => closeTab(tab.id)}
                className="p-0.5 rounded hover:bg-slate-700"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="p-1.5 rounded hover:bg-slate-800"
          title="关闭"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 min-h-0">
        {activeTab.type === 'browser' && <BrowserViewer tab={activeTab} />}
      </div>
    </div>
  )
}
