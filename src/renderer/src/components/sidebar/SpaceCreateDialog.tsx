import { useState } from 'react'
import { Space } from '@prisma/client'

interface SpaceCreateDialogProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

interface SelectFolderResult {
  success: boolean
  data: string | null
}

interface CreateSpaceResult {
  success: boolean
  data: Space
}

export function SpaceCreateDialog({ isOpen, onClose, onSuccess }: SpaceCreateDialogProps) {
  const [name, setName] = useState('')
  const [workDir, setWorkDir] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSelectFolder = async () => {
    if (!window.godcode) return
    const result = (await window.godcode.invoke('dialog:select-folder')) as SelectFolderResult
    if (result.success && result.data) {
      setWorkDir(result.data)
    }
  }

  const handleCreate = async () => {
    if (!name.trim() || !workDir || !window.godcode) {
      return
    }

    setLoading(true)
    const result = (await window.godcode.invoke('space:create', {
      name: name.trim(),
      workDir
    })) as CreateSpaceResult
    setLoading(false)

    if (result.success) {
      setName('')
      setWorkDir('')
      onSuccess()
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white/10 backdrop-blur-lg rounded-xl border border-white/20 p-6 w-96 text-white shadow-2xl">
        <h2 className="text-xl font-semibold mb-4">Create Space</h2>

        <input
          type="text"
          placeholder="Space Name"
          value={name}
          onChange={e => setName(e.target.value)}
          className="w-full px-3 py-2 mb-3 bg-white/10 rounded-lg border border-white/20 focus:outline-none focus:border-blue-500 placeholder-gray-400 text-white"
        />

        <div className="mb-4">
          <button
            type="button"
            onClick={handleSelectFolder}
            className="w-full px-3 py-2 bg-white/10 rounded-lg border border-white/20 text-left hover:bg-white/20 transition-colors text-sm truncate text-white"
          >
            {workDir || <span className="text-gray-400">Select Folder...</span>}
          </button>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-white/10 rounded-lg hover:bg-white/20 transition-colors text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={!name.trim() || !workDir || loading}
            className="flex-1 px-4 py-2 bg-blue-500/80 rounded-lg hover:bg-blue-600/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-white font-medium"
          >
            {loading ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}
