# Learnings

## 2026-02-06 Session Start: ses_3cecc9a6bffe9CIC71pzwcmKuN

- Plan: codeall-four-modules-unfinished-and-bugs-2026-02-06
- Total Tasks: 10 (T1-T10)
- Parallel Waves: 3

### Key Context (from Metis/Momus review)

- Prompt 优先级：Agent > Category > Default
- 空字符串视为"显式清空"并向下回退
- 模块1只做回归修复，不主动重构
- 不做 artifact 版本管理、不做 tabs 高级特性

## Browser Multi-Tab Implementation

- Implemented multi-tab support using Electron's BrowserView.
- `BrowserViewManager` backend logic was largely ready but needed `getAllStates` exposed.
- `ui.store` updated to track `browserTabs` list and `activeBrowserTabId`.
- `BrowserShell` heavily refactored:
  - Added horizontal scrollable TabBar.
  - Added new/close tab buttons.
  - Syncs tab state with backend via `browser:list-tabs` and `browser:state-changed` events.
  - Manages active view visibility (show/hide) based on `activeBrowserTabId`.
- **Gotcha**: IPC calls return `unknown` by default in TypeScript, required `as any` casting for quick prototype. Should define proper types in shared interface later.
- **Gotcha**: `ResizeObserver` needs to be aware of `activeBrowserTabId` to resize the correct view.
- **Security**: File URLs blocked by default in backend service (good).
