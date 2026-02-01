import * as React from 'react'
import { Component, ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo)
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen flex items-center justify-center bg-slate-950 text-slate-200">
          <div className="text-center p-8 max-w-md">
            <h1 className="text-2xl font-bold text-red-400 mb-4">Something went wrong</h1>
            <p className="text-slate-400 mb-4">The application encountered an unexpected error.</p>
            <pre className="bg-slate-900 p-4 rounded text-xs text-left overflow-auto max-h-40 mb-4">
              {this.state.error?.message || 'Unknown error'}
            </pre>
            <button
              onClick={this.handleReload}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded text-white"
            >
              Reload Application
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
