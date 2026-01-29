import React, { useMemo, useState } from 'react'
import { Artifact } from '../../../../types/domain'
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileCode,
  FileText,
  Image as ImageIcon,
  File as FileIcon
} from 'lucide-react'

interface TreeNode {
  name: string
  path: string
  type: 'file' | 'folder'
  children?: TreeNode[]
  artifact?: Artifact
}

interface FileTreeProps {
  artifacts: Artifact[]
  onFileClick: (artifact: Artifact) => void
  className?: string
}

const buildTree = (artifacts: Artifact[]): TreeNode[] => {
  const root: TreeNode[] = []
  const map: Record<string, TreeNode> = {}

  // Sort artifacts by path to ensure consistent order
  const sortedArtifacts = [...artifacts].sort((a, b) => a.path.localeCompare(b.path))

  sortedArtifacts.forEach(artifact => {
    const parts = artifact.path.split('/')
    let currentPath = ''

    parts.forEach((part, index) => {
      const isFile = index === parts.length - 1
      const parentPath = currentPath
      currentPath = currentPath ? `${currentPath}/${part}` : part

      if (!map[currentPath]) {
        const node: TreeNode = {
          name: part,
          path: currentPath,
          type: isFile ? 'file' : 'folder',
          children: isFile ? undefined : [],
          artifact: isFile ? artifact : undefined
        }

        map[currentPath] = node

        if (index === 0) {
          root.push(node)
        } else {
          const parent = map[parentPath]
          if (parent && parent.children) {
            parent.children.push(node)
          }
        }
      }
    })
  })

  // Recursive sort: folders first, then files, alphabetically
  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.type === b.type) {
        return a.name.localeCompare(b.name)
      }
      return a.type === 'folder' ? -1 : 1
    })
    nodes.forEach(node => {
      if (node.children) {
        sortNodes(node.children)
      }
    })
  }

  sortNodes(root)
  return root
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
      return <FileCode className="w-4 h-4 text-blue-300" />
    case 'md':
    case 'txt':
      return <FileText className="w-4 h-4 text-gray-300" />
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'svg':
      return <ImageIcon className="w-4 h-4 text-purple-300" />
    default:
      return <FileIcon className="w-4 h-4 text-gray-400" />
  }
}

const FileTreeNode: React.FC<{
  node: TreeNode
  level: number
  onFileClick: (artifact: Artifact) => void
}> = ({ node, level, onFileClick }) => {
  const [isOpen, setIsOpen] = useState(true)

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsOpen(!isOpen)
  }

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (node.type === 'folder') {
      setIsOpen(!isOpen)
    } else if (node.artifact) {
      onFileClick(node.artifact)
    }
  }

  return (
    <div className="select-none">
      <button
        type="button"
        className={`w-full text-left flex items-center py-1 px-2 cursor-pointer hover:bg-white/5 transition-colors rounded focus:outline-none focus:bg-white/10 ${
          node.type === 'file' ? 'text-gray-200' : 'text-white font-medium'
        }`}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        onClick={handleClick}
        onKeyDown={e => {
          if (e.key === 'ArrowRight' && node.type === 'folder' && !isOpen) setIsOpen(true)
          if (e.key === 'ArrowLeft' && node.type === 'folder' && isOpen) setIsOpen(false)
        }}
      >
        <span className="mr-1.5 opacity-70 flex-shrink-0">
          {node.type === 'folder' ? (
            <button
              type="button"
              className="p-0.5 hover:bg-white/10 rounded focus:outline-none focus:bg-white/20"
              onClick={handleToggle}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  handleToggle(e as unknown as React.MouseEvent)
                }
              }}
            >
              {isOpen ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
            </button>
          ) : (
            <div className="w-4" />
          )}
        </span>

        <span className="mr-2 flex-shrink-0">
          {node.type === 'folder' ? (
            isOpen ? (
              <FolderOpen className="w-4 h-4 text-yellow-300/80" />
            ) : (
              <Folder className="w-4 h-4 text-yellow-300/80" />
            )
          ) : (
            getFileIcon(node.name)
          )}
        </span>

        <span className="truncate text-sm">{node.name}</span>
      </button>

      {node.type === 'folder' && isOpen && node.children && (
        <div>
          {node.children.map(child => (
            <FileTreeNode
              key={child.path}
              node={child}
              level={level + 1}
              onFileClick={onFileClick}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export const FileTree: React.FC<FileTreeProps> = ({ artifacts, onFileClick, className = '' }) => {
  const treeData = useMemo(() => buildTree(artifacts), [artifacts])

  if (artifacts.length === 0) {
    return (
      <div className={`p-4 text-center text-gray-400 text-sm ${className}`}>No artifacts found</div>
    )
  }

  return (
    <div
      className={`bg-white/10 backdrop-blur-lg border border-white/20 rounded-lg overflow-hidden flex flex-col h-full ${className}`}
    >
      <div className="p-3 border-b border-white/10 bg-white/5">
        <h3 className="text-sm font-semibold text-white/90">Artifacts</h3>
      </div>
      <div className="flex-1 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
        {treeData.map(node => (
          <FileTreeNode key={node.path} node={node} level={0} onFileClick={onFileClick} />
        ))}
      </div>
    </div>
  )
}
