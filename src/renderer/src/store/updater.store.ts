import { create } from 'zustand'

export interface UpdateInfo {
  version: string
  files: { url: string; sha512: string; size: number }[]
  path: string
  sha512: string
  releaseName?: string
  releaseNotes?: string | { version: string; note: string | null }[]
  releaseDate: string
}

export interface ProgressInfo {
  total: number
  delta: number
  transferred: number
  percent: number
  bytesPerSecond: number
}

interface UpdaterState {
  status:
    | 'idle'
    | 'checking'
    | 'available'
    | 'not-available'
    | 'downloading'
    | 'downloaded'
    | 'error'
  updateInfo: UpdateInfo | null
  progress: ProgressInfo | null
  error: string | null

  setStatus: (status: UpdaterState['status']) => void
  setUpdateInfo: (info: UpdateInfo | null) => void
  setProgress: (progress: ProgressInfo | null) => void
  setError: (error: string | null) => void
  reset: () => void
}

export const useUpdaterStore = create<UpdaterState>(set => ({
  status: 'idle',
  updateInfo: null,
  progress: null,
  error: null,

  setStatus: (status: UpdaterState['status']) => set({ status }),
  setUpdateInfo: (updateInfo: UpdateInfo | null) => set({ updateInfo }),
  setProgress: (progress: ProgressInfo | null) => set({ progress }),
  setError: (error: string | null) => set({ error }),
  reset: () => set({ status: 'idle', updateInfo: null, progress: null, error: null })
}))
