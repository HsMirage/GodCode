import { useState, useEffect } from 'react'
import { Space } from '@prisma/client'

interface SpaceListResult {
  success: boolean
  data: Space[]
}

export function SpaceList() {
  const [spaces, setSpaces] = useState<Space[]>([])
  const [currentSpaceId, setCurrentSpaceId] = useState<string | null>(null)

  useEffect(() => {
    const loadSpaces = async () => {
      const result = (await window.codeall.invoke('space:list')) as SpaceListResult
      if (result.success) {
        setSpaces(result.data)
        setCurrentSpaceId(prev => {
          if (!prev && result.data.length > 0) {
            return result.data[0].id
          }
          return prev
        })
      }
    }
    loadSpaces()
  }, [])

  const handleSpaceSelect = async (spaceId: string) => {
    setCurrentSpaceId(spaceId)
  }

  return (
    <div className="space-list">
      <select
        value={currentSpaceId || ''}
        onChange={e => handleSpaceSelect(e.target.value)}
        className="w-full px-3 py-2 bg-white/10 backdrop-blur-lg rounded-lg border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 appearance-none cursor-pointer"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%23ffffff' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
          backgroundPosition: `right 0.5rem center`,
          backgroundRepeat: `no-repeat`,
          backgroundSize: `1.5em 1.5em`,
          paddingRight: `2.5rem`
        }}
      >
        {spaces.map(space => (
          <option key={space.id} value={space.id} className="bg-gray-900 text-white">
            {space.name}
          </option>
        ))}
      </select>
    </div>
  )
}
