import { useState, useEffect } from 'react'
import {
  Database,
  Download,
  Upload,
  Clock,
  AlertTriangle,
  FileJson,
  Trash2,
  Check,
  Loader2
} from 'lucide-react'
import { cn } from '../../utils'

interface BackupMetadata {
  name: string
  path: string
  size: number
  createdAt: string | Date
  schemaVersion: string | null
}

const panelClass = [
  'rounded-2xl border border-slate-800/70',
  'bg-slate-950/70 backdrop-blur',
  'shadow-[0_0_24px_rgba(15,23,42,0.35)]'
].join(' ')

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleString()
}

export function DataManagement() {
  const [backups, setBackups] = useState<BackupMetadata[]>([])
  const [loading, setLoading] = useState(false)
  const [processing, setProcessing] = useState<string | null>(null) // 'backup', 'restore', 'delete'
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const fetchBackups = async () => {
    // Skip if not running in Electron environment
    if (!window.codeall) {
      console.warn('[DataManagement] window.codeall not available')
      return
    }
    try {
      setLoading(true)
      const data = (await window.codeall.invoke('backup:list')) as BackupMetadata[]
      // Ensure dates are Date objects
      const processed = data.map(b => ({
        ...b,
        createdAt: new Date(b.createdAt)
      }))
      setBackups(processed)
    } catch (error) {
      console.error('Failed to load backups:', error)
      setMessage({ type: 'error', text: '加载备份列表失败' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchBackups()
  }, [])

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 3000)
      return () => clearTimeout(timer)
    }
    return
  }, [message])

  const handleCreateBackup = async () => {
    if (!window.codeall) return
    try {
      setProcessing('backup')
      await window.codeall.invoke('backup:create')
      setMessage({ type: 'success', text: '备份创建成功' })
      await fetchBackups()
    } catch (error) {
      console.error('Backup failed:', error)
      setMessage({ type: 'error', text: '备份创建失败' })
    } finally {
      setProcessing(null)
    }
  }

  const handleRestore = async (path: string) => {
    if (!window.codeall) return
    try {
      setProcessing('restore')
      await window.codeall.invoke('restore:from-file', path)
      setMessage({ type: 'success', text: '数据恢复成功' })
      setConfirmRestore(null)
      // Ideally reload or re-fetch app state here if needed
    } catch (error) {
      console.error('Restore failed:', error)
      setMessage({ type: 'error', text: '恢复失败: ' + (error as Error).message })
    } finally {
      setProcessing(null)
    }
  }

  const handleDelete = async (filename: string) => {
    if (!window.codeall) return
    try {
      setProcessing('delete')
      await window.codeall.invoke('backup:delete', filename)
      setMessage({ type: 'success', text: '备份已删除' })
      await fetchBackups()
    } catch (error) {
      console.error('Delete failed:', error)
      setMessage({ type: 'error', text: '删除失败' })
    } finally {
      setProcessing(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className={`${panelClass} p-6`}>
        <div className="mb-6 flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Data & Storage</p>
            <h2 className="mt-2 text-xl font-semibold text-white">数据管理</h2>
            <p className="mt-2 text-sm text-slate-400">
              管理应用数据备份和恢复。恢复操作将覆盖当前所有数据，请谨慎操作。
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleCreateBackup}
              disabled={processing !== null}
              className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {processing === 'backup' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              立即备份
            </button>
          </div>
        </div>

        {message && (
          <div
            className={cn(
              'mb-6 flex items-center gap-2 rounded-xl px-4 py-3 text-sm',
              message.type === 'success'
                ? 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                : 'border border-rose-500/20 bg-rose-500/10 text-rose-400'
            )}
          >
            {message.type === 'success' ? (
              <Check className="h-4 w-4" />
            ) : (
              <AlertTriangle className="h-4 w-4" />
            )}
            {message.text}
          </div>
        )}

        <div className="space-y-4">
          <h3 className="text-sm font-medium text-slate-300 flex items-center gap-2">
            <Clock className="h-4 w-4" />
            最近备份
          </h3>

          {loading ? (
            <div className="flex items-center justify-center py-8 text-slate-500">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : backups.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-800/50 bg-slate-900/20 py-8 text-center text-sm text-slate-500">
              暂无备份记录
            </div>
          ) : (
            <div className="grid gap-3">
              {backups.map(backup => (
                <div
                  key={backup.name}
                  className="group flex items-center justify-between rounded-xl border border-slate-800/50 bg-slate-900/40 p-4 transition hover:border-slate-700 hover:bg-slate-900/60"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-800 text-slate-400 group-hover:bg-slate-800/80 group-hover:text-indigo-400 transition-colors">
                      <FileJson className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="font-medium text-slate-200">{backup.name}</div>
                      <div className="flex items-center gap-3 text-xs text-slate-500">
                        <span>{formatDate(backup.createdAt)}</span>
                        <span>•</span>
                        <span>{formatSize(backup.size)}</span>
                        {backup.schemaVersion && (
                          <>
                            <span>•</span>
                            <span className="font-mono">v{backup.schemaVersion}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {confirmRestore === backup.path ? (
                      <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-4 duration-200">
                        <span className="text-xs text-amber-400 mr-1">确定恢复?</span>
                        <button
                          onClick={() => handleRestore(backup.path)}
                          disabled={processing !== null}
                          className="rounded-lg bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-400 hover:bg-amber-500/20 disabled:opacity-50"
                        >
                          确认
                        </button>
                        <button
                          onClick={() => setConfirmRestore(null)}
                          className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-400 hover:bg-slate-700"
                        >
                          取消
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => setConfirmRestore(backup.path)}
                          disabled={processing !== null}
                          className="flex items-center gap-1.5 rounded-lg border border-slate-700/50 bg-slate-800/50 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors disabled:opacity-50"
                        >
                          <Upload className="h-3.5 w-3.5" />
                          恢复
                        </button>
                        <button
                          onClick={() => handleDelete(backup.name)}
                          disabled={processing !== null}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700/50 bg-slate-800/50 text-slate-400 hover:border-rose-500/30 hover:bg-rose-500/10 hover:text-rose-400 transition-colors disabled:opacity-50"
                          title="删除备份"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
