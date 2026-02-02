# CodeAll 功能修复与问题诊断计划

## TL;DR

> **Quick Summary**: 修复 CodeAll 项目的 IPC 通道不匹配、Provider 硬编码、组件重复等问题，恢复软件全部功能。
>
> **Deliverables**:
>
> - IPC 通道完全对齐，前后端通信正常
> - 使用现有 ModelResolver 替换硬编码 Provider
> - 清理重复组件和状态管理目录
> - 关键修复的单元测试
>
> **Estimated Effort**: Medium (1-2 days)
> **Parallel Execution**: YES - 4 waves
> **Critical Path**: Task 1 → Task 2 → Task 3 → Task 5 → Task 10

---

## Context

### Original Request

对 CodeAll 软件项目进行全面诊断与修复，解决当前存在的严重功能与界面问题。尽管项目已成功编译并运行，但所有功能模块均无法正常使用。

### Interview Summary

**Key Discussions**:

- **范围确认**: 仅修复当前问题，不集成参考项目新功能
- **测试策略**: 包含关键测试（IPC、ModelResolver）

**Research Findings**:

- IPC 通道名称不匹配是导致"所有功能失效"的根本原因
- Provider 硬编码导致非 Anthropic 模型无法使用
- 组件和状态管理存在重复，增加维护复杂度

### Metis Review

**Identified Gaps** (addressed):

- IPC 权威来源: 采用 Oracle 建议，IPC handlers 为权威，更新 preload 匹配
- 默认 Provider: 使用已有的 ModelResolver 逻辑，不硬编码
- 规范目录: `layout/Sidebar.tsx` 和 `artifact/` 为规范版本

### Momus Review (Round 1)

**Blocking Issues Fixed**:

1. ✅ 测试路径: 改用 `tests/` 目录（匹配 Vitest 配置）
2. ✅ IPC 注册分散: 明确共享定义为对齐基准，测试只校验 renderer 暴露集合
3. ✅ ModelResolver: 发现已存在 `src/main/services/llm/model-resolver.ts`，改为扩展使用而非新建

---

## Work Objectives

### Core Objective

修复 CodeAll 的 IPC 通信、模型解析和组件结构问题，使软件恢复完整功能。

### Concrete Deliverables

- `src/shared/ipc-channels.ts` - 共享 IPC 通道定义（区分 invoke/event 通道）
- `src/main/preload.ts` - 更新后的白名单（使用共享定义）
- `src/main/ipc/index.ts` - 完整的 handler 注册
- 修改 `src/main/ipc/handlers/message.ts` - 使用现有 ModelResolver
- 修改 `src/main/services/workforce/workforce-engine.ts` - 使用现有 ModelResolver
- 清理后的组件和状态管理目录

### Definition of Done

- [x] 所有 preload 白名单通道在 IPC 中有对应 handler
- [x] `pnpm dev` 启动后，基本功能（创建 Space、发送消息、模型配置）正常工作
- [x] 非 Anthropic 模型（OpenAI、Google）可正常使用
- [x] 关键测试通过：`pnpm test`

### Must Have

- IPC 通道完全对齐
- Provider 硬编码移除
- 使用现有 ModelResolver 服务
- 重复组件清理

### Must NOT Have (Guardrails)

- 不添加新功能
- 不集成参考项目代码
- 不修改用户可见行为（除恢复功能外）
- 不引入新的配置格式
- 不进行大规模架构重构
- 不新建 ModelResolver（使用现有 `src/main/services/llm/model-resolver.ts`）

---

## Verification Strategy (MANDATORY)

### Test Decision

- **Infrastructure exists**: YES (Vitest + Playwright)
- **User wants tests**: YES (关键测试)
- **Framework**: Vitest (单元测试)
- **Test Location**: `tests/` 目录（匹配 `vitest.config.ts` 的 `include: ['tests/**/*.{test,spec}.{js,ts,tsx}']`）

### Automated Verification Only

所有验收标准均可由 Agent 自动执行，无需用户手动操作。

**验证类型对应工具**:
| Type | Tool | Method |
|------|------|--------|
| IPC 通道 | Vitest | 单元测试（`tests/unit/ipc/`） |
| 模型解析 | Vitest | 扩展现有测试（`tests/unit/services/llm/model-resolver.test.ts`） |
| 前端功能 | Playwright | E2E 测试 |
| 编译检查 | TypeScript | `pnpm build` |

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately):
├── Task 1: 创建共享 IPC 通道定义
└── Task 4: 创建 IPC 通道对齐测试

Wave 2 (After Wave 1):
├── Task 2: 对齐 Preload 白名单 (depends: 1)
├── Task 3: 补全 IPC Handler 注册 (depends: 1)
└── Task 5: 修复 Message Handler Provider 硬编码 (no blocking deps)

Wave 3 (After Wave 2):
├── Task 6: 修复 WorkforceEngine Provider 硬编码 (depends: 5)
├── Task 7: 清理重复 Sidebar 组件 (no deps)
└── Task 8: 清理重复 artifacts 目录 (no deps)

Wave 4 (After Wave 3):
├── Task 9: 整合状态管理目录 (depends: 7, 8)
└── Task 10: 最终集成验证 (depends: all)

Critical Path: Task 1 → Task 2 → Task 3 → Task 5 → Task 10
```

### Dependency Matrix

| Task | Depends On    | Blocks  | Can Parallelize With |
| ---- | ------------- | ------- | -------------------- |
| 1    | None          | 2, 3, 4 | 4                    |
| 2    | 1             | 10      | 3, 5                 |
| 3    | 1             | 10      | 2, 5                 |
| 4    | 1             | 10      | None (after 1)       |
| 5    | None          | 6, 10   | 2, 3                 |
| 6    | 5             | 10      | 7, 8                 |
| 7    | None          | 9       | 6, 8                 |
| 8    | None          | 9       | 6, 7                 |
| 9    | 7, 8          | 10      | 6                    |
| 10   | 2, 3, 5, 6, 9 | None    | None (final)         |

---

## TODOs

- [x] 1. 创建共享 IPC 通道定义

  **What to do**:
  - 创建 `src/shared/ipc-channels.ts`
  - 定义所有 IPC 通道常量，区分类型：
    - `INVOKE_CHANNELS`: 用于 `ipcMain.handle` / `ipcRenderer.invoke`
    - `EVENT_CHANNELS`: 用于 `ipcMain.on` / `webContents.send`
    - `INTERNAL_CHANNELS`: 仅 main 进程内部使用，不暴露给 renderer
  - 整理来源：
    - `src/main/preload.ts:8-68` - 当前白名单
    - `src/main/ipc/index.ts` - 主注册
    - `src/main/index.ts:163-165` - updater handlers
    - 各 `register*Handlers()` 函数内部注册

  **Must NOT do**:
  - 不添加新通道（仅整理现有）
  - 不修改通道语义

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
    - Reason: 需要收集多个文件的通道定义，整理分类
  - **Skills**: [`git-master`]
    - `git-master`: 修复完成后需要原子提交

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 4)
  - **Blocks**: Tasks 2, 3, 4
  - **Blocked By**: None

  **References**:
  - `src/main/preload.ts:8-68` - 当前 ALLOWED_CHANNELS 数组
  - `src/main/ipc/index.ts:40-91` - 主 IPC 注册
  - `src/main/index.ts:163-165` - updater handlers 直接注册
  - `src/main/ipc/handlers/space.ts` - `registerSpaceHandlers()` 内部注册
  - `src/main/ipc/handlers/artifact.ts` - `registerArtifactHandlers()` 内部注册
  - `src/main/ipc/handlers/audit-log.ts` - `registerAuditLogHandlers()` 内部注册

  **Acceptance Criteria**:
  - [ ] 文件创建: `src/shared/ipc-channels.ts`
  - [ ] 导出三类通道常量: `INVOKE_CHANNELS`, `EVENT_CHANNELS`, `INTERNAL_CHANNELS`
  - [ ] TypeScript 编译通过:
    ```bash
    pnpm tsc --noEmit
    # Assert: Exit code 0, no errors
    ```

  **Commit**: YES
  - Message: `feat(shared): add centralized IPC channel definitions with type classification`
  - Files: `src/shared/ipc-channels.ts`
  - Pre-commit: `pnpm tsc --noEmit`

---

- [x] 2. 对齐 Preload 白名单与 IPC 注册

  **What to do**:
  - 更新 `src/main/preload.ts` 使用共享通道定义
  - 确保 `router:set-rules` 改为 `router:save-rules`（匹配 IPC 注册）
  - 移除未实现的通道或确保它们有对应 handler

  **Must NOT do**:
  - 不添加新的 IPC 功能
  - 不改变 contextIsolation 配置

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 简单的导入替换和常量对齐
  - **Skills**: [`git-master`]
    - `git-master`: 原子提交

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 3, 5)
  - **Blocks**: Task 10
  - **Blocked By**: Task 1

  **References**:
  - `src/main/preload.ts:8-68` - 当前白名单实现
  - `src/shared/ipc-channels.ts` - Task 1 创建的共享定义
  - `src/main/ipc/index.ts:67` - 实际注册的是 `router:save-rules`
  - `src/main/preload.ts:67` - 白名单中是 `router:set-rules`（不匹配！）

  **Acceptance Criteria**:
  - [ ] Preload 导入并使用 `INVOKE_CHANNELS` 和 `EVENT_CHANNELS`
  - [ ] `router:set-rules` 改为 `router:save-rules`
  - [ ] 对齐测试通过:
    ```bash
    pnpm test tests/unit/ipc/ipc-alignment.test.ts
    # Assert: PASS
    ```
  - [ ] TypeScript 编译通过:
    ```bash
    pnpm tsc --noEmit
    # Assert: Exit code 0
    ```

  **Commit**: YES
  - Message: `fix(preload): align channel whitelist with IPC handlers using shared definitions`
  - Files: `src/main/preload.ts`
  - Pre-commit: `pnpm tsc --noEmit`

---

- [x] 3. 补全缺失的 IPC Handler 注册

  **What to do**:
  - 检查 preload 白名单中的每个通道，确保有对应 handler
  - 补全缺失的 handlers:
    - `task:create` - 如 preload 需要，添加 handler 或从 preload 移除
    - `task:get` - 同上
    - `task:update` - 同上
    - `session:update` - 检查是否缺失
    - `session:delete` - 检查是否缺失
  - 使用共享通道定义验证完整性

  **Must NOT do**:
  - 不实现复杂业务逻辑（简单实现或移除未用通道）
  - 不改变现有 handler 行为

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
    - Reason: 需要创建/注册多个 handlers，略复杂于 quick
  - **Skills**: [`git-master`]
    - `git-master`: 原子提交

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 2, 5)
  - **Blocks**: Task 10
  - **Blocked By**: Task 1

  **References**:
  - `src/main/ipc/index.ts` - 当前注册逻辑
  - `src/main/ipc/handlers/task.ts` - 现有 task handlers（仅 `handleTaskList`）
  - `src/main/ipc/handlers/session.ts` - 现有 session handlers
  - `src/shared/ipc-channels.ts` - Task 1 的共享定义

  **Acceptance Criteria**:
  - [ ] 所有 `INVOKE_CHANNELS` 有对应 `ipcMain.handle` 或从 preload 移除
  - [ ] 对齐测试通过:
    ```bash
    pnpm test tests/unit/ipc/ipc-alignment.test.ts
    # Assert: PASS
    ```
  - [ ] TypeScript 编译通过:
    ```bash
    pnpm tsc --noEmit
    # Assert: Exit code 0
    ```

  **Commit**: YES
  - Message: `fix(ipc): register missing handlers for task and session channels`
  - Files: `src/main/ipc/index.ts`, `src/main/ipc/handlers/*.ts`
  - Pre-commit: `pnpm tsc --noEmit`

---

- [x] 4. 创建 IPC 通道对齐测试

  **What to do**:
  - 创建 `tests/unit/ipc/ipc-alignment.test.ts`（符合 Vitest 配置）
  - 测试目标：验证"renderer 暴露的通道集合"与"实际注册的 handler"一致
  - 测试逻辑：
    - 导入 `INVOKE_CHANNELS` 和 `EVENT_CHANNELS` 从共享定义
    - 对每个通道验证存在对应的 handler 注册
  - 作为 CI 守护，防止未来不匹配

  **Must NOT do**:
  - 不测试业务逻辑
  - 不进行 E2E 测试
  - 不检查 INTERNAL_CHANNELS（它们不暴露给 renderer）

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 单一测试文件，逻辑简单
  - **Skills**: [`git-master`]
    - `git-master`: 原子提交

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (after Task 1 starts)
  - **Blocks**: Task 10
  - **Blocked By**: Task 1

  **References**:
  - `src/shared/ipc-channels.ts` - Task 1 创建的共享定义
  - `vitest.config.ts:9` - 测试 include 路径：`tests/**/*.{test,spec}.{js,ts,tsx}`
  - `tests/unit/ipc/audit-log-ipc.test.ts` - 现有 IPC 测试示例

  **Acceptance Criteria**:
  - [ ] 测试文件创建: `tests/unit/ipc/ipc-alignment.test.ts`
  - [ ] 测试通过:
    ```bash
    pnpm test tests/unit/ipc/ipc-alignment.test.ts
    # Assert: PASS
    ```

  **Commit**: YES
  - Message: `test(ipc): add alignment test for preload-IPC channel consistency`
  - Files: `tests/unit/ipc/ipc-alignment.test.ts`
  - Pre-commit: `pnpm test tests/unit/ipc/ipc-alignment.test.ts`

---

- [x] 5. 修复 Message Handler 中的 Provider 硬编码

  **What to do**:
  - 修改 `src/main/ipc/handlers/message.ts`
  - 移除 `as 'anthropic'` 类型强转（第 85 行）
  - 使用现有 `src/main/services/llm/model-resolver.ts` 的 `resolveModelWithFallback` 函数
  - 创建一个辅助函数从 DB 模型 + ProviderCache 构建 `availableModels` Set

  **Must NOT do**:
  - 不改变消息流程逻辑
  - 不添加新的消息功能
  - 不新建 ModelResolver（使用现有的！）

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
    - Reason: 需要理解现有 ModelResolver 并正确集成
  - **Skills**: [`git-master`]
    - `git-master`: 原子提交

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 2, 3)
  - **Blocks**: Tasks 6, 10
  - **Blocked By**: None

  **References**:
  - `src/main/ipc/handlers/message.ts:85-87` - 硬编码位置:
    ```typescript
    const adapter = createLLMAdapter(resolvedModel.provider as 'anthropic', {...})
    ```
  - `src/main/services/llm/model-resolver.ts` - 现有 ModelResolver:
    - `resolveModelWithFallback()` - 主要解析函数
    - `DEFAULT_FALLBACK_CHAINS` - 预定义的 fallback 链
  - `src/main/services/llm/factory.ts` - `createLLMAdapter` 函数
  - `tests/unit/services/llm/model-resolver.test.ts` - 现有测试

  **Acceptance Criteria**:
  - [ ] 移除 `as 'anthropic'` 类型强转
  - [ ] 导入并使用 `resolveModelWithFallback`
  - [ ] 现有测试仍通过:
    ```bash
    pnpm test tests/unit/services/llm/model-resolver.test.ts
    # Assert: PASS
    ```
  - [ ] TypeScript 编译通过:
    ```bash
    pnpm tsc --noEmit
    # Assert: Exit code 0
    ```

  **Commit**: YES
  - Message: `fix(message): use existing ModelResolver instead of hardcoded Anthropic provider`
  - Files: `src/main/ipc/handlers/message.ts`
  - Pre-commit: `pnpm test tests/unit/services/llm/model-resolver.test.ts && pnpm tsc --noEmit`

---

- [x] 6. 修复 WorkforceEngine 中的 Provider 硬编码

  **What to do**:
  - 修改 `src/main/services/workforce/workforce-engine.ts`
  - `decomposeTask` 方法移除硬编码 `provider: 'anthropic'` 查询（第 46 行）
  - 使用现有 `ModelResolver.resolveModelWithFallback()` 和 `DEFAULT_FALLBACK_CHAINS.orchestrator`
  - 确保当无 Anthropic 时可以 fallback 到 OpenAI/Google

  **Must NOT do**:
  - 不改变任务分解逻辑
  - 不添加新的编排功能
  - 不新建 ModelResolver

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
    - Reason: 需要理解 WorkforceEngine 上下文
  - **Skills**: [`git-master`]
    - `git-master`: 原子提交

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 7, 8)
  - **Blocks**: Task 10
  - **Blocked By**: Task 5

  **References**:
  - `src/main/services/workforce/workforce-engine.ts:46` - 硬编码查询:
    ```typescript
    this.prisma.model.findFirst({ where: { provider: 'anthropic' } })
    ```
  - `src/main/services/llm/model-resolver.ts:147-172` - `DEFAULT_FALLBACK_CHAINS.orchestrator`
  - `tests/unit/services/workforce/workforce-engine.test.ts` - 现有测试

  **Acceptance Criteria**:
  - [ ] 移除 `provider: 'anthropic'` 硬编码查询
  - [ ] 使用 `DEFAULT_FALLBACK_CHAINS.orchestrator` 进行 fallback
  - [ ] 现有测试仍通过:
    ```bash
    pnpm test tests/unit/services/workforce/workforce-engine.test.ts
    # Assert: PASS
    ```
  - [ ] TypeScript 编译通过:
    ```bash
    pnpm tsc --noEmit
    # Assert: Exit code 0
    ```

  **Commit**: YES
  - Message: `fix(workforce): use ModelResolver fallback chain for task decomposition`
  - Files: `src/main/services/workforce/workforce-engine.ts`
  - Pre-commit: `pnpm test tests/unit/services/workforce/workforce-engine.test.ts`

---

- [x] 7. 清理重复 Sidebar 组件

  **What to do**:
  - 使用 LSP/grep 确认 `src/renderer/src/components/Sidebar.tsx` 无引用
  - 删除孤儿文件 `src/renderer/src/components/Sidebar.tsx`
  - 保留规范版本 `src/renderer/src/components/layout/Sidebar.tsx`

  **Must NOT do**:
  - 不重构 Sidebar 功能
  - 不修改规范版本

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 简单的引用检查和文件删除
  - **Skills**: [`git-master`]
    - `git-master`: 原子提交

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 6, 8)
  - **Blocks**: Task 9
  - **Blocked By**: None

  **References**:
  - `src/renderer/src/components/Sidebar.tsx` - 待删除的孤儿组件（96 行，带 `fixed` 定位）
  - `src/renderer/src/components/layout/Sidebar.tsx` - 规范版本（62 行）
  - `src/renderer/src/components/layout/MainLayout.tsx:2` - 导入规范版本

  **Acceptance Criteria**:
  - [ ] Grep 确认无引用:
    ```bash
    grep -r "from.*components/Sidebar" src/renderer/ --include="*.ts" --include="*.tsx" | grep -v "layout/Sidebar"
    # Assert: No matches (empty output)
    ```
  - [ ] 删除孤儿文件: `src/renderer/src/components/Sidebar.tsx`
  - [ ] TypeScript 编译通过:
    ```bash
    pnpm tsc --noEmit
    # Assert: Exit code 0
    ```

  **Commit**: YES
  - Message: `refactor(ui): remove duplicate Sidebar component`
  - Files: (deleted) `src/renderer/src/components/Sidebar.tsx`
  - Pre-commit: `pnpm tsc --noEmit`

---

- [x] 8. 清理重复 artifacts 目录

  **What to do**:
  - 确认 `src/renderer/src/components/artifacts/` 目录无引用
  - 删除重复目录 `src/renderer/src/components/artifacts/`
  - 保留规范版本 `src/renderer/src/components/artifact/`

  **Must NOT do**:
  - 不合并两个目录的功能
  - 不修改规范版本

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 简单的引用检查和目录删除
  - **Skills**: [`git-master`]
    - `git-master`: 原子提交

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 6, 7)
  - **Blocks**: Task 9
  - **Blocked By**: None

  **References**:
  - `src/renderer/src/components/artifacts/` - 待删除的重复目录（含 MediaPreview, FileTree, MarkdownPreview, CodePreview）
  - `src/renderer/src/components/artifact/` - 规范版本（含 ArtifactRail, previews/, FileTree）
  - `src/renderer/src/components/layout/MainLayout.tsx:4` - 导入规范版本 `artifact/ArtifactRail`

  **Acceptance Criteria**:
  - [ ] Grep 确认无引用:
    ```bash
    grep -r "from.*components/artifacts" src/renderer/ --include="*.ts" --include="*.tsx"
    # Assert: No matches (empty output), or update imports first
    ```
  - [ ] 删除重复目录: `src/renderer/src/components/artifacts/`
  - [ ] TypeScript 编译通过:
    ```bash
    pnpm tsc --noEmit
    # Assert: Exit code 0
    ```

  **Commit**: YES
  - Message: `refactor(ui): remove duplicate artifacts directory`
  - Files: (deleted) `src/renderer/src/components/artifacts/`
  - Pre-commit: `pnpm tsc --noEmit`

---

- [x] 9. 整合状态管理目录

  **What to do**:
  - 将 `src/renderer/src/stores/` 中的文件移动到 `src/renderer/src/store/`
  - 需要移动的文件:
    - `stores/updater.store.ts` → `store/updater.store.ts`
    - `stores/session.store.ts` → `store/session.store.ts`
    - `stores/config.store.ts` → `store/config.store.ts`
  - 更新所有导入路径
  - 创建统一的 barrel export `src/renderer/src/store/index.ts`（可选）
  - 删除空的 `stores/` 目录

  **Must NOT do**:
  - 不重构 store 逻辑
  - 不改变状态管理模式

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
    - Reason: 需要更新多个导入
  - **Skills**: [`git-master`]
    - `git-master`: 原子提交

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (after cleanup)
  - **Blocks**: Task 10
  - **Blocked By**: Tasks 7, 8

  **References**:
  - `src/renderer/src/store/` - 目标目录（现有: ui.store, data.store, artifact.store, agent.store）
  - `src/renderer/src/stores/` - 源目录（updater.store, session.store, config.store）

  **Acceptance Criteria**:
  - [ ] 所有 store 文件在 `src/renderer/src/store/` 目录
  - [ ] 所有导入更新:
    ```bash
    grep -r "from.*stores/" src/renderer/ --include="*.ts" --include="*.tsx"
    # Assert: No matches
    ```
  - [ ] TypeScript 编译通过:
    ```bash
    pnpm tsc --noEmit
    # Assert: Exit code 0
    ```

  **Commit**: YES
  - Message: `refactor(state): consolidate stores into single directory`
  - Files: `src/renderer/src/store/*`, (deleted) `src/renderer/src/stores/`
  - Pre-commit: `pnpm tsc --noEmit`

---

- [x] 10. 最终集成验证

  **What to do**:
  - 运行完整测试套件
  - 启动应用进行功能验证
  - 验证核心功能：
    - 创建 Space
    - 创建 Session
    - 发送消息（使用配置的模型）
    - 模型设置保存

  **Must NOT do**:
  - 不进行新功能开发
  - 不进行性能优化

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 验证性任务，执行测试命令
  - **Skills**: [`playwright`]
    - `playwright`: E2E 验证

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (final)
  - **Blocks**: None
  - **Blocked By**: Tasks 2, 3, 5, 6, 9

  **References**:
  - `playwright.config.ts` - E2E 测试配置
  - `vitest.config.ts` - 单元测试配置

  **Acceptance Criteria**:
  - [ ] 单元测试全部通过:
    ```bash
    pnpm test
    # Assert: All tests pass
    ```
  - [ ] TypeScript 编译无错误:
    ```bash
    pnpm build
    # Assert: Exit code 0
    ```
  - [ ] E2E 基础验证（通过 Playwright）:
    ```
    # Agent 使用 playwright skill 执行:
    1. 启动开发服务器: pnpm dev (在后台)
    2. 等待服务器就绪 (等待 http://localhost:5173)
    3. Navigate to: http://localhost:5173
    4. 验证主界面加载（TopNavigation 可见）
    5. Screenshot: .sisyphus/evidence/final-verification.png
    ```

  **Commit**: NO (验证任务，无代码更改)

---

## Commit Strategy

| After Task | Message                                                                            | Files                                  | Verification        |
| ---------- | ---------------------------------------------------------------------------------- | -------------------------------------- | ------------------- |
| 1          | `feat(shared): add centralized IPC channel definitions with type classification`   | `src/shared/ipc-channels.ts`           | `pnpm tsc --noEmit` |
| 2          | `fix(preload): align channel whitelist with IPC handlers using shared definitions` | `src/main/preload.ts`                  | `pnpm tsc --noEmit` |
| 3          | `fix(ipc): register missing handlers for task and session channels`                | `src/main/ipc/*.ts`                    | `pnpm tsc --noEmit` |
| 4          | `test(ipc): add alignment test for preload-IPC channel consistency`                | `tests/unit/ipc/ipc-alignment.test.ts` | `pnpm test`         |
| 5          | `fix(message): use existing ModelResolver instead of hardcoded Anthropic provider` | `src/main/ipc/handlers/message.ts`     | `pnpm test`         |
| 6          | `fix(workforce): use ModelResolver fallback chain for task decomposition`          | `src/main/services/workforce/*.ts`     | `pnpm test`         |
| 7          | `refactor(ui): remove duplicate Sidebar component`                                 | (deleted file)                         | `pnpm tsc --noEmit` |
| 8          | `refactor(ui): remove duplicate artifacts directory`                               | (deleted directory)                    | `pnpm tsc --noEmit` |
| 9          | `refactor(state): consolidate stores into single directory`                        | `src/renderer/src/store/*`             | `pnpm tsc --noEmit` |

---

## Success Criteria

### Verification Commands

```bash
# 1. 编译检查
pnpm tsc --noEmit
# Expected: Exit code 0, no errors

# 2. 单元测试
pnpm test
# Expected: All tests pass

# 3. 构建
pnpm build
# Expected: Success, no errors

# 4. 开发模式启动
pnpm dev
# Expected: App launches, no console errors
```

### Final Checklist

- [x] 所有 IPC 通道对齐（使用共享定义）
- [x] Provider 硬编码已移除（使用现有 ModelResolver）
- [x] 重复组件已清理（Sidebar、artifacts）
- [x] 状态管理已整合（单一 store 目录）
- [x] 所有测试通过
- [x] 应用可正常启动和使用
