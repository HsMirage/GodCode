# WP-03 恢复链统一 验收记录

## 1. 基本信息
- 工作包：`WP-03 恢复链统一`
- 日期：`2026-03-06`
- 范围：`session-continuity` / `task-continuation` / `auto-resume-trigger` / `session-state-recovery` / `resume-context-restoration` / renderer 恢复提示

## 2. 变更摘要
- 新增共享恢复契约，统一 `resumeReason / recoverySource / recoveryStage / resumeAction`。
- 在 crash recovery 与 manual resume 两条主链中，把统一恢复字段写入 task metadata 与 message metadata。
- 将 `AutoResumeTriggerService` 收敛为 trigger-only 角色，通过 `ResumeContextRestorationService` 读取工作摘要。
- 修复 `SessionRecoveryPrompt` 的死 IPC，改用现有 `session-recovery:list / execute / resume-prompt` 主链。
- 更新 `SessionResumeIndicator`，展示恢复来源 / 原因 / 动作，并修正进度统计。

## 3. 验收结果
- `tests/unit/services/session-continuity.service.test.ts` 覆盖 crash 检测、失败恢复、pending/running task 状态修正与 metadata 打标。
- `tests/unit/services/auto-resume-trigger.test.ts` 覆盖 idle 触发、无工作不触发、去重冷却。
- `tests/unit/services/session-state-recovery.test.ts` 与 `tests/unit/services/resume-context-restoration.test.ts` 覆盖统一恢复字段与 resume prompt 输出。
- `tests/unit/renderer/session-resume-indicator.test.tsx` 与 `tests/unit/renderer/session-recovery-prompt.test.tsx` 覆盖 manual/crash 两类 UI 恢复入口。
- `tests/e2e/session-workflow.spec.ts -g "manual resume sends continuation prompt through message pipeline"` 通过，说明手动恢复链仍能经由 `message:send` 闭环。

## 4. 执行命令
```bash
pnpm exec vitest run tests/unit/renderer/session-recovery-prompt.test.tsx tests/unit/ipc/task-continuation-ipc.test.ts tests/unit/renderer/session-resume-indicator.test.tsx tests/unit/ipc/message-ipc.test.ts tests/unit/services/auto-resume-trigger.test.ts tests/unit/services/session-state-recovery.test.ts tests/unit/services/resume-context-restoration.test.ts tests/unit/services/session-continuity.service.test.ts
pnpm exec vitest run tests/unit/ipc/session-continuity-ipc.test.ts
pnpm exec playwright test tests/e2e/session-workflow.spec.ts -g "manual resume sends continuation prompt through message pipeline"
```

## 5. 类型检查说明
- `pnpm exec tsc --noEmit` 仍存在仓库既有错误，主要位于：`src/main/services/hooks/manager.ts`、`src/renderer/src/pages/ChatPage.tsx`、`tests/e2e/fixtures/electron.ts`、`tests/unit/services/workforce/workflow-observability-writer.test.ts`。
- 本轮新增代码引入的类型错误已消除。

## 6. 风险与结论
- 风险：恢复契约里的 `prompt-ready` 仍保留用于兼容旧调用，后续可在清理引用后进一步收敛枚举。
- 结论：WP-03 已完成统一恢复字段、主链透传、UI 修复、continuity recovery executor 外提与专项测试闭环。
