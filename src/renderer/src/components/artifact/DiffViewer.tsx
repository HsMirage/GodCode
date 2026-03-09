/**
 * DiffViewer - Diff 查看弹窗
 * 显示文件变更的对比视图
 */

import { useState, useEffect } from 'react'
import { X, Loader2, FileCode } from 'lucide-react'

interface DiffViewerProps {
  artifactId: string
  filePath: string
  onClose: () => void
}

export function DiffViewer({ artifactId, filePath, onClose }: DiffViewerProps) {
  const [diff, setDiff] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadDiff = async () => {
      if (!window.godcode) {
        setError('IPC not available')
        setLoading(false)
        return
      }

      try {
        const diffContent = await window.godcode.invoke('artifact:get-diff', artifactId)
        setDiff(diffContent as string | null)
      } catch (err) {
        setError((err as Error).message)
      } finally {
        setLoading(false)
      }
    }

    loadDiff()
  }, [artifactId])

  const renderDiffLine = (line: string, index: number) => {
    let bgColor = ''
    let textColor = 'text-slate-300'

    if (line.startsWith('+') && !line.startsWith('+++')) {
      bgColor = 'bg-emerald-950/50'
      textColor = 'text-emerald-300'
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      bgColor = 'bg-rose-950/50'
      textColor = 'text-rose-300'
    } else if (line.startsWith('@@')) {
      bgColor = 'bg-sky-950/50'
      textColor = 'text-sky-300'
    }

    return (
      <div key={index} className={`${bgColor} ${textColor} font-mono text-xs px-2 py-0.5`}>
        {line || ' '}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-[800px] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <FileCode className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-medium text-slate-200">{filePath}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-slate-500 animate-spin" />
            </div>
          ) : error ? (
            <div className="text-center py-12 text-rose-400">{error}</div>
          ) : diff ? (
            <div className="rounded-lg border border-slate-800 overflow-hidden">
              {diff.split('\n').map((line, index) => renderDiffLine(line, index))}
            </div>
          ) : (
            <div className="text-center py-12 text-slate-500">暂无 Diff 内容</div>
          )}
        </div>
      </div>
    </div>
  )
}
