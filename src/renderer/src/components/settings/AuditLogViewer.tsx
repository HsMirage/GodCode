import { useState, useEffect } from 'react'
import {
  Search,
  Eye,
  CheckCircle,
  XCircle,
  ChevronLeft,
  ChevronRight,
  Loader2,
  FileJson,
  FileSpreadsheet
} from 'lucide-react'
import { cn } from '../../utils'

// Types based on backend service
interface AuditLogEntry {
  id: string
  action: string
  entityType: string
  entityId: string | null
  userId: string | null
  sessionId: string | null
  ipAddress: string | null
  metadata: any
  success: boolean
  errorMsg: string | null
  createdAt: string // Date comes as string from IPC
}

interface AuditLogFilter {
  action?: string
  entityType?: string
  startDate?: Date
  endDate?: Date
  success?: boolean
}

interface AuditLogViewerProps {
  defaultActionFilter?: string
}

export function AuditLogViewer({ defaultActionFilter }: AuditLogViewerProps) {
  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null)

  // Pagination
  const [page, setPage] = useState(0)
  const [limit] = useState(20)
  const [total, setTotal] = useState(0)

  // Filters
  const [filter, setFilter] = useState<AuditLogFilter>({
    action: defaultActionFilter
  })
  const [actionInput, setActionInput] = useState(defaultActionFilter ?? '')
  const [startDateInput, setStartDateInput] = useState('')
  const [endDateInput, setEndDateInput] = useState('')

  // Load data
  const fetchLogs = async () => {
    // Skip if not running in Electron environment
    if (!window.codeall) {
      console.warn('[AuditLogViewer] window.codeall not available')
      return
    }
    setLoading(true)
    try {
      // Build filter object
      const queryFilter: any = { ...filter }
      if (actionInput) queryFilter.action = actionInput

      // Query logs
      const result = (await window.codeall.invoke('audit-log:query', queryFilter, {
        limit,
        offset: page * limit
      })) as AuditLogEntry[]

      setLogs(result)

      // Get total count for pagination (optional, separate IPC call usually needed if not returned)
      // For now we might just check if we got full page
      const count = (await window.codeall.invoke('audit-log:count', queryFilter)) as number
      setTotal(count)
    } catch (error) {
      console.error('Failed to fetch audit logs:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!defaultActionFilter) {
      return
    }

    setActionInput(defaultActionFilter)
    setFilter(prev => ({
      ...prev,
      action: defaultActionFilter
    }))
    setPage(0)
  }, [defaultActionFilter])

  useEffect(() => {
    fetchLogs()
  }, [page, filter]) // Re-fetch on page/filter change

  const handleExport = async (format: 'json' | 'csv') => {
    if (!window.codeall) return
    try {
      const result = (await window.codeall.invoke('audit-log:export', format, {
        ...filter,
        action: actionInput || undefined,
        startDate: startDateInput ? new Date(startDateInput) : undefined,
        endDate: endDateInput ? new Date(endDateInput) : undefined
      })) as { success: boolean; filePath: string }
      if (result.success) {
        // Could show toast here
        console.log(`Exported to ${result.filePath}`)
      }
    } catch (error) {
      console.error('Export failed:', error)
    }
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setFilter(prev => ({
      ...prev,
      action: actionInput || undefined,
      startDate: startDateInput ? new Date(startDateInput) : undefined,
      endDate: endDateInput ? new Date(endDateInput) : undefined
    }))
    setPage(0) // Reset to first page
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-100">Audit Logs</h2>
          <p className="mt-1 text-sm text-slate-400">
            Track system activities, security events, and user operations.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleExport('csv')}
            className="flex items-center gap-2 rounded-lg border border-slate-700/50 bg-slate-900/50 px-3 py-2 text-xs font-medium text-slate-300 transition hover:bg-slate-800 hover:text-white"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Export CSV
          </button>
          <button
            onClick={() => handleExport('json')}
            className="flex items-center gap-2 rounded-lg border border-slate-700/50 bg-slate-900/50 px-3 py-2 text-xs font-medium text-slate-300 transition hover:bg-slate-800 hover:text-white"
          >
            <FileJson className="h-4 w-4" />
            Export JSON
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-slate-800/70 bg-slate-950/40 p-4 backdrop-blur">
        <form onSubmit={handleSearch} className="flex flex-wrap items-end gap-4">
          <div className="flex-1 space-y-1.5 min-w-[200px]">
            <label className="text-xs font-medium text-slate-400">Action Type</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
              <input
                type="text"
                value={actionInput}
                onChange={e => setActionInput(e.target.value)}
                placeholder="e.g. user:login, model:create"
                className="w-full rounded-lg border border-slate-700 bg-slate-900 py-2 pl-9 pr-3 text-sm text-slate-200 placeholder-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-400">Status</label>
            <select
              value={filter.success === undefined ? 'all' : filter.success.toString()}
              onChange={e => {
                const val = e.target.value
                setFilter(prev => ({
                  ...prev,
                  success: val === 'all' ? undefined : val === 'true'
                }))
                setPage(0)
              }}
              className="h-[38px] w-32 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none"
            >
              <option value="all">All Status</option>
              <option value="true">Success</option>
              <option value="false">Failed</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-400">Start Time</label>
            <input
              type="datetime-local"
              value={startDateInput}
              onChange={e => setStartDateInput(e.target.value)}
              className="h-[38px] rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-400">End Time</label>
            <input
              type="datetime-local"
              value={endDateInput}
              onChange={e => setEndDateInput(e.target.value)}
              className="h-[38px] rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            className="h-[38px] rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white transition hover:bg-indigo-500"
          >
            Search
          </button>
        </form>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-800/70 bg-slate-950/40 backdrop-blur overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/50 text-xs uppercase tracking-wider text-slate-400">
                <th className="px-4 py-3 font-medium">Time</th>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">Entity</th>
                <th className="px-4 py-3 font-medium">User / Session</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center">
                    <Loader2 className="mx-auto h-8 w-8 animate-spin text-slate-600" />
                    <p className="mt-2 text-slate-500">Loading logs...</p>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    No audit logs found matching criteria
                  </td>
                </tr>
              ) : (
                logs.map(log => (
                  <tr key={log.id} className="group transition hover:bg-slate-900/40">
                    <td className="px-4 py-3 text-slate-400 whitespace-nowrap font-mono text-xs">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-md bg-slate-800 px-2 py-1 text-xs font-medium text-slate-200 ring-1 ring-inset ring-slate-700/50">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      <div className="flex flex-col">
                        <span className="text-xs text-slate-400 uppercase tracking-wider">
                          {log.entityType}
                        </span>
                        <span
                          className="font-mono text-xs truncate max-w-[120px]"
                          title={log.entityId || ''}
                        >
                          {log.entityId || '-'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      <div className="flex flex-col text-xs">
                        {log.userId && <span>User: {log.userId}</span>}
                        {log.sessionId && (
                          <span className="text-slate-500">
                            Session: {log.sessionId.slice(0, 8)}...
                          </span>
                        )}
                        {!log.userId && !log.sessionId && <span className="text-slate-600">-</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {log.success ? (
                          <>
                            <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                            <span className="text-xs text-green-400">Success</span>
                          </>
                        ) : (
                          <>
                            <XCircle className="h-3.5 w-3.5 text-rose-500" />
                            <span className="text-xs text-rose-400">Failed</span>
                          </>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setSelectedLog(log)}
                        className="rounded p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-white"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between border-t border-slate-800 px-4 py-3">
          <div className="text-xs text-slate-500">
            Showing <span className="font-medium text-slate-300">{page * limit + 1}</span> to{' '}
            <span className="font-medium text-slate-300">
              {Math.min((page + 1) * limit, total)}
            </span>{' '}
            of <span className="font-medium text-slate-300">{total}</span> results
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="rounded p-1 text-slate-400 disabled:opacity-30 hover:bg-slate-800 hover:text-white transition"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={(page + 1) * limit >= total}
              className="rounded p-1 text-slate-400 disabled:opacity-30 hover:bg-slate-800 hover:text-white transition"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Detail Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-950 p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Log Details</h3>
              <button
                onClick={() => setSelectedLog(null)}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <XCircle className="h-6 w-6" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 rounded-xl bg-slate-900/50 p-4 border border-slate-800">
                <div>
                  <label className="text-xs font-medium text-slate-500 uppercase">Log ID</label>
                  <div className="font-mono text-sm text-slate-200">{selectedLog.id}</div>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 uppercase">Timestamp</label>
                  <div className="font-mono text-sm text-slate-200">
                    {new Date(selectedLog.createdAt).toLocaleString()}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 uppercase">Action</label>
                  <div className="text-sm text-indigo-400 font-medium">{selectedLog.action}</div>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 uppercase">Status</label>
                  <div
                    className={cn(
                      'text-sm font-medium',
                      selectedLog.success ? 'text-green-400' : 'text-rose-400'
                    )}
                  >
                    {selectedLog.success ? 'Success' : 'Failed'}
                  </div>
                </div>
                {selectedLog.errorMsg && (
                  <div className="col-span-2">
                    <label className="text-xs font-medium text-rose-500 uppercase">
                      Error Message
                    </label>
                    <div className="text-sm text-rose-300">{selectedLog.errorMsg}</div>
                  </div>
                )}
              </div>

              <div>
                <label className="mb-2 block text-xs font-medium text-slate-500 uppercase">
                  Metadata / Payload
                </label>
                <pre className="max-h-[300px] overflow-auto rounded-xl border border-slate-800 bg-slate-900 p-4 font-mono text-xs text-slate-300 scrollbar-thin scrollbar-thumb-slate-700">
                  {JSON.stringify(selectedLog.metadata, null, 2) || '{}'}
                </pre>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setSelectedLog(null)}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:bg-slate-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
