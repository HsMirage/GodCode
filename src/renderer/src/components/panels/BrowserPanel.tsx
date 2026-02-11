/**
 * BrowserPanel - 浏览器预览面板
 * 包装 BrowserShell，添加面板头部和关闭按钮
 */

import { X, Globe } from 'lucide-react'
import { useUIStore } from '../../store/ui.store'
import { BrowserShell } from '../browser/BrowserShell'

export function BrowserPanel() {
  const { closeBrowserPanel, isAIOperating } = useUIStore()

  return (
    <div className="h-full flex flex-col ui-bg-panel border-l ui-border">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b ui-border bg-[var(--bg-tertiary)]">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-[var(--text-secondary)]" />
          <h2 className="text-sm font-medium text-[var(--text-primary)]">浏览器预览</h2>
          {isAIOperating && (
            <span className="text-xs bg-sky-500/20 text-sky-400 px-1.5 py-0.5 rounded animate-pulse">
              AI 操作中
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={closeBrowserPanel}
          className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors"
          title="关闭"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Browser Content */}
      <div className="flex-1 overflow-hidden">
        <BrowserShell />
      </div>
    </div>
  )
}
