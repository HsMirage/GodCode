import { useState } from 'react'
import { MessageSquare, Settings, Plus } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { SpaceList } from './sidebar/SpaceList'
import { SpaceCreateDialog } from './sidebar/SpaceCreateDialog'

const navItems = [
  {
    label: '对话',
    to: '/',
    icon: MessageSquare
  },
  {
    label: '设置',
    to: '/settings',
    icon: Settings
  }
]

export function Sidebar() {
  const location = useLocation()
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [spaceListKey, setSpaceListKey] = useState(0)

  return (
    <aside className="fixed inset-y-0 left-0 w-60 border-r border-slate-800/70 bg-slate-950/80 text-slate-100 backdrop-blur">
      <div className="flex h-full flex-col px-4 py-5">
        <div className="flex items-center gap-3 px-2 pb-5">
          <div className="h-9 w-9 rounded-xl border border-slate-800/80 bg-gradient-to-br from-slate-900 via-slate-950 to-black shadow-[0_0_20px_rgba(15,23,42,0.4)]" />
          <div>
            <div className="text-sm uppercase tracking-[0.32em] text-slate-500">CodeAll</div>
            <div className="text-xs text-slate-400">Workspace</div>
          </div>
        </div>

        <div className="mb-4 space-y-2">
          <div className="flex items-center justify-between px-2 mb-2">
            <span className="text-xs uppercase tracking-wider text-slate-500">Workspace</span>
            <button
              onClick={() => setIsCreateDialogOpen(true)}
              className="p-1 rounded-md hover:bg-slate-800/50 transition-colors"
              title="Create New Space"
              type="button"
            >
              <Plus className="h-3.5 w-3.5 text-slate-400" />
            </button>
          </div>
          <SpaceList key={spaceListKey} />
        </div>

        <nav className="flex flex-col gap-2">
          {navItems.map(item => {
            const isActive = location.pathname === item.to
            const Icon = item.icon

            return (
              <Link
                key={item.to}
                to={item.to}
                className={`group flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${
                  isActive
                    ? 'bg-slate-900/80 text-slate-100 shadow-[0_0_18px_rgba(56,189,248,0.12)]'
                    : 'text-slate-300 hover:bg-slate-900/50 hover:text-slate-100'
                }`}
              >
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-lg border transition ${
                    isActive
                      ? 'border-sky-500/30 bg-slate-950 text-sky-300'
                      : 'border-slate-800/70 bg-slate-950/60 text-slate-400 group-hover:text-slate-200'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="tracking-wide">{item.label}</span>
              </Link>
            )
          })}
        </nav>

        <div className="mt-auto rounded-2xl border border-slate-900/70 bg-gradient-to-br from-slate-950 via-slate-900/70 to-slate-950 px-3 py-4 text-xs text-slate-400">
          <div className="text-[11px] uppercase tracking-[0.26em] text-slate-500">Halo</div>
          <p className="mt-2 text-[11px] leading-relaxed">沉浸式工作流，专注对话与配置。</p>
        </div>
        <SpaceCreateDialog
          isOpen={isCreateDialogOpen}
          onClose={() => setIsCreateDialogOpen(false)}
          onSuccess={() => {
            setSpaceListKey(prev => prev + 1)
          }}
        />
      </div>
    </aside>
  )
}
