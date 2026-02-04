# Learnings

## 2026-02-02 Task: Initial Setup

- 项目使用 pnpm 10.11.0
- 测试位于 `tests/` 目录（匹配 vitest.config.ts）
- 现有 ModelResolver 位于 `src/main/services/llm/model-resolver.ts`

## 2026-02-03 Task: Consolidate stores directory

- 状态管理目录统一为 `src/renderer/src/store/`，移动原 `stores/` 文件并更新引用。
- 验证命令 `pnpm tsc --noEmit` 可用于确认类型检查通过。

## 2026-02-03 Task: Update WorkforceEngine tests

- WorkforceEngine 使用 `prisma.model.findMany` 返回模型数组，测试需 mock 数组并断言 where/orderBy 条件。
