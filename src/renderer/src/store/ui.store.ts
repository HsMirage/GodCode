import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const MAX_SLASH_COMMAND_MRU = 20

export interface OperationLogAudit {
  viewId?: string
  opId?: string
  errorCode?: string
  durationMs?: number
  toolName?: string
  toolArgs?: Record<string, unknown>
  outcome?: 'running' | 'completed' | 'error'
}

export interface BrowserHandoffState {
  isManualControl: boolean
  viewId: string | null
  lastHandoffAt: number | null
}

export interface OperationLogEntry {
  id: string
  timestamp: number
  action: string
  target?: string
  status: 'running' | 'completed' | 'failed'
  audit?: OperationLogAudit
}

interface UIState {
  // Theme
  theme: 'light' | 'dark'

  showSidebar: boolean
  showArtifactRail: boolean
  showContentCanvas: boolean
  activeView: 'chat' | 'canvas' | 'artifact'
  sidebarWidth: number
  chatWidth: number
  artifactWidth: number

  // Slash Command MRU
  slashCommandMru: string[]
  recordSlashCommandUse: (command: string) => void

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
  upsertBrowserOperation: (entry: OperationLogEntry) => void

  // Handoff State
  browserHandoff: BrowserHandoffState
  setBrowserManualControl: (manual: boolean, viewId?: string | null) => void
  clearBrowserHandoff: () => void

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
  setActiveBrowserTab: (id: string | null) => void
  resetBrowserWorkspace: (options?: { closePanel?: boolean }) => void

  // Theme Actions
  setTheme: (theme: 'light' | 'dark') => void
  toggleTheme: () => void
}

export const useUIStore = create<UIState>()(
  persist(
    set => ({
      // Theme Initial State
      theme: 'dark',

      showSidebar: true,
      showArtifactRail: false,
      showContentCanvas: false,
      activeView: 'chat',
      sidebarWidth: 18,
      chatWidth: 60,
      artifactWidth: 20,

      // Panel Initial State
      isTaskPanelOpen: false,
      isBrowserPanelOpen: false,
      taskPanelWidth: 25,
      browserPanelWidth: 30,

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
      browserHandoff: {
        isManualControl: false,
        viewId: null,
        lastHandoffAt: null
      },
      slashCommandMru: [],
      recordSlashCommandUse: command =>
        set(state => {
          const normalized = command.trim()
          if (!normalized) {
            return state
          }

          const deduped = [
            normalized,
            ...state.slashCommandMru.filter(existing => existing !== normalized)
          ].slice(0, MAX_SLASH_COMMAND_MRU)

          return { slashCommandMru: deduped }
        }),

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
      setBrowserTabs: tabs =>
        set(state => ({
          browserTabs: tabs,
          activeBrowserTabId:
            state.activeBrowserTabId && tabs.some(tab => tab.id === state.activeBrowserTabId)
              ? state.activeBrowserTabId
              : tabs[0]?.id ?? null
        })),
      setActiveBrowserTab: id => set({ activeBrowserTabId: id }),
      resetBrowserWorkspace: (options = {}) =>
        set(state => ({
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
          browserHandoff: {
            isManualControl: false,
            viewId: null,
            lastHandoffAt: null
          },
          isBrowserPanelOpen: options.closePanel ? false : state.isBrowserPanelOpen
        })),
      upsertBrowserOperation: entry =>
        set(state => {
          const idx = state.browserOperationHistory.findIndex(e => e.id === entry.id)
          if (idx === -1) {
            return {
              browserOperationHistory: [entry, ...state.browserOperationHistory].slice(0, 100)
            }
          }

          const next = [...state.browserOperationHistory]
          next[idx] = { ...next[idx], ...entry }
          return { browserOperationHistory: next }
        }),
      setBrowserManualControl: (manual, viewId = null) =>
        set(state => ({
          browserHandoff: {
            isManualControl: manual,
            viewId: viewId ?? state.browserHandoff.viewId,
            lastHandoffAt: Date.now()
          }
        })),
      clearBrowserHandoff: () =>
        set({
          browserHandoff: {
            isManualControl: false,
            viewId: null,
            lastHandoffAt: null
          }
        }),

      // Theme Actions
      setTheme: theme => {
        if (theme === 'dark') {
          document.documentElement.classList.add('dark')
          document.documentElement.classList.remove('light')
        } else {
          document.documentElement.classList.add('light')
          document.documentElement.classList.remove('dark')
        }
        set({ theme })
      },
      toggleTheme: () =>
        set(state => {
          const newTheme = state.theme === 'dark' ? 'light' : 'dark'
          if (newTheme === 'dark') {
            document.documentElement.classList.add('dark')
            document.documentElement.classList.remove('light')
          } else {
            document.documentElement.classList.add('light')
            document.documentElement.classList.remove('dark')
          }
          return { theme: newTheme }
        })
    }),
    {
      name: 'codeall-ui-storage',
      partialize: state => ({
        theme: state.theme,
        isTaskPanelOpen: state.isTaskPanelOpen,
        isBrowserPanelOpen: state.isBrowserPanelOpen,
        taskPanelWidth: state.taskPanelWidth,
        browserPanelWidth: state.browserPanelWidth,
        sidebarWidth: state.sidebarWidth,
        slashCommandMru: state.slashCommandMru
      })
    }
  )
)
