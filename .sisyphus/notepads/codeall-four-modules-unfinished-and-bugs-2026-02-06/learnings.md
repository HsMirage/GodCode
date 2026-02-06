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

## 2026-02-06 T1 基线固化

- 运行 `pnpm test`：当前基线 **22 个测试文件失败 / 72 个用例失败**（详见 `.sisyphus/evidence/t1-pnpm-test.log`）。
- 运行 `pnpm test:e2e`：当前基线 **28 passed / 1 skipped**（该命令会先执行 `pnpm build`，详见 `.sisyphus/evidence/t1-pnpm-test-e2e.log`）。
- 四模块相关失败白名单候选主要集中在：
  - AI Browser（`tests/integration/browser-tools.test.ts`, `tests/integration/browser-automation.test.ts`, `tests/unit/services/ai-browser/tools.test.ts` 等）
  - Delegate/Workforce/Orchestration（`tests/unit/services/delegate/delegate-engine.test.ts`, `tests/integration/workforce-engine.test.ts`, `tests/integration/orchestration.test.ts` 等）
- 模块1路径（`src/renderer/src/layouts/`, `src/renderer/src/components/panels/`）在当前 `git ls-files` 视角下为空；但仓库存在对应目录的 **未跟踪内容**（需在后续任务中明确是否纳入跟踪/变更边界）。
