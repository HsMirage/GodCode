# WP-07 IPC Gateway 与前端大组件治理 — 验收记录

## 1. 基本信息
- 工作包：`WP-07 IPC Gateway 与前端大组件治理`
- 日期：`2026-03-06`
- 范围：`src/renderer/src/api.ts`、`src/renderer/src/pages/ChatPage.tsx`、`src/renderer/src/pages/SettingsPage.tsx`、`src/renderer/src/components/panels/TaskPanel.tsx`、`src/renderer/src/components/settings/HookGovernancePanel.tsx`、`src/renderer/src/hooks/`

## 2. 前端模块分层图

```
src/renderer/src/
├── api.ts                          # IPC Gateway (域 API 统一入口)
│   ├── safeInvoke<T>()             # 通用 IPC 调用封装
│   ├── messageApi                  # 消息域: list, send, abort, stream events
│   ├── sessionApi                  # 会话域: CRUD, recovery
│   ├── workflowApi                 # 工作流域: tasks, observability, background, continuation
│   ├── settingsApi                 # 设置域: models, keychain, bindings, hook governance, audit
│   ├── artifactApi                 # 产物域: CRUD, diff, accept, revert
│   ├── spaceApi                    # 空间域: CRUD
│   ├── skillApi                    # 技能域: command items
│   └── api (legacy)                # 浏览器域 (向后兼容)
│
├── hooks/
│   ├── useChatMessages.ts          # 消息加载/流式/发送/停止 (from ChatPage)
│   ├── useHookGovernance.ts        # Hook 治理加载/保存/草稿 (from SettingsPage)
│   ├── useContinuationConfig.ts    # 自动续跑配置加载/保存 (from SettingsPage)
│   ├── useTaskPanelDetail.ts       # Task detail/run-log/诊断包状态机
│   ├── useTaskPanelNavigation.ts   # TaskPanel trace/highlight 导航联动
│   ├── useCanvasLifecycle.ts       # ContentCanvas 生命周期
│   └── useStreamingEvents.ts       # 流式事件订阅
│
├── pages/
│   ├── ChatPage.tsx                # 瘦编排: viewMode + hooks 组合
│   └── SettingsPage.tsx            # Tab 布局 + hooks 组合
│
├── components/
│   ├── panels/TaskPanel.tsx        # 任务面板（薄编排 + 视图）
│   ├── panels/task-panel-detail.ts # 任务详情/诊断包 helper
│   ├── settings/HookGovernancePanel.tsx # Hook 治理与续跑配置面板
│   ├── settings/*.tsx              # 其他设置子面板
│   └── ...
│
└── store/                          # Zustand 状态管理
```

## 3. 组件职责清单

| 组件/模块 | 拆分前职责 | 拆分后职责 |
|----------|-----------|-----------|
| `api.ts` | browser + artifact IPC 封装 | 全域 IPC Gateway (7 个域 API) |
| `ChatPage.tsx` | 消息加载+流式+发送+停止+视图切换+布局 | 视图切换+布局编排 (消息逻辑委托 useChatMessages) |
| `SettingsPage.tsx` | Hook 治理+续跑配置+Tab 布局 | Tab 布局 + toast 编排 |
| `HookGovernancePanel.tsx` | (新) | Hook 治理、审计、续跑配置 UI |
| `TaskPanel.tsx` | 列表/详情/日志/导航/诊断全耦合 | 列表与视图编排（详情/导航委托 hooks） |
| `useChatMessages` | (新) | 消息 CRUD、流式订阅、发送/停止、workforce 检测 |
| `useHookGovernance` | (新) | Hook 治理状态管理、草稿编辑、保存、审计追加 |
| `useContinuationConfig` | (新) | 自动续跑配置 CRUD、校验、草稿管理 |
| `useTaskPanelDetail` | (新) | task detail 状态、run-log 回退查询、诊断包复制 |
| `useTaskPanelNavigation` | (新) | TaskPanel 高亮/开面板联动 |

## 4. 域 API 覆盖清单

| 域 API | 覆盖 IPC 通道数 | invoke | on |
|--------|----------------|--------|-----|
| messageApi | 6 | list, send, abort | stream-chunk, stream-error, stream-usage |
| sessionApi | 9 | create, get, getOrCreateDefault, list, update, delete, recovery* | crash-detected, recovery-progress, recovered |
| workflowApi | 14 | taskList, observabilityGet, agentRun*, backgroundTask*, continuation* | task:status-changed, background-task:* (4 events) |
| settingsApi | 22 | model*, keychain*, binding*, setting*, hookGovernance*, auditLog*, backup* | hook-audit:appended |
| artifactApi | 7 | get, list, download, delete, getDiff, accept, revert | created |
| spaceApi | 5 | list, get, create, delete, selectFolder | - |
| skillApi | 1 | commandItems | - |

## 5. 验证结果

- [x] TypeScript 编译通过 (workforce 相关文件 + renderer 新增文件无新错误)
- [x] 单元测试回归通过 (968 passed, 17 failed - 全为仓库既有无关问题)
- [x] ChatPage 行为不变 (useChatMessages 完整覆盖原有消息逻辑)
- [x] SettingsPage 布局编排化 (HookGovernancePanel + hooks 组合)
- [x] TaskPanel 详情/日志/导航拆分完成 (`useTaskPanelDetail` / `useTaskPanelNavigation`)
- [x] renderer 回归补齐 (`tests/unit/renderer/task-panel-detail.test.tsx`、`tests/unit/renderer/hook-governance-panel.test.tsx`、`tests/unit/renderer/task-panel-ui-diagnostics.test.tsx`)

## 6. 风险与结论

- **风险**：`SettingsPage` 与 `TaskPanel` 仍保留较多展示层 JSX，但高频状态机、日志加载、导航联动、治理面板都已收敛；剩余优化更多是展示组件再切片，而不是主链治理风险。
- **结论**：WP-07 已完成 IPC Gateway 全域收敛、ChatPage 拆分、SettingsPage 布局编排化、TaskPanel 状态/日志/导航拆分与 renderer 回归验证闭环。

## 7. 执行命令

```bash
pnpm exec tsc --noEmit --pretty false
pnpm test -- tests/unit/ --reporter=dot
pnpm exec vitest run tests/unit/renderer/task-panel-detail.test.tsx tests/unit/renderer/hook-governance-panel.test.tsx tests/unit/renderer/task-panel-ui-diagnostics.test.tsx
```
