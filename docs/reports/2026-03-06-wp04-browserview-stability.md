# WP-04 BrowserView 稳定性专项说明

## 1. 目标

本轮聚焦 BrowserView 在工作台中的高频故障点：

- 面板关闭后残留 `BrowserView`
- tab 切换与显隐路径重复分叉
- session 切换后旧 view 未及时清理
- resize / overlay 导致 bounds 不一致
- 主进程 attach/detach/dispose 状态不可观测

## 2. 现状路径梳理

### 2.1 Browser tab 创建路径
- Browser 面板手动开新 tab：`src/renderer/src/components/browser/BrowserShell.tsx`
  - `handleNewTab()` -> `browser:create` -> `browser:list-tabs` -> `setActiveBrowserTab()`
- AI 操作接管：`src/renderer/src/components/layout/MainLayout.tsx`
  - `browser:ai-operation` 事件 -> `openBrowserPanel()` -> `setActiveBrowserTab(viewId)`
- Canvas 浏览器 tab：`src/renderer/src/services/canvas-lifecycle.ts`
  - `openUrl()` / `attachAIBrowserView()` -> `api.createBrowserView()`

### 2.2 BrowserView 显示 / 隐藏路径
- Browser 面板主链：`BrowserShell` -> `createBrowserPanelLifecycle.sync()` -> `browser:show` / `browser:hide` / `browser:resize`
- Canvas 主链：`canvas-lifecycle.switchTab()` / `setOpen()` / `updateActiveBounds()`
- 主进程统一落点：`src/main/services/browser-view.service.ts`
  - `show()` / `hide()` / `resize()` / `destroy()`

### 2.3 销毁与 cleanup 路径
- 关闭单个 browser tab：`BrowserShell.handleCloseTab()` -> `closeView()` -> `browser:hide` + `browser:destroy`
- BrowserShell 卸载：显式调用 `hideVisible('component-unmount')`
- Session 切换：`MainLayout` -> `resetBrowserWorkspace({ closePanel: true })` -> `cleanupBrowserSessionViews()`
- Main 进程退出或窗口关闭：`browserViewManager.destroyAll()`
- Canvas tab 关闭：`canvas-lifecycle.closeTab()` / `closeAll()`

### 2.4 Bounds 更新触发源
- Browser panel 打开 / 关闭
- active browser tab 切换
- `ResizeObserver` 监听右侧容器尺寸变化
- overlay/dialog 遮挡状态变化
- session 切换触发 cleanup 后重新打开 panel
- Canvas `BrowserViewer` 容器 resize

## 3. 生命周期模型

### 3.1 BrowserView 生命周期
- `created`：实例已创建但未 attach 到窗口
- `attached`：准备挂入窗口，进入可见链路
- `visible`：已 attach 且 bounds 已同步
- `hidden`：已从窗口移除，但实例仍保留
- `disposed`：已执行 destroy，不再可复用

### 3.2 Tab 生命周期
- `inactive`：存在但非当前可见 tab
- `active`：当前被 Browser panel 展示
- `closing`：进入显式 close / destroy 流程
- `disposed`：对应 view 已被销毁

### 3.3 Dispose 条件清单
- 用户关闭 browser tab
- Browser panel 组件卸载
- session 切换
- 主窗口关闭
- 超出 `MAX_TABS` 时 FIFO 淘汰旧实例

## 4. 实施结果

### 4.1 主进程：收敛 attach / detach / dispose
- `src/main/services/browser-view.service.ts`
  - 给 `BrowserViewState` 增加可观测 `lifecycleState`
  - `show()` 增加无效 bounds 保护，并避免重复 attach
  - `hide()` 回写 `hidden`
  - `destroy()` 显式销毁底层 `webContents`，并记录 `disposed`
  - 通过 `debug()` 输出生命周期迁移日志，便于排查残留实例

### 4.2 Renderer：统一 Browser panel 生命周期入口
- `src/renderer/src/components/panels/browser-panel-lifecycle.ts`
  - 把 `show / hide / resize / close` 收口到同一 helper
  - 为 panel、overlay、bounds、closeView 场景定义统一 blocked reason
  - 新增 `getDebugSnapshot()`，便于测试与诊断
- `src/renderer/src/components/browser/BrowserShell.tsx`
  - 引入 `syncBrowserLifecycle()` 作为唯一显隐同步入口
  - overlay 检测不再直接调用 `browser:show/hide`，改为更新 `canShow`
  - resize 只触发生命周期同步，不再手写第二条 IPC 分支
  - 组件卸载时显式隐藏可见 view，避免 panel 关闭后残留显示

### 4.3 Session 切换清理
- `src/renderer/src/components/layout/MainLayout.tsx`
  - 在 session 变化时先 `resetBrowserWorkspace({ closePanel: true })`
  - 再通过 `cleanupBrowserSessionViews()` 批量 `hide + destroy` 旧 views
- `src/renderer/src/services/browser-session-cleanup.ts`
  - 统一 session cleanup，返回 `cleanedViewIds / failedViewIds`

## 5. 已知边界条件
- 当前 `browser:list-tabs` 仍是全局视图列表，而不是真正的 session-scoped tabs。
- 因此本轮在 session 切换时采用“主动关闭 panel + 主动清理旧 views”的保守策略，优先保证不残留 BrowserView。
- overlay 检测仍基于 DOM heuristic（如 `[role="dialog"]` / portal selector），后续如果 UI 组件库引入新的遮罩容器，需要同步补 selector。
- Canvas 浏览器链路继续复用 main 侧 `BrowserViewManager` 的 attach/detach/dispose 保护，本轮未重写 canvas tab 模型。

## 6. 代码落点
- Main：`src/main/services/browser-view.service.ts`
- Renderer helper：`src/renderer/src/components/panels/browser-panel-lifecycle.ts`
- Browser panel：`src/renderer/src/components/browser/BrowserShell.tsx`
- Session cleanup：`src/renderer/src/components/layout/MainLayout.tsx`、`src/renderer/src/services/browser-session-cleanup.ts`
- Troubleshooting：`docs/troubleshooting.md`
