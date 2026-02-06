import { Loader2, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react'
import { useUIStore } from '../../store/ui.store'

// Map tool names to friendly display names
const toolDisplayNames: Record<string, string> = {
  browser_navigate: '导航',
  browser_click: '点击',
  browser_fill: '输入',
  browser_snapshot: '快照',
  browser_screenshot: '截图',
  browser_extract: '提取',
  browser_hover: '悬停',
  browser_press_key: '按键',
  browser_fill_form: '填表'
}

export function AIIndicator() {
  const { isAIOperating, aiOperationTool, aiOperationStatus } = useUIStore()

  if (!isAIOperating && aiOperationStatus === 'idle') return null

  const toolName = aiOperationTool
    ? toolDisplayNames[aiOperationTool] || aiOperationTool.replace('browser_', '')
    : '操作'

  const getStatusConfig = () => {
    switch (aiOperationStatus) {
      case 'running':
        return {
          icon: Loader2,
          iconClass: 'text-indigo-400 animate-spin',
          bgClass: 'bg-indigo-500/10 border-indigo-500/30',
          textClass: 'text-indigo-300',
          message: `AI 正在${toolName}...`
        }
      case 'completed':
        return {
          icon: CheckCircle2,
          iconClass: 'text-emerald-400',
          bgClass: 'bg-emerald-500/10 border-emerald-500/30',
          textClass: 'text-emerald-300',
          message: `${toolName}完成`
        }
      case 'error':
        return {
          icon: AlertCircle,
          iconClass: 'text-rose-400',
          bgClass: 'bg-rose-500/10 border-rose-500/30',
          textClass: 'text-rose-300',
          message: `${toolName}失败`
        }
      default:
        return {
          icon: Sparkles,
          iconClass: 'text-slate-400',
          bgClass: 'bg-slate-500/10 border-slate-500/30',
          textClass: 'text-slate-300',
          message: 'AI 待命'
        }
    }
  }

  const config = getStatusConfig()
  const Icon = config.icon

  return (
    <div
      className={`flex items-center gap-2 px-3 py-1 border rounded-lg transition-all duration-300 ${config.bgClass} ${
        aiOperationStatus === 'running' ? 'animate-pulse' : ''
      }`}
    >
      <div className="relative">
        <Icon className={`w-3.5 h-3.5 ${config.iconClass}`} />
        {aiOperationStatus === 'running' && (
          <div className="absolute inset-0 bg-indigo-400/20 blur-sm rounded-full animate-pulse" />
        )}
      </div>
      <span className={`text-xs font-medium flex items-center gap-1 ${config.textClass}`}>
        <Sparkles className="w-3 h-3" />
        {config.message}
      </span>
    </div>
  )
}
