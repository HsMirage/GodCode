import React, { useEffect, useState, useCallback } from 'react'
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileCode,
  FileText,
  Image as ImageIcon,
  File as FileIcon,
  RefreshCw
} from 'lucide-react'
import { useDataStore } from '../../store/data.store'
import { useUIStore } from '../../store/ui.store'
import { useArtifactStore } from '../../store/artifact.store'
import { safeInvoke } from '../../api'
import { canvasLifecycle } from '../../services/canvas-lifecycle'
import { cn } from '../../utils'

interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileNode[]
}

interface LocalFileExplorerProps {
  className?: string
}

const getFileIcon = (filename: string) => {
  const ext = filename.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'ts':
    case 'tsx':
    case 'js':
    case 'jsx':
    case 'json':
    case 'css':
    case 'html':
      return <FileCode className="w-4 h-4 text-blue-600 dark:text-blue-300" />
    case 'md':
    case 'txt':
      return <FileText className="w-4 h-4 text-slate-600 dark:text-gray-300" />
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'svg':
      return <ImageIcon className="w-4 h-4 text-purple-600 dark:text-purple-300" />
    default:
      return <FileIcon className="w-4 h-4 text-slate-500 dark:text-gray-400" />
  }
}

const FileNodeItem: React.FC<{
  node: FileNode
  level: number
  onToggle: (node: FileNode) => void
  onFileOpen: (node: FileNode) => Promise<void>
  expanded: Set<string>
}> = ({ node, level, onToggle, onFileOpen, expanded }) => {
  const isOpen = expanded.has(node.path)
  const isFolder = node.type === 'directory'

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isFolder) {
      onToggle(node)
      return
    }

    void onFileOpen(node)
  }

  return (
    <div className="select-none">
      <button
        type="button"
        className={`w-full text-left flex items-center py-1 px-2 cursor-pointer transition-colors rounded focus:outline-none hover:bg-black/5 focus:bg-black/10 dark:hover:bg-white/5 dark:focus:bg-white/10 ${
          !isFolder ? 'text-[var(--text-secondary)]' : 'text-[var(--text-primary)] font-medium'
        }`}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        onClick={handleToggle}
      >
        <span className="mr-1.5 opacity-70 flex-shrink-0">
          {isFolder ? (
            <span className="p-0.5 inline-flex">
              {isOpen ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
            </span>
          ) : (
            <div className="w-4" />
          )}
        </span>

        <span className="mr-2 flex-shrink-0">
          {isFolder ? (
            isOpen ? (
              <FolderOpen className="w-4 h-4 text-yellow-600/80 dark:text-yellow-300/80" />
            ) : (
              <Folder className="w-4 h-4 text-yellow-600/80 dark:text-yellow-300/80" />
            )
          ) : (
            getFileIcon(node.name)
          )}
        </span>

        <span className="truncate text-sm">{node.name}</span>
      </button>

      {isFolder && isOpen && node.children && (
        <div>
          {node.children.map(child => (
            <FileNodeItem
              key={child.path}
              node={child}
              level={level + 1}
              onToggle={onToggle}
              onFileOpen={onFileOpen}
              expanded={expanded}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export const LocalFileExplorer: React.FC<LocalFileExplorerProps> = ({ className }) => {
  const { currentSpaceId, currentSessionId, spaces } = useDataStore()
  const { setView } = useUIStore()
  const { clearSelection } = useArtifactStore()
  const [rootNode, setRootNode] = useState<FileNode | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [isSectionExpanded, setIsSectionExpanded] = useState(true)

  const currentWorkDir = React.useMemo(() => {
    return spaces.find(s => s.id === currentSpaceId)?.workDir
  }, [spaces, currentSpaceId])

  const fetchNode = useCallback(
    async (path: string = '.') => {
      if (!currentWorkDir) return null

      try {
        const result = await safeInvoke<FileNode>('file-tree:get', currentWorkDir, path)
        return result
      } catch (err) {
        console.error('Failed to fetch file node:', err)
        return null
      }
    },
    [currentWorkDir]
  )

  const loadRoot = useCallback(async () => {
    if (!currentWorkDir) return

    setLoading(true)
    setError(null)
    try {
      const root = await fetchNode('.')
      if (root) {
        setRootNode(root)
        setExpanded(new Set([root.path]))
      } else {
        setError('Error loading file system')
      }
    } catch (err) {
      setError('Error loading file system')
    } finally {
      setLoading(false)
    }
  }, [currentWorkDir, fetchNode])

  useEffect(() => {
    if (currentSpaceId) {
      loadRoot()
    } else {
      setRootNode(null)
    }
  }, [currentSpaceId, loadRoot])

  const handleToggle = async (node: FileNode) => {
    const newExpanded = new Set(expanded)

    if (newExpanded.has(node.path)) {
      newExpanded.delete(node.path)
      setExpanded(newExpanded)
    } else {
      newExpanded.add(node.path)
      setExpanded(newExpanded)

      if (!node.children || node.children.length === 0) {
        const updatedNode = await fetchNode(node.path)
        if (updatedNode && rootNode) {
          const updateTree = (current: FileNode): FileNode => {
            if (current.path === node.path) {
              return { ...current, children: updatedNode.children }
            }
            if (current.children) {
              return {
                ...current,
                children: current.children.map(updateTree)
              }
            }
            return current
          }

          setRootNode(updateTree(rootNode))
        }
      }
    }
  }

  const handleFileOpen = async (node: FileNode) => {
    if (!currentSessionId) return
    clearSelection()
    setView('canvas')
    await canvasLifecycle.openFile(node.path, node.name)
  }

  if (!currentSpaceId) {
    return null
  }

  return (
    <div
      className={cn(
        'rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] overflow-hidden flex flex-col transition-all duration-300 ease-in-out',
        isSectionExpanded ? 'h-64' : 'h-10',
        className
      )}
      data-testid="file-explorer"
    >
      <div
        className="p-3 border-b ui-border flex items-center justify-between cursor-pointer hover:bg-[var(--bg-tertiary)] transition-colors"
        onClick={() => setIsSectionExpanded(!isSectionExpanded)}
      >
        <div className="flex items-center gap-2">
          {isSectionExpanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)]" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-[var(--text-muted)]" />
          )}
          <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Files</h3>
        </div>
        <button
          onClick={e => {
            e.stopPropagation()
            loadRoot()
          }}
          disabled={loading}
          className="p-1 text-[var(--text-secondary)] hover:text-indigo-500 dark:hover:text-indigo-400 hover:bg-[var(--bg-tertiary)] rounded transition-colors disabled:opacity-50"
          title="Refresh files"
        >
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
        </button>
      </div>

      {isSectionExpanded && (
        <div className="flex-1 overflow-y-auto p-2 scrollbar-thin scrollbar-track-transparent">
          {loading && !rootNode && (
            <div className="p-4 text-center text-[var(--text-muted)] text-xs">Loading...</div>
          )}

          {error && <div className="p-4 text-center text-red-400 text-xs">{error}</div>}

          {!loading &&
            !error &&
            rootNode &&
            (rootNode.children && rootNode.children.length > 0 ? (
              rootNode.children.map(child => (
                <FileNodeItem
                  key={child.path}
                  node={child}
                  level={0}
                  onToggle={handleToggle}
                  onFileOpen={handleFileOpen}
                  expanded={expanded}
                />
              ))
            ) : (
              <div className="p-4 text-center text-[var(--text-muted)] text-xs">Empty directory</div>
            ))}
        </div>
      )}
    </div>
  )
}
