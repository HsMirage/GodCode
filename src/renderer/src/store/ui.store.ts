import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface OperationLogEntry {
  id: string
  timestamp: number
  action: string
  target?: string
  status: 'running' | 'completed' | 'failed'
}

interface UIState {
  showSidebar: boolean
  showArtifactRail: boolean
  showContentCanvas: boolean
  activeView: 'chat' | 'canvas' | 'artifact'
  sidebarWidth: number
  chatWidth: number
  artifactWidth: number

  // Panel States
  isTaskPanelOpen: boolean
  isBrowserPanelOpen: boolean
  taskPanelWidth: number
  browserPanelWidth: number

  // Browser State
  browserUrl: string
  canGoBack: boolean
  canGoForward: boolean
  isAIOperating: boolean
  isBrowserLoading: boolean
  aiOperationTool: string | null
  aiOperationStatus: 'idle' | 'running' | 'completed' | 'error'

  // Tab State
  browserTabs: Array<{ id: string; title: string; url: string; isLoading: boolean }>
  activeBrowserTabId: string | null

  // Operation History
  browserOperationHistory: OperationLogEntry[]
  addBrowserOperation: (entry: OperationLogEntry) => void

  toggleSidebar: () => void
  toggleArtifactRail: () => void
  toggleContentCanvas: () => void
  setView: (view: 'chat' | 'canvas' | 'artifact') => void
  setPanelSizes: (sizes: { sidebar?: number; chat?: number; artifact?: number }) => void

  // Panel Actions
  openTaskPanel: () => void
  closeTaskPanel: () => void
  toggleTaskPanel: () => void
  openBrowserPanel: () => void
  closeBrowserPanel: () => void
  toggleBrowserPanel: () => void
  setTaskPanelWidth: (width: number) => void
  setBrowserPanelWidth: (width: number) => void

  // Browser Actions
  setBrowserUrl: (url: string) => void
  setBrowserNavState: (state: {
    canGoBack: boolean
    canGoForward: boolean
    isLoading?: boolean
  }) => void
  setAIOperating: (operating: boolean) => void
  setAIOperation: (tool: string | null, status: 'idle' | 'running' | 'completed' | 'error') => void
  setBrowserTabs: (
    tabs: Array<{ id: string; title: string; url: string; isLoading: boolean }>
  ) => void
  setActiveBrowserTab: (id: string) => void
}

export const useUIStore = create<UIState>()(
  persist(
    set => ({
      showSidebar: true,
      showArtifactRail: false,
      showContentCanvas: false,
      activeView: 'chat',
      sidebarWidth: 20,
      chatWidth: 60,
      artifactWidth: 20,

      // Panel Initial State
      isTaskPanelOpen: false,
      isBrowserPanelOpen: false,
      taskPanelWidth: 25,
      browserPanelWidth: 35,

      // Browser Initial State
      browserUrl: '',
      canGoBack: false,
      canGoForward: false,
      isAIOperating: false,
      isBrowserLoading: false,
      aiOperationTool: null,
      aiOperationStatus: 'idle',
      browserTabs: [],
      activeBrowserTabId: null,
      browserOperationHistory: [],

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

      // Panel Actions
      openTaskPanel: () => set({ isTaskPanelOpen: true }),
      closeTaskPanel: () => set({ isTaskPanelOpen: false }),
      toggleTaskPanel: () => set(state => ({ isTaskPanelOpen: !state.isTaskPanelOpen })),
      openBrowserPanel: () => set({ isBrowserPanelOpen: true }),
      closeBrowserPanel: () => set({ isBrowserPanelOpen: false }),
      toggleBrowserPanel: () => set(state => ({ isBrowserPanelOpen: !state.isBrowserPanelOpen })),
      setTaskPanelWidth: width => set({ taskPanelWidth: width }),
      setBrowserPanelWidth: width => set({ browserPanelWidth: width }),

      setBrowserUrl: url => set({ browserUrl: url }),
      setBrowserNavState: state =>
        set(s => ({
          canGoBack: state.canGoBack,
          canGoForward: state.canGoForward,
          isBrowserLoading: state.isLoading ?? s.isBrowserLoading
        })),
      setAIOperating: operating => set({ isAIOperating: operating }),
      setAIOperation: (tool, status) =>
        set({
          aiOperationTool: tool,
          aiOperationStatus: status,
          isAIOperating: status === 'running'
        }),
      setBrowserTabs: tabs => set({ browserTabs: tabs }),
      setActiveBrowserTab: id => set({ activeBrowserTabId: id }),
      addBrowserOperation: entry =>
        set(state => ({
          browserOperationHistory: [entry, ...state.browserOperationHistory].slice(0, 100)
        }))
    }),
    {
      name: 'codeall-ui-storage',
      partialize: state => ({
        isTaskPanelOpen: state.isTaskPanelOpen,
        taskPanelWidth: state.taskPanelWidth,
        browserPanelWidth: state.browserPanelWidth,
        sidebarWidth: state.sidebarWidth
      })
    }
  )
)
