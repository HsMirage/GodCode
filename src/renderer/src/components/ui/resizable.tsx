import * as React from 'react'
import { GripVertical } from 'lucide-react'
import { Group, Panel, Separator } from 'react-resizable-panels'

import { cn } from '../../utils'

/**
 * ResizablePanelGroup - 可调整大小的面板组容器
 *
 * 注意：react-resizable-panels v4+ 内部会自动设置必要的 flex 样式。
 */
function ResizablePanelGroup({
  className,
  ...props
}: React.ComponentProps<typeof Group>) {
  return <Group className={cn('h-full w-full', className)} {...props} />
}

/**
 * ResizablePanel - 可调整大小的面板
 */
function ResizablePanel({
  className,
  ...props
}: React.ComponentProps<typeof Panel>) {
  // Ensure children can reliably use h-full/min-h-0 to create internal scroll areas.
  // Without an explicit height, nested flex+overflow layouts can collapse on small windows.
  return <Panel className={cn('overflow-hidden h-full min-h-0', className)} {...props} />
}

/**
 * ResizableHandle - 拖拽手柄
 *
 * 特点：
 * - 通过 after 伪元素扩大点击/拖拽区域
 * - 支持 withHandle 显示抓手图标
 */
function ResizableHandle({
  withHandle,
  orientation = 'horizontal',
  className,
  ...props
}: React.ComponentProps<typeof Separator> & {
  withHandle?: boolean
  orientation?: 'horizontal' | 'vertical'
}) {
  const isHorizontal = orientation === 'horizontal'

  return (
    <Separator
      className={cn(
        'relative flex items-center justify-center transition-colors duration-150',
        isHorizontal
          ? 'w-px bg-[var(--border-primary)] cursor-col-resize'
          : 'h-px bg-[var(--border-primary)] cursor-row-resize',
        'hover:bg-indigo-500 data-[resize-handle-active]:bg-indigo-600',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500',
        isHorizontal
          ? 'after:absolute after:inset-y-0 after:left-1/2 after:w-3 after:-translate-x-1/2'
          : 'after:absolute after:inset-x-0 after:top-1/2 after:h-3 after:-translate-y-1/2',
        className
      )}
      {...props}
    >
      {withHandle && (
        <div className="z-10 flex h-6 w-4 items-center justify-center rounded-sm bg-[var(--bg-tertiary)] border border-[var(--border-secondary)] shadow-sm">
          <GripVertical className="h-3 w-3 text-[var(--text-secondary)]" />
        </div>
      )}
    </Separator>
  )
}

export { ResizablePanelGroup, ResizablePanel, ResizableHandle }
