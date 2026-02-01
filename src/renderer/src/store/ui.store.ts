import { create } from 'zustand'

interface UIState {
  showSidebar: boolean
  showArtifactRail: boolean
  showContentCanvas: boolean
  activeView: 'chat' | 'canvas' | 'artifact'
  sidebarWidth: number
  chatWidth: number
  artifactWidth: number
  // Browser State
  browserUrl: string
  canGoBack: boolean
  canGoForward: boolean
  isAIOperating: boolean
  isBrowserLoading: boolean

  toggleSidebar: () => void
  toggleArtifactRail: () => void
  toggleContentCanvas: () => void
  setView: (view: 'chat' | 'canvas' | 'artifact') => void
  setPanelSizes: (sizes: { sidebar?: number; chat?: number; artifact?: number }) => void

  // Browser Actions
  setBrowserUrl: (url: string) => void
  setBrowserNavState: (state: {
    canGoBack: boolean
    canGoForward: boolean
    isLoading?: boolean
  }) => void
  setAIOperating: (operating: boolean) => void
}

export const useUIStore = create<UIState>(set => ({
  showSidebar: true,
  showArtifactRail: false,
  showContentCanvas: false,
  activeView: 'chat',
  sidebarWidth: 20,
  chatWidth: 60,
  artifactWidth: 20,

  // Browser Initial State
  browserUrl: '',
  canGoBack: false,
  canGoForward: false,
  isAIOperating: false,
  isBrowserLoading: false,

  toggleSidebar: () => set(state => ({ showSidebar: !state.showSidebar })),
  toggleArtifactRail: () => set(state => ({ showArtifactRail: !state.showArtifactRail })),
  toggleContentCanvas: () => set(state => ({ showContentCanvas: !state.showContentCanvas })),
  setView: view =>
    set(() => {
      switch (view) {
        case 'chat':
          return {
            activeView: view,
            showSidebar: true,
            showArtifactRail: false,
            showContentCanvas: false
          }
        case 'canvas':
          return {
            activeView: view,
            showSidebar: true,
            showContentCanvas: true,
            showArtifactRail: false
          }
        case 'artifact':
          return {
            activeView: view,
            showSidebar: true,
            showArtifactRail: true,
            showContentCanvas: false
          }
        default:
          return { activeView: view }
      }
    }),
  setPanelSizes: sizes =>
    set(state => ({
      sidebarWidth: sizes.sidebar ?? state.sidebarWidth,
      chatWidth: sizes.chat ?? state.chatWidth,
      artifactWidth: sizes.artifact ?? state.artifactWidth
    })),

  setBrowserUrl: url => set({ browserUrl: url }),
  setBrowserNavState: state =>
    set(s => ({
      canGoBack: state.canGoBack,
      canGoForward: state.canGoForward,
      isBrowserLoading: state.isLoading ?? s.isBrowserLoading
    })),
  setAIOperating: operating => set({ isAIOperating: operating })
}))
