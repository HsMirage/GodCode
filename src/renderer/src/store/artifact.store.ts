import { create } from 'zustand'
import { safeInvoke } from '../api'
import type { Artifact, Session, Space } from '../types/domain'

interface ArtifactState {
  artifacts: Artifact[]
  selectedArtifact: Artifact | null
  isLoading: boolean
  error: string | null

  loadArtifacts: (sessionId: string) => Promise<void>
  selectArtifact: (artifact: Artifact) => Promise<void>
  clearSelection: () => void
  downloadArtifact: (artifact: Artifact, spaceId: string) => Promise<void>
  deleteArtifact: (artifact: Artifact) => Promise<void>
}

export const useArtifactStore = create<ArtifactState>((set, get) => ({
  artifacts: [],
  selectedArtifact: null,
  isLoading: false,
  error: null,

  loadArtifacts: async (sessionId: string) => {
    if (!sessionId || !window.codeall) return
    set({ isLoading: true, error: null })
    try {
      const result = await window.codeall.invoke('artifact:list', sessionId, false)
      if (Array.isArray(result)) {
        set({ artifacts: result, isLoading: false })
      } else {
        console.error('Expected array of artifacts, got:', result)
        set({ artifacts: [], isLoading: false })
      }
    } catch (err) {
      console.error('Failed to fetch artifacts:', err)
      set({ error: 'Failed to load artifacts', isLoading: false })
    }
  },

  selectArtifact: async (artifact: Artifact) => {
    try {
      if (artifact.content) {
        set({ selectedArtifact: artifact })
        return
      }

      if (!window.codeall) return
      set({ isLoading: true })
      const fullArtifact = (await window.codeall.invoke('artifact:get', artifact.id)) as Artifact

      set(state => ({
        selectedArtifact: fullArtifact,
        artifacts: state.artifacts.map(a => (a.id === artifact.id ? fullArtifact : a)),
        isLoading: false
      }))
    } catch (err) {
      console.error('Failed to load artifact content:', err)
      set({ error: 'Failed to load artifact content', isLoading: false })
    }
  },

  clearSelection: () => set({ selectedArtifact: null }),

  downloadArtifact: async (artifact: Artifact, spaceId: string) => {
    if (!window.codeall) return
    try {
      const space = (await window.codeall.invoke('space:get', spaceId)) as Space
      if (!space || !space.workDir) throw new Error('Space not found')

      await window.codeall.invoke('artifact:download', artifact.id, space.workDir)
    } catch (err) {
      console.error('Failed to download artifact:', err)
      throw err
    }
  },

  deleteArtifact: async (artifact: Artifact) => {
    if (!window.codeall) return
    try {
      await window.codeall.invoke('artifact:delete', artifact.id)
      set(state => ({
        selectedArtifact:
          state.selectedArtifact?.id === artifact.id ? null : state.selectedArtifact,
        artifacts: state.artifacts.filter(a => a.id !== artifact.id)
      }))
    } catch (err) {
      console.error('Failed to delete artifact:', err)
      throw err
    }
  }
}))
