import {
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  FileCode,
  FileText,
  Image,
  Code
} from 'lucide-react'
import { useState } from 'react'
import { cn } from '../../utils'

export interface FileNode {
  id: string
  name: string
  path: string
  type: 'file' | 'folder'
  children?: FileNode[]
  fileType?: 'code' | 'markdown' | 'image' | 'json' | 'unknown'
}

interface FileTreeProps {
  nodes: FileNode[]
  onSelect?: (node: FileNode) => void
  selectedPath?: string
  depth?: number
}

export function FileTree({ nodes, onSelect, selectedPath, depth = 0 }: FileTreeProps) {
  return (
    <div className="flex flex-col select-none">
      {nodes.map(node => (
        <FileTreeNode
          key={node.id}
          node={node}
          onSelect={onSelect}
          selectedPath={selectedPath}
          depth={depth}
        />
      ))}
    </div>
  )
}

interface FileTreeNodeProps {
  node: FileNode
  onSelect?: (node: FileNode) => void
  selectedPath?: string
  depth: number
}

function FileTreeNode({ node, onSelect, selectedPath, depth }: FileTreeNodeProps) {
  const [isOpen, setIsOpen] = useState(false)
  const isFolder = node.type === 'folder'
  const isSelected = node.path === selectedPath

  const toggleOpen = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isFolder) {
      setIsOpen(!isOpen)
    } else {
      onSelect?.(node)
    }
  }

  const getIcon = () => {
    if (isFolder) {
      return isOpen ? (
        <ChevronDown className="w-3.5 h-3.5" />
      ) : (
        <ChevronRight className="w-3.5 h-3.5" />
      )
    }

    switch (node.fileType) {
      case 'code':
        return <FileCode className="w-3.5 h-3.5 text-blue-400" />
      case 'markdown':
        return <FileText className="w-3.5 h-3.5 text-purple-400" />
      case 'image':
        return <Image className="w-3.5 h-3.5 text-green-400" />
      case 'json':
        return <Code className="w-3.5 h-3.5 text-yellow-400" />
      default:
        return <File className="w-3.5 h-3.5 text-slate-400" />
    }
  }

  return (
    <div>
      <button
        type="button"
        className={cn(
          'flex items-center gap-1.5 py-1 px-2 cursor-pointer transition-colors text-xs hover:bg-slate-800/50 outline-none focus:bg-slate-800/50 w-full text-left border-none bg-transparent',
          isSelected && 'bg-indigo-500/20 text-indigo-200 hover:bg-indigo-500/30'
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={toggleOpen}
      >
        <span className="text-slate-500 flex-shrink-0">{getIcon()}</span>
        <span className={cn('truncate', isSelected ? 'text-indigo-200' : 'text-slate-300')}>
          {node.name}
        </span>
      </button>

      {isFolder && isOpen && node.children && (
        <FileTree
          nodes={node.children}
          onSelect={onSelect}
          selectedPath={selectedPath}
          depth={depth + 1}
        />
      )}
    </div>
  )
}
