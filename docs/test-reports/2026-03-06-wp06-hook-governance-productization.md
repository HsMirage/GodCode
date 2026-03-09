# WP-06 Hook 治理产品化验收记录

## 1. 基本信息
- 工作包：`WP-06 Hook 治理产品化`
- 日期：`2026-03-06`
- 范围：`hooks/governance` / `hooks/manager` / `workflow-observability IPC` / `event-bridge` / `SettingsPage` / `shims`

## 2. 验收结果
- `tests/unit/services/hooks/manager.test.ts`
  - 覆盖 Hook timeout / 熔断降级链路
  - 覆盖按 Hook 策略配置的 `timeoutMs / failureThreshold / cooldownMs`
  - 覆盖运行态 `circuitState / lastStatus / circuitOpenUntil` 可见
- `tests/unit/services/hooks/governance.test.ts`
  - 覆盖 Hook 开关、优先级、策略更新
  - 覆盖重启后治理快照恢复
  - 覆盖恢复后对“后注册 Hook”套用缓存治理策略
- `tests/unit/ipc/workflow-observability-ipc.test.ts`
  - 覆盖 Hook 治理 IPC 输入归一化
  - 覆盖嵌套 `strategy` 字段透传
- `tests/unit/services/workforce/workflow-observability-writer.test.ts`
  - 现有 observability writer 回归继续通过，说明 Hook 治理改动未破坏 workflow observability 写入链路

## 3. 执行命令
```bash
pnpm vitest run tests/unit/services/hooks/manager.test.ts tests/unit/services/hooks/governance.test.ts tests/unit/ipc/workflow-observability-ipc.test.ts tests/unit/services/workforce/workflow-observability-writer.test.ts
pnpm exec eslint src/shared/hook-governance-contract.ts src/main/services/hooks/types.ts src/main/services/hooks/manager.ts src/main/services/hooks/governance.ts src/main/services/hooks/index.ts src/main/services/hooks/rules-injector.hook.ts src/main/services/hooks/todo-continuation.hook.ts src/main/services/hooks/context-window-monitor.ts src/main/services/hooks/edit-error-recovery.ts src/main/services/hooks/tool-output-truncator.ts src/main/services/hooks/stop-signal.hook.ts src/main/services/hooks/claude-code/adapter.ts src/main/ipc/handlers/workflow-observability.ts src/main/services/event-bridge.service.ts src/renderer/src/pages/SettingsPage.tsx src/renderer/src/types/shims.d.ts tests/unit/services/hooks/governance.test.ts tests/unit/services/hooks/manager.test.ts tests/unit/ipc/workflow-observability-ipc.test.ts
pnpm exec tsc --noEmit --pretty false
```

## 4. lint 说明
- 本轮相关文件 `eslint` 无 error。
- 仍有若干仓库既有 `no-explicit-any` / `react-hooks/exhaustive-deps` warning，主要位于旧 shim、旧测试与历史页面代码，本轮未新增 lint error。

## 5. 类型检查说明
- `pnpm exec tsc --noEmit --pretty false` 仍存在仓库既有错误：
  - `src/renderer/src/components/browser/BrowserShell.tsx`
  - `src/renderer/src/pages/ChatPage.tsx`
  - `tests/e2e/fixtures/electron.ts`
  - `tests/unit/services/browser-view.test.ts`
- 本轮 `WP-06` 相关文件未新增新的 TypeScript 错误；已对 `hooks/*`、`event-bridge.service.ts`、`SettingsPage.tsx`、`shims.d.ts` 做定向核验。

## 6. 结论
- WP-06 已完成 Hook 治理共享契约、配置持久化、运行态展示、设置页治理与定向测试闭环。
- 现在可以在设置页直接验证 Hook 开关是否生效、重启后是否恢复、熔断是否打开、何时恢复，以及最近一次执行证据链。
