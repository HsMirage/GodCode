import { useEffect, useState } from 'react'
import { Plus, Box, Settings } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useDataStore } from '../../store/data.store'
import { cn } from '../../utils'

export function TopNavigation() {
  const { spaces, currentSpaceId, setCurrentSpace, fetchSpaces, createSpace } = useDataStore()
  const [isCreating, setIsCreating] = useState(false)
  const [newSpaceName, setNewSpaceName] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    fetchSpaces()
  }, [fetchSpaces])

  const handleCreateSpace = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newSpaceName.trim()) return

    try {
      await createSpace(newSpaceName, `/tmp/${newSpaceName}`)
      setNewSpaceName('')
      setIsCreating(false)
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div className="h-12 bg-slate-950 border-b border-slate-800 flex items-center px-4 gap-4 select-none">
      <div
        className="flex items-center gap-2 text-slate-100 font-semibold mr-4 cursor-pointer hover:opacity-80 transition-opacity"
        onClick={() => navigate('/')}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            navigate('/')
          }
        }}
        role="button"
        tabIndex={0}
      >
        <Box className="w-5 h-5 text-indigo-500" />
        <span>CodeAll</span>
      </div>

      <div className="flex-1 flex items-center gap-2 overflow-x-auto no-scrollbar">
        {spaces.map(space => (
          <button
            type="button"
            key={space.id}
            onClick={() => setCurrentSpace(space.id)}
            className={cn(
              'px-3 py-1.5 rounded-md text-sm transition-colors whitespace-nowrap',
              currentSpaceId === space.id
                ? 'bg-slate-800 text-slate-100 font-medium'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            )}
          >
            {space.name}
          </button>
        ))}

        {isCreating ? (
          <form onSubmit={handleCreateSpace} className="flex items-center gap-2">
            <input
              type="text"
              value={newSpaceName}
              onChange={e => setNewSpaceName(e.target.value)}
              placeholder="Space name..."
              className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 w-32"
              onBlur={() => !newSpaceName && setIsCreating(false)}
            />
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setIsCreating(true)}
            className="p-1.5 rounded-md text-slate-500 hover:text-indigo-400 hover:bg-slate-900 transition-colors"
            title="Create New Space"
          >
            <Plus className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 ml-auto">
        <button
          type="button"
          onClick={() => navigate('/settings')}
          className="p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          title="Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
        <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-xs text-slate-400">
          U
        </div>
      </div>
    </div>
  )
}
