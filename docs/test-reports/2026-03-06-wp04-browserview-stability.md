# WP-04 BrowserView 稳定性专项 验收记录

## 1. 基本信息
- 工作包：`WP-04 BrowserView 稳定性专项`
- 日期：`2026-03-06`
- 范围：`browser-view.service` / `BrowserShell` / `browser-panel-lifecycle` / `MainLayout` / Browser session cleanup

## 2. 变更摘要
- 为 main 侧 `BrowserViewManager` 增加显式生命周期状态与重复 attach 保护。
- 将 Browser panel 的 show/hide/resize/tab switch/overlay 分支统一收敛到 `createBrowserPanelLifecycle()`。
- 在 `MainLayout` 增加 session 切换时的 BrowserView cleanup，并通过 `resetBrowserWorkspace()` 先收敛 renderer 状态。
- 新增 Browser session cleanup helper 与专项回归测试。
- 更新浏览器工作台故障排查文档。

## 3. 验收结果
- `tests/unit/renderer/browser-panel-lifecycle.test.ts`
  - 覆盖 panel 打开、tab 切换、overlay 阻塞、closeView、bounds resize。
- `tests/unit/renderer/browser-session-cleanup.test.ts`
  - 覆盖 session 切换时的批量 hide/destroy、hide 失败继续 destroy、destroy 失败回报。
- `tests/integration/browser-shell-lifecycle.test.tsx`
  - 覆盖 BrowserShell 卸载时隐藏可见 BrowserView，防止 panel 关闭后残留显示。
- `tests/unit/services/browser-view.test.ts`
  - 覆盖 main 侧 create/show/hide/destroy、重复 show 不重复 attach、销毁底层 `webContents`。
- `tests/integration/ai-browser.test.ts`
  - 现有 AI Browser 集成链路通过，说明本轮未破坏浏览器工具主链。

## 4. 执行命令
```bash
pnpm exec vitest run tests/unit/renderer/browser-panel-lifecycle.test.ts tests/unit/renderer/browser-session-cleanup.test.ts tests/integration/browser-shell-lifecycle.test.tsx tests/unit/services/browser-view.test.ts tests/integration/ai-browser.test.ts
pnpm exec eslint src/main/services/browser-view.service.ts src/renderer/src/components/browser/BrowserShell.tsx src/renderer/src/components/layout/MainLayout.tsx src/renderer/src/components/panels/browser-panel-lifecycle.ts src/renderer/src/services/browser-session-cleanup.ts tests/unit/renderer/browser-panel-lifecycle.test.ts tests/unit/renderer/browser-session-cleanup.test.ts tests/integration/browser-shell-lifecycle.test.tsx tests/unit/services/browser-view.test.ts
pnpm exec tsc --noEmit
```

## 5. 类型检查说明
- `pnpm exec tsc --noEmit` 仍存在仓库既有错误：
  - `src/main/services/hooks/manager.ts`
  - `src/renderer/src/pages/ChatPage.tsx`
  - `tests/e2e/fixtures/electron.ts`
  - `tests/unit/services/workforce/workflow-observability-writer.test.ts`
- 本轮新增 BrowserView 稳定性改动未新增新的 TypeScript 错误。

## 6. 结论
- Browser panel 关闭、tab 切换、session 切换 cleanup、resize bounds 同步与主进程 view 销毁已形成闭环。
- 本轮采用保守策略：session 切换时主动关闭浏览器面板并清理旧 tabs，以优先消除 BrowserView 残留风险。
