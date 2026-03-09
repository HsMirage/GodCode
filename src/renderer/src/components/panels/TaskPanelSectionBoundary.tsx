import { AlertCircle } from 'lucide-react'
import { Component, type ErrorInfo, type ReactNode } from 'react'

interface TaskPanelSectionBoundaryProps {
  title: string
  children: ReactNode
  resetKey?: string | number | null
}

interface TaskPanelSectionBoundaryState {
  error: Error | null
}

export class TaskPanelSectionBoundary extends Component<
  TaskPanelSectionBoundaryProps,
  TaskPanelSectionBoundaryState
> {
  state: TaskPanelSectionBoundaryState = {
    error: null
  }

  static getDerivedStateFromError(error: Error): TaskPanelSectionBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[TaskPanelSectionBoundary] ${this.props.title} render failed:`, error, errorInfo)
  }

  componentDidUpdate(prevProps: TaskPanelSectionBoundaryProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null })
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-4 text-sm text-rose-200">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{this.props.title} 渲染失败</p>
              <p className="mt-1 text-xs text-rose-200/80 break-words">
                {this.state.error.message || 'Unknown error'}
              </p>
              <button
                type="button"
                onClick={() => this.setState({ error: null })}
                className="mt-3 rounded-md border border-rose-400/30 bg-rose-500/10 px-2 py-1 text-xs text-rose-100 hover:bg-rose-500/20"
              >
                重试渲染
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
