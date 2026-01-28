import { create } from 'zustand'
import type { Agent, Model } from '@renderer/types/domain'

interface ConfigState {
  models: Model[]
  agents: Agent[]
  settings: Record<string, unknown>
  loadModels: (models: Model[]) => void
  addModel: (model: Model) => void
  updateModel: (model: Model) => void
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
