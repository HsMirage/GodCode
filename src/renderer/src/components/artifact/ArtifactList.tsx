/**
 * ArtifactList - 产物列表组件
 * 显示 Agent 产生的文件变更列表
 */

import { useState, useEffect, useCallback } from 'react'
import {
  FileCode,
  FilePlus,
  FileEdit,
  FileX,
  Check,
  Undo2,
  Eye,
  RefreshCw,
  Loader2,
  Link2
} from 'lucide-react'
import type { Artifact } from '@/types/domain'
import { useTraceNavigationStore } from '../../store/trace-navigation.store'

type IpcActionResult = { success: boolean; error?: string }

type SpaceResponse =
  | {
      success: boolean
      data?: {
        workDir?: string
      }
      error?: string
    }
  | {
      workDir?: string
    }

interface ArtifactListProps {
  sessionId: string | null
  onViewDiff?: (artifactId: string, path: string) => void
  onOpenFile?: (artifactId: string, path: string) => void
}

const changeTypeConfig = {
  created: {
    icon: FilePlus,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/20',
    label: '新建'
  },
  modified: {
    icon: FileEdit,
    color: 'text-amber-400',
    bg: 'bg-amber-500/20',
    label: '修改'
  },
  deleted: {
    icon: FileX,
    color: 'text-rose-400',
    bg: 'bg-rose-500/20',
    label: '删除'
  }
}

export function ArtifactList({ sessionId, onViewDiff, onOpenFile }: ArtifactListProps) {
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const requestNavigate = useTraceNavigationStore(state => state.requestNavigate)

  const loadArtifacts = useCallback(async () => {
    if (!window.codeall || !sessionId) {
      setLoading(false)
      return
    }

    try {
      const list = (await window.codeall.invoke('artifact:list', { sessionId })) as Artifact[]
      setArtifacts(list)
    } catch (error) {
      console.error('Failed to load artifacts:', error)
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  useEffect(() => {
    loadArtifacts()
  }, [loadArtifacts])

  // 监听新产物创建事件
  useEffect(() => {
    if (!window.codeall) return

    const removeListener = window.codeall.on('artifact:created', () => {
      loadArtifacts()
    })

    return () => {
      removeListener()
    }
  }, [loadArtifacts])

  const handleAccept = async (artifactId: string) => {
    if (!window.codeall) return

    setActionLoading(artifactId)
    try {
      const result = (await window.codeall.invoke('artifact:accept', artifactId)) as IpcActionResult
      if (!result?.success) {
        throw new Error(result?.error || 'Accept artifact failed')
      }
      await loadArtifacts()
    } catch (error) {
      console.error('Failed to accept artifact:', error)
    } finally {
      setActionLoading(null)
    }
  }

  const resolveWorkDir = useCallback(async (): Promise<string | null> => {
    if (!window.codeall || !sessionId) return null

    const session = (await window.codeall.invoke('session:get', sessionId)) as {
      spaceId?: string
    } | null

    if (!session?.spaceId) {
      return null
    }

    const spaceResponse = (await window.codeall.invoke(
      'space:get',
      session.spaceId
    )) as SpaceResponse

    if ('success' in spaceResponse) {
      if (!spaceResponse.success) {
        throw new Error(spaceResponse.error || 'Failed to resolve workspace')
      }
      return spaceResponse.data?.workDir || null
    }

    return spaceResponse.workDir || null
  }, [sessionId])

  const handleRevert = async (artifactId: string) => {
    if (!window.codeall || !confirm('确定要撤销此变更吗？')) return

    setActionLoading(artifactId)
    try {
      const workDir = await resolveWorkDir()
      if (!workDir) {
        throw new Error('Workspace directory not found')
      }

      const result = (await window.codeall.invoke('artifact:revert', {
        artifactId,
        workDir
      })) as IpcActionResult

      if (!result?.success) {
        throw new Error(result?.error || 'Revert artifact failed')
      }

      await loadArtifacts()
    } catch (error) {
      console.error('Failed to revert artifact:', error)
    } finally {
      setActionLoading(null)
    }
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const formatPath = (path: string) => {
    const parts = path.split('/')
    if (parts.length <= 2) return path
    return `.../${parts.slice(-2).join('/')}`
  }

  const handleArtifactLinkage = (artifact: Artifact) => {
    requestNavigate({
      source: 'artifact',
      artifactId: artifact.id,
      taskId: artifact.taskId,
      preferredView: artifact.taskId ? 'workflow' : undefined
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 text-slate-500 animate-spin" />
      </div>
    )
  }

  if (artifacts.length === 0) {
    return <div className="text-center py-8 text-slate-500 text-sm">暂无文件变更</div>
  }

  const pendingArtifacts = artifacts.filter(a => !a.accepted)
  const acceptedArtifacts = artifacts.filter(a => a.accepted)

  return (
    <div className="space-y-4">
      {/* Pending Artifacts */}
      {pendingArtifacts.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wide">
              待处理 ({pendingArtifacts.length})
            </h3>
            <button
              type="button"
              onClick={loadArtifacts}
              className="p-1 rounded text-slate-500 hover:text-slate-300"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
          {pendingArtifacts.map(artifact => {
            const config =
              changeTypeConfig[artifact.changeType as keyof typeof changeTypeConfig] ||
              changeTypeConfig.modified
            const Icon = config.icon
            const isLoading = actionLoading === artifact.id

            return (
              <div
                key={artifact.id}
                className="rounded-lg border border-slate-800/70 bg-slate-900/50 p-3 hover:border-slate-700/70 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className={`p-1.5 rounded-lg ${config.bg}`}>
                    <Icon className={`w-4 h-4 ${config.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-200 truncate" title={artifact.path}>
                      {formatPath(artifact.path)}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-xs ${config.color}`}>{config.label}</span>
                      <span className="text-xs text-slate-500">{formatSize(artifact.size)}</span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-1 mt-2 pt-2 border-t border-slate-800/50">
                  {onOpenFile && (
                    <button
                      type="button"
                      onClick={() => onOpenFile(artifact.id, artifact.path)}
                      disabled={isLoading}
                      className="flex items-center gap-1 px-2 py-1 rounded text-xs text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 transition-colors disabled:opacity-50"
                    >
                      <FileCode className="w-3.5 h-3.5" />
                      打开
                    </button>
                  )}
                  {onViewDiff && (
                    <button
                      type="button"
                      onClick={() => onViewDiff(artifact.id, artifact.path)}
                      disabled={isLoading}
                      className="flex items-center gap-1 px-2 py-1 rounded text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-colors disabled:opacity-50"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Diff
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleRevert(artifact.id)}
                    disabled={isLoading}
                    className="flex items-center gap-1 px-2 py-1 rounded text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors disabled:opacity-50"
                  >
                    {isLoading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Undo2 className="w-3.5 h-3.5" />
                    )}
                    撤销
                  </button>
                  <button
                    type="button"
                    onClick={() => handleArtifactLinkage(artifact)}
                    disabled={isLoading}
                    className="flex items-center gap-1 px-2 py-1 rounded text-xs text-sky-400 hover:text-sky-300 hover:bg-sky-500/10 transition-colors disabled:opacity-50"
                  >
                    <Link2 className="w-3.5 h-3.5" />
                    Link
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAccept(artifact.id)}
                    disabled={isLoading}
                    className="flex items-center gap-1 px-2 py-1 rounded text-xs text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 transition-colors disabled:opacity-50"
                  >
                    {isLoading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                    接受
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Accepted Artifacts */}
      {acceptedArtifacts.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wide">
            已接受 ({acceptedArtifacts.length})
          </h3>
          {acceptedArtifacts.slice(0, 5).map(artifact => {
            const config =
              changeTypeConfig[artifact.changeType as keyof typeof changeTypeConfig] ||
              changeTypeConfig.modified
            const Icon = config.icon

            return (
              <div
                key={artifact.id}
                className="rounded-lg border border-slate-800/40 bg-slate-900/30 p-2 opacity-60"
              >
                <div className="flex items-center gap-2">
                  <Icon className={`w-3.5 h-3.5 ${config.color}`} />
                  <span className="text-xs text-slate-400 truncate" title={artifact.path}>
                    {formatPath(artifact.path)}
                  </span>
                  <Check className="w-3 h-3 text-emerald-500 ml-auto" />
                </div>
              </div>
            )
          })}
          {acceptedArtifacts.length > 5 && (
            <p className="text-xs text-slate-500 text-center">
              还有 {acceptedArtifacts.length - 5} 个已接受变更
            </p>
          )}
        </div>
      )}
    </div>
  )
}
