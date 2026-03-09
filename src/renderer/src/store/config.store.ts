import { create } from 'zustand'
import type { Agent } from '@renderer/types/domain'
import type { PersistedModel } from '@shared/ipc-contract'

interface ConfigState {
  models: PersistedModel[]
  agents: Agent[]
  settings: Record<string, unknown>
  loadModels: (models: PersistedModel[]) => void
  addModel: (model: PersistedModel) => void
  updateModel: (model: PersistedModel) => void
  deleteModel: (modelId: string) => void
  setAgents: (agents: Agent[]) => void
  updateSettings: (settings: Record<string, unknown>) => void
}

export const useConfigStore = create<ConfigState>((set) => ({
  models: [],
  agents: [],
  settings: {},
  loadModels: (models) => set({ models }),
  addModel: (model) => set((state) => ({ models: [...state.models, model] })),
  updateModel: (model) => set((state) => ({
    models: state.models.map((item) => (item.id === model.id ? model : item))
  })),
  deleteModel: (modelId) => set((state) => ({
    models: state.models.filter((item) => item.id !== modelId)
  })),
  setAgents: (agents) => set({ agents }),
  updateSettings: (settings) => set((state) => ({
    settings: { ...state.settings, ...settings }
  }))
}))
