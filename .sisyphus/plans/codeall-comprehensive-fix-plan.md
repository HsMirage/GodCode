# CodeAll 综合修复计划

## TL;DR

> **Quick Summary**: 基于全面代码审查，修复CodeAll项目的5个关键阻塞点、安全漏洞、UI接线问题，并完善CI/CD流水线，使项目达到**完整生产级别**就绪状态。Linux Web版本延后实现。
>
> **Deliverables**:
>
> - 修复后可正常工作的聊天+工具调用闭环（含Streaming完整实现）
> - 安全加固的IPC通信层（含审计日志）
> - 正确接线的UI组件系统
> - 完整的CI/CD流水线
> - 统一的工具执行系统
> - 性能测试报告
> - 完整文档更新
>
> **Scope Exclusions**:
>
> - ❌ Linux远程Web访问版本（延后至下一阶段）
> - ❌ SUL-1.0许可证重写（作为技术债务记录）
>
> **Estimated Effort**: Large (预计3-4周)
> **Parallel Execution**: YES - 4 waves
> **Critical Path**: Task 1 → Task 3 → Task 4 → Task 7 → Task 8 → Task 17

## 用户决策记录

| 决策点        | 用户选择     | 影响                                      |
| ------------- | ------------ | ----------------------------------------- |
| 生产就绪定义  | 完整生产级别 | 需要安全审计、性能测试、CI/CD、完整文档   |
| Streaming工具 | 完整实现     | Task 4需要完整实现streaming中的tool calls |
| Linux Web版   | 延后实现     | 移除Task 13，减少工作量                   |
| 许可证冲突    | 暂时忽略     | 记录为技术债务，不在本计划范围内          |

---

## Context

### Original Request

对CodeAll项目进行全面代码审查，并根据审查结果生成详细的修复计划，确保项目符合最初的规划需求。

### Interview Summary

**Key Discussions**:

- 项目存在5个关键阻塞点导致核心功能不可用
- 安全漏洞需要优先修复（file:read任意文件读取）
- UI组件存在双实现问题（stub vs real）
- Linux Web版本完全缺失
- 合规问题需要明确项目定位

**Research Findings**:

- PathValidator已实现但未被file:read使用
- WorkforceEngine/DelegateEngine实现质量良好
- 测试框架完备（82个测试文件）
- 组件双实现导致真实功能未暴露

### Audit Review Summary

**Identified Gaps (addressed)**:

- 聊天流程未连接IPC → 修改ChatView组件
- Streaming不支持工具 → 实现工具循环
- SmartRouter未使用 → 集成到主流程
- 安全漏洞 → 添加路径验证
- UI未接线 → 统一组件并接入路由

---

## Work Objectives

### Core Objective

修复CodeAll项目的所有关键问题，使其成为一个功能完整、安全可靠、可交付的多LLM协同编程平台。

### Concrete Deliverables

- `src/renderer/src/components/layout/ChatView.tsx` - 连接IPC的真实聊天组件
- `src/main/services/llm/anthropic.adapter.ts` - 支持streaming工具调用
- `src/main/services/llm/openai.adapter.ts` - 添加工具循环
- `src/main/services/llm/gemini.adapter.ts` - 添加工具循环
- `src/main/ipc/handlers/artifact.ts` - 安全加固
- `src/main/services/tools/tool-execution.service.ts` - 统一工具执行服务
- `.github/workflows/ci.yml` - CI/CD流水线
- `src/main/services/hooks/hook-registry.ts` - Hook生命周期系统

### Definition of Done

- [x] `pnpm dev` 启动后，聊天界面可以发送消息并收到LLM响应
- [x] 聊天中触发工具调用时，工具能正确执行并返回结果（含Streaming模式）
- [x] file:read IPC调用时，路径遍历攻击被阻止
- [x] `pnpm test` 所有测试通过
- [x] GitHub Actions CI在push时自动运行
- [x] E2E聊天测试通过

### Must Have

- 聊天+工具调用闭环必须工作
- 安全漏洞必须修复
- 所有现有测试必须继续通过
- Windows打包必须继续工作

### Must NOT Have (Guardrails)

- 不得删除或破坏现有的WorkforceEngine/DelegateEngine逻辑
- 不得移除现有的测试用例
- 不得引入新的npm依赖（除非Linux Web版必需）
- 不得修改prisma schema结构
- 不得在fix过程中添加新功能特性
- 不得过度重构已稳定的代码
- 不得硬编码API密钥或敏感信息

---

## Verification Strategy (MANDATORY)

### Test Decision

- **Infrastructure exists**: YES
- **User wants tests**: YES (Tests-after)
- **Framework**: vitest / playwright

### Automated Verification

每个TODO完成后，执行以下验证：

**For Backend changes**:

```bash
pnpm test
# Assert: All tests pass
pnpm typecheck
# Assert: No TypeScript errors
```

**For Frontend changes**:

```bash
pnpm dev &
sleep 10
curl -s http://localhost:5173 | grep -q "CodeAll"
# Assert: Dev server responds
```

**For Security fixes**:

```bash
# 创建专门的安全测试用例验证
pnpm test tests/unit/path-validator.test.ts
# Assert: Path traversal blocked
```

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately) - 安全与基础:
├── Task 1: 修复file:read安全漏洞
├── Task 2: 添加敏感IPC审计日志
└── Task 3: 创建统一工具执行服务

Wave 2 (After Wave 1) - LLM适配器:
├── Task 4: Anthropic streaming工具支持
├── Task 5: OpenAI工具循环
├── Task 6: Gemini工具循环
└── Task 7: 主流程集成SmartRouter

Wave 3 (After Wave 2) - UI接线:
├── Task 8: 修复ChatView组件
├── Task 9: 统一ArtifactRail组件
├── Task 10: 统一ContentCanvas组件
├── Task 11: 接入WorkflowView
└── Task 12: 接入AgentWorkViewer

Wave 4 (After Wave 3) - 交付与增强:
├── Task 13: 创建CI/CD流水线
├── Task 14: 修复Updater配置
├── Task 15: 实现Hook生命周期系统
├── Task 16: 创建E2E聊天测试
└── Task 17: 更新文档与README

[延后] Linux Web服务器 - 下一阶段实现
```

### Dependency Matrix

| Task | Depends On | Blocks  | Can Parallelize With |
| ---- | ---------- | ------- | -------------------- |
| 1    | None       | 8       | 2, 3                 |
| 2    | None       | -       | 1, 3                 |
| 3    | None       | 4,5,6,7 | 1, 2                 |
| 4    | 3          | 7, 8    | 5, 6                 |
| 5    | 3          | 7       | 4, 6                 |
| 6    | 3          | 7       | 4, 5                 |
| 7    | 4, 5, 6    | 8       | -                    |
| 8    | 1, 7       | 16      | 9, 10, 11, 12        |
| 9    | None       | -       | 8, 10, 11, 12        |
| 10   | None       | -       | 8, 9, 11, 12         |
| 11   | None       | -       | 8, 9, 10, 12         |
| 12   | None       | -       | 8, 9, 10, 11         |
| 13   | None       | -       | 14, 15               |
| 14   | None       | -       | 13, 15               |
| 15   | None       | -       | 13, 14               |
| 16   | 8          | 17      | 13, 14, 15           |
| 17   | 16         | None    | -                    |

### Agent Dispatch Summary

| Wave | Tasks      | Recommended Agents                                                                                   |
| ---- | ---------- | ---------------------------------------------------------------------------------------------------- |
| 1    | 1, 2, 3    | delegate_task(category="quick", load_skills=[], run_in_background=true)                              |
| 2    | 4, 5, 6, 7 | delegate_task(category="unspecified-high", load_skills=[], run_in_background=true)                   |
| 3    | 8-12       | delegate_task(category="visual-engineering", load_skills=["frontend-ui-ux"], run_in_background=true) |
| 4    | 13-17      | delegate_task(category="unspecified-high", load_skills=[], run_in_background=true)                   |

---

## TODOs

### Phase 0: 安全与基础 (P0 - Critical)

- [x] 1. 修复file:read IPC安全漏洞

  **What to do**:
  - 修改 `src/main/ipc/handlers/artifact.ts` 中的 `file:read` handler
  - 导入 `PathValidator` 并验证路径安全性
  - 添加workDir参数作为安全边界
  - 对被阻止的请求记录审计日志
  - 更新preload.ts中的类型定义

  **Must NOT do**:
  - 不得破坏现有的artifact:download等功能
  - 不得移除fs模块导入
  - 不得改变返回值结构

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 单文件修改，明确的安全修复任务
  - **Skills**: `[]`
    - 无需特殊技能，标准TypeScript修改
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: 这是后端IPC修改，无需前端技能

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Tasks 8, 13
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/shared/path-validator.ts:8-24` - PathValidator.isPathSafe() 和 resolveSafePath() 方法实现
  - `src/main/services/file-tree.service.ts:30` - PathValidator使用示例

  **API/Type References**:
  - `src/main/ipc/handlers/artifact.ts:7-17` - 当前file:read实现（需修改）
  - `src/main/services/audit-log.service.ts` - AuditLogService接口

  **Test References**:
  - `tests/unit/path-validator.test.ts` - PathValidator测试模式

  **WHY Each Reference Matters**:
  - `path-validator.ts`: 复用已有的安全验证逻辑，避免重复实现
  - `file-tree.service.ts`: 展示如何正确调用PathValidator
  - `artifact.ts`: 理解当前实现以最小化改动
  - `audit-log.service.ts`: 记录安全事件以便追踪

  **Acceptance Criteria**:

  ```bash
  # 1. 验证正常读取仍然工作
  pnpm test tests/unit/path-validator.test.ts
  # Assert: All tests pass

  # 2. 验证TypeScript无错误
  pnpm typecheck
  # Assert: Exit code 0

  # 3. 手动验证路径遍历被阻止
  # 在开发环境中测试file:read调用带有 "../../../etc/passwd" 路径
  # Assert: 返回 { success: false, error: "Path traversal detected" }
  ```

  **Evidence to Capture**:
  - [ ] pnpm typecheck 输出截图
  - [ ] 单元测试通过截图

  **Commit**: YES
  - Message: `fix(security): add path validation to file:read IPC handler`
  - Files: `src/main/ipc/handlers/artifact.ts`
  - Pre-commit: `pnpm typecheck`

---

- [x] 2. 添加敏感IPC操作审计日志

  **What to do**:
  - 在 `artifact.ts` 的 file:read, shell:open-path 添加审计日志调用
  - 记录操作类型、路径、结果（成功/失败）
  - 对于被阻止的操作，记录详细原因

  **Must NOT do**:
  - 不得在日志中记录文件内容
  - 不得阻塞主操作流程

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 简单的日志添加任务
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - N/A

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/main/services/audit-log.service.ts` - AuditLogService 单例模式和log方法
  - `src/main/ipc/handlers/audit-log.ts` - 审计日志IPC handler示例

  **API/Type References**:
  - `prisma/schema.prisma:148-167` - AuditLog 模型结构

  **WHY Each Reference Matters**:
  - `audit-log.service.ts`: 直接使用已有的审计服务
  - `schema.prisma`: 了解日志需要记录哪些字段

  **Acceptance Criteria**:

  ```bash
  # 验证审计日志服务测试通过
  pnpm test tests/unit/services/audit-log.test.ts
  # Assert: All tests pass

  # 验证IPC审计测试通过
  pnpm test tests/unit/ipc/audit-log-ipc.test.ts
  # Assert: All tests pass
  ```

  **Commit**: YES
  - Message: `feat(security): add audit logging to sensitive IPC operations`
  - Files: `src/main/ipc/handlers/artifact.ts`
  - Pre-commit: `pnpm test tests/unit/services/audit-log.test.ts`

---

- [x] 3. 创建统一工具执行服务 (ToolExecutionService)

  **What to do**:
  - 创建 `src/main/services/tools/tool-execution.service.ts`
  - 实现统一的工具执行循环逻辑
  - 支持任意LLM适配器调用
  - 集成现有的ToolRegistry
  - 添加执行超时和错误处理

  **Must NOT do**:
  - 不得删除现有的allTools和ai-browser工具
  - 不得改变工具接口定义

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 核心架构组件，需要仔细设计
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: 纯后端服务

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Tasks 4, 5, 6, 7
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/main/services/llm/anthropic.adapter.ts:77-179` - 现有工具循环逻辑（需提取）
  - `src/main/services/ai-browser/tools.ts` - allTools 数组定义

  **API/Type References**:
  - `src/main/services/tools/tool.interface.ts` - Tool接口定义
  - `src/main/services/tools/tool-registry.ts` - ToolRegistry 单例

  **Test References**:
  - `tests/unit/services/tools/tool-executor.test.ts` - 工具执行测试模式

  **WHY Each Reference Matters**:
  - `anthropic.adapter.ts:77-179`: 提取这段工具循环逻辑到独立服务
  - `tool.interface.ts`: 保持接口兼容
  - `tool-registry.ts`: 集成现有注册机制

  **Acceptance Criteria**:

  ```bash
  # 创建新的测试文件并验证
  pnpm test tests/unit/services/tools/tool-execution.service.test.ts
  # Assert: All tests pass (需要先创建测试)

  pnpm typecheck
  # Assert: Exit code 0
  ```

  **Commit**: YES
  - Message: `feat(tools): create unified ToolExecutionService`
  - Files: `src/main/services/tools/tool-execution.service.ts`, `tests/unit/services/tools/tool-execution.service.test.ts`
  - Pre-commit: `pnpm typecheck`

---

### Phase 1: LLM适配器增强 (P0 - Critical)

- [x] 4. Anthropic适配器 - Streaming工具调用支持

  **What to do**:
  - 修改 `src/main/services/llm/anthropic.adapter.ts` 的 `streamMessage` 方法
  - 在streaming过程中检测tool_use blocks
  - 当检测到工具调用时，使用ToolExecutionService执行
  - 将工具结果注入对话继续生成
  - 保持streaming的用户体验（中间输出）

  **Must NOT do**:
  - 不得破坏现有的sendMessage工具循环
  - 不得移除重试逻辑
  - 不得改变LLMChunk接口

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 复杂的异步流处理逻辑
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - N/A

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 6)
  - **Blocks**: Tasks 7, 8
  - **Blocked By**: Task 3

  **References**:

  **Pattern References**:
  - `src/main/services/llm/anthropic.adapter.ts:187-270` - 当前streamMessage实现
  - `src/main/services/llm/anthropic.adapter.ts:68-185` - sendMessage工具循环（参考模式）

  **API/Type References**:
  - `src/main/services/llm/adapter.interface.ts` - LLMChunk, AsyncGenerator类型
  - `@anthropic-ai/sdk/resources/messages` - MessageStreamEvent类型

  **External References**:
  - Anthropic SDK streaming文档: https://docs.anthropic.com/claude/reference/streaming

  **WHY Each Reference Matters**:
  - 现有sendMessage的工具循环逻辑可以复用
  - SDK文档说明如何正确处理streaming中的tool_use events

  **Acceptance Criteria**:

  ```bash
  pnpm test tests/unit/services/llm/adapter.test.ts
  # Assert: All tests pass

  pnpm typecheck
  # Assert: Exit code 0
  ```

  **Commit**: YES
  - Message: `feat(llm): add tool call support to Anthropic streaming`
  - Files: `src/main/services/llm/anthropic.adapter.ts`
  - Pre-commit: `pnpm test tests/unit/services/llm/adapter.test.ts`

---

- [x] 5. OpenAI适配器 - 添加工具循环

  **What to do**:
  - 修改 `src/main/services/llm/openai.adapter.ts`
  - 在sendMessage中添加function_call/tool_calls检测
  - 使用ToolExecutionService执行工具
  - 实现完整的工具循环直到stop_reason不是tool_calls
  - 在streamMessage中也添加工具支持

  **Must NOT do**:
  - 不得破坏现有的重试逻辑
  - 不得改变API参数结构

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 需要理解OpenAI tool calling API
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 6)
  - **Blocks**: Task 7
  - **Blocked By**: Task 3

  **References**:

  **Pattern References**:
  - `src/main/services/llm/openai.adapter.ts:29-71` - 当前sendMessage实现
  - `src/main/services/llm/anthropic.adapter.ts:68-185` - Anthropic工具循环（参考模式）

  **API/Type References**:
  - OpenAI ChatCompletion types - tool_calls, function_call结构

  **External References**:
  - OpenAI Function Calling文档: https://platform.openai.com/docs/guides/function-calling

  **WHY Each Reference Matters**:
  - Anthropic的工具循环模式可以适配到OpenAI
  - OpenAI文档说明tool_calls的响应格式

  **Acceptance Criteria**:

  ```bash
  pnpm test tests/unit/services/llm/openai.adapter.test.ts
  # Assert: All tests pass

  pnpm typecheck
  # Assert: Exit code 0
  ```

  **Commit**: YES
  - Message: `feat(llm): add tool call loop to OpenAI adapter`
  - Files: `src/main/services/llm/openai.adapter.ts`
  - Pre-commit: `pnpm test tests/unit/services/llm/openai.adapter.test.ts`

---

- [x] 6. Gemini适配器 - 添加工具循环

  **What to do**:
  - 修改 `src/main/services/llm/gemini.adapter.ts`
  - 添加functionCall检测和处理
  - 使用ToolExecutionService执行工具
  - 实现工具循环

  **Must NOT do**:
  - 不得破坏现有的history/chat模式

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 需要理解Gemini Function Calling API
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 5)
  - **Blocks**: Task 7
  - **Blocked By**: Task 3

  **References**:

  **Pattern References**:
  - `src/main/services/llm/gemini.adapter.ts:48-85` - 当前sendMessage实现

  **External References**:
  - Google AI Function Calling: https://ai.google.dev/docs/function_calling

  **Acceptance Criteria**:

  ```bash
  pnpm test tests/unit/services/llm/gemini.adapter.test.ts
  # Assert: All tests pass
  ```

  **Commit**: YES
  - Message: `feat(llm): add tool call loop to Gemini adapter`
  - Files: `src/main/services/llm/gemini.adapter.ts`

---

- [x] 7. 主流程集成SmartRouter

  **What to do**:
  - 修改 `src/main/ipc/handlers/message.ts` 的 handleMessageSend
  - 使用SmartRouter分析用户输入
  - 根据路由结果选择执行路径:
    - workforce: 调用WorkforceEngine
    - delegate: 调用DelegateEngine
    - direct: 直接LLM调用（当前行为）
  - 保持streaming响应给前端

  **Must NOT do**:
  - 不得移除现有的streaming逻辑
  - 不得改变message:stream-chunk事件格式

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 关键流程集成
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 8
  - **Blocked By**: Tasks 4, 5, 6

  **References**:

  **Pattern References**:
  - `src/main/services/router/smart-router.ts:82-107` - SmartRouter.route() 方法
  - `src/main/ipc/handlers/message.ts:33-101` - 当前handleMessageSend实现

  **API/Type References**:
  - `src/main/services/router/smart-router.ts:22-30` - RouteResult 类型

  **Test References**:
  - `tests/unit/services/router/smart-router.test.ts` - Router测试模式

  **Acceptance Criteria**:

  ```bash
  pnpm test tests/unit/services/router/smart-router.test.ts
  # Assert: All tests pass

  pnpm typecheck
  # Assert: Exit code 0
  ```

  **Commit**: YES
  - Message: `feat(router): integrate SmartRouter into message handler`
  - Files: `src/main/ipc/handlers/message.ts`

---

### Phase 2: UI组件接线 (P1 - High)

- [x] 8. 修复ChatView组件 - 连接IPC后端

  **What to do**:
  - 修改 `src/renderer/src/components/layout/ChatView.tsx`
  - 移除假数据，连接真实的session和message IPC
  - 添加 `window.codeall.invoke('message:send')` 调用
  - 监听 `message:stream-chunk` 事件实现流式显示
  - 集成session管理（获取或创建默认session）
  - 添加加载状态和错误处理

  **Must NOT do**:
  - 不得改变组件的视觉样式
  - 不得移除Tailwind类名

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: 前端React组件修改
  - **Skills**: `["frontend-ui-ux"]`
    - `frontend-ui-ux`: 确保组件交互和状态管理正确
  - **Skills Evaluated but Omitted**:
    - `playwright`: 不需要浏览器自动化

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 9-12)
  - **Blocks**: Task 17
  - **Blocked By**: Tasks 1, 7

  **References**:

  **Pattern References**:
  - `src/renderer/src/pages/SettingsPage.tsx:83-93` - IPC调用和状态更新模式
  - `src/renderer/src/components/layout/ChatView.tsx` - 当前实现（需要修改）

  **API/Type References**:
  - `src/preload/index.d.ts` - window.codeall 类型定义
  - `src/main/ipc/index.ts:56-57` - message:send, message:list IPC channels

  **Test References**:
  - `tests/e2e/session-workflow.spec.ts` - Session工作流E2E测试

  **WHY Each Reference Matters**:
  - `SettingsPage.tsx`: 展示正确的IPC调用模式
  - `preload`: 确保类型安全的IPC调用

  **Acceptance Criteria**:

  ```bash
  pnpm typecheck
  # Assert: Exit code 0

  pnpm build
  # Assert: Build succeeds

  # E2E验证 (Playwright)
  pnpm test:e2e tests/e2e/session-workflow.spec.ts
  # Assert: Tests pass
  ```

  **Commit**: YES
  - Message: `feat(ui): connect ChatView to IPC backend`
  - Files: `src/renderer/src/components/layout/ChatView.tsx`

---

- [x] 9. 统一ArtifactRail组件

  **What to do**:
  - 评估 `components/layout/ArtifactRail.tsx` vs `components/artifact/ArtifactRail.tsx`
  - 将功能完整的版本保留并接入MainLayout
  - 删除或重命名stub版本
  - 确保连接artifact:list IPC获取真实数据

  **Must NOT do**:
  - 不得破坏现有的resizable panels布局

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: `["frontend-ui-ux"]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 8, 10-12)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/renderer/src/components/artifact/ArtifactRail.tsx` - 真实组件
  - `src/renderer/src/components/layout/ArtifactRail.tsx` - Stub组件

  **Acceptance Criteria**:

  ```bash
  pnpm typecheck
  pnpm build
  # Assert: Both succeed
  ```

  **Commit**: YES
  - Message: `refactor(ui): unify ArtifactRail components`

---

- [x] 10. 统一ContentCanvas组件

  **What to do**:
  - 评估 `components/layout/ContentCanvas.tsx` vs `components/canvas/ContentCanvas.tsx`
  - 将功能完整的版本（包含BrowserViewer）接入MainLayout
  - 确保BrowserShell正确工作

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: `["frontend-ui-ux"]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 8, 9, 11, 12)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/renderer/src/components/canvas/ContentCanvas.tsx` - 真实组件
  - `src/renderer/src/components/canvas/BrowserViewer.tsx` - 浏览器视图

  **Acceptance Criteria**:

  ```bash
  pnpm build
  # Assert: Build succeeds
  ```

  **Commit**: YES
  - Message: `refactor(ui): unify ContentCanvas components`

---

- [x] 11. 接入WorkflowView到路由 (已有ChatPage包含toggle逻辑)

  > **⚠️ 发现**: `ChatPage.tsx` 已经实现了 Chat/Workflow 切换逻辑，但当前 `MainLayout` 直接使用 `ChatView` 而非 `ChatPage`，导致 `WorkflowView` 无法访问。

  **What to do**:
  - **方案A (推荐 - 最简单)**: 修改 `MainLayout.tsx`，将 `ChatView` 替换为 `ChatPage`
    - 这样立即启用已实现的 Chat/Workflow 切换功能
  - **方案B**: 将 `ChatPage` 中的 toggle 逻辑合并到 `ChatView` 中
  - 确保 `task:list` IPC 连接正常
  - 验证 React Flow DAG 正确渲染

  **Must NOT do**:
  - 不得删除 `ChatPage.tsx` 或 `WorkflowView.tsx`
  - 不得破坏现有的 resizable panels 布局

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: `["frontend-ui-ux"]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3

  **References**:

  **Pattern References**:
  - `src/renderer/src/pages/ChatPage.tsx` - **关键**: 已实现 Chat/Workflow toggle，包含 `viewMode` state
  - `src/renderer/src/components/workflow/WorkflowView.tsx` - 工作流视图组件
  - `src/renderer/src/components/layout/MainLayout.tsx:60-62` - 当前使用 `ChatView` 的位置 (需修改)
  - `src/renderer/src/components/layout/ChatView.tsx` - 当前被使用的简化版聊天组件

  **API/Type References**:
  - `src/main/ipc/handlers/task.ts` - task:list IPC handler

  **WHY Each Reference Matters**:
  - `ChatPage.tsx`: 包含完整的 toggle 实现，无需重写
  - `MainLayout.tsx`: 只需将 `ChatView` 换成 `ChatPage` 即可激活功能
  - `WorkflowView.tsx`: 验证其正确接收 sessionId prop

  **Acceptance Criteria**:

  ```bash
  pnpm build
  # Assert: Build succeeds

  pnpm typecheck
  # Assert: No TypeScript errors
  ```

  **Playwright Verification**:

  ```
  1. Navigate to: http://localhost:5173
  2. Look for: Toggle button with "Chat" and "Workflow" options
  3. Click: "Workflow" toggle
  4. Assert: React Flow canvas is visible with DAG nodes
  5. Screenshot: .sisyphus/evidence/task-11-workflow-toggle.png
  ```

  **Commit**: YES
  - Message: `feat(ui): enable WorkflowView via ChatPage integration`
  - Files: `src/renderer/src/components/layout/MainLayout.tsx`

---

- [x] 12. 接入AgentWorkViewer (当前为死代码)

  > **⚠️ 发现**: `AgentWorkViewer.tsx` 存在但在整个代码库中 **零引用**，是完全的死代码。需要选择合适的集成点。

  **What to do**:
  - **首先检查**: 确认组件是否功能完整 (读取 `AgentWorkViewer.tsx` 了解其依赖)
  - **集成方案A (推荐)**: 在 `WorkflowView` 中添加，当点击 DAG 节点时显示该 agent 的工作日志
  - **集成方案B**: 在 `ChatPage` 中添加为第三个 tab (Chat / Workflow / Agents)
  - **集成方案C**: 作为 `ArtifactRail` 中的一个可切换视图
  - 连接 agent 状态数据 (需检查是否有对应 IPC)
  - 添加事件监听或轮询机制

  **Must NOT do**:
  - 不得删除组件，即使需要重构
  - 不得硬编码测试数据

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: `["frontend-ui-ux"]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Depends On**: Task 11 (WorkflowView 需先可访问)

  **References**:

  **Pattern References**:
  - `src/renderer/src/components/agents/AgentWorkViewer.tsx` - **关键**: 当前死代码，需要首先阅读理解其接口
  - `src/renderer/src/components/agents/AgentList.tsx` - Agent列表组件，可能需要配合使用
  - `src/renderer/src/components/workflow/WorkflowView.tsx` - 潜在集成点 (节点点击事件)

  **API/Type References**:
  - `src/main/ipc/handlers/task.ts` - 检查是否有 agent 状态相关 IPC
  - `src/main/services/delegate/delegate-engine.ts` - Agent 执行逻辑，了解数据来源

  **WHY Each Reference Matters**:
  - `AgentWorkViewer.tsx`: 理解组件需要什么 props 和数据
  - `WorkflowView.tsx`: 添加节点点击处理器来显示 agent 详情
  - `delegate-engine.ts`: 了解 agent 运行时数据如何获取

  **Acceptance Criteria**:

  ```bash
  pnpm build
  # Assert: Build succeeds

  pnpm typecheck
  # Assert: No TypeScript errors
  ```

  **Playwright Verification**:

  ```
  1. Navigate to workflow view (requires Task 11 complete)
  2. If DAG nodes exist, click on one
  3. Assert: AgentWorkViewer panel appears with agent activity log
  4. Screenshot: .sisyphus/evidence/task-12-agent-viewer.png
  ```

  **Commit**: YES
  - Message: `feat(ui): integrate AgentWorkViewer into workflow`
  - Files: Multiple (depends on chosen integration approach)

---

### Phase 3: 交付准备 (P2 - Medium)

> **注意**: Linux Web服务器 (原Task 13) 已根据用户决策延后至下一阶段。

- [x] 13. 创建CI/CD流水线

  **What to do**:
  - 创建 `.github/workflows/ci.yml`
  - 配置Node.js环境和pnpm
  - 运行lint、typecheck、test
  - 在PR和push到main时触发
  - 添加build验证步骤

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4
  - **Blocks**: None
  - **Blocked By**: Task 13

  **References**:

  **External References**:
  - GitHub Actions文档: https://docs.github.com/en/actions

  **Acceptance Criteria**:

  ```bash
  # 验证YAML语法
  cat .github/workflows/ci.yml | python -c "import sys, yaml; yaml.safe_load(sys.stdin)"
  # Assert: Valid YAML
  ```

  **Commit**: YES
  - Message: `ci: add GitHub Actions CI workflow`
  - Files: `.github/workflows/ci.yml`

---

- [x] 14. 修复Updater配置

  **What to do**:
  - 修改 `src/main/index.ts` 中的autoUpdater配置
  - 将占位URL改为可配置的环境变量
  - 或暂时禁用生产环境自动更新检查
  - 添加用户友好的更新提示

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4
  - **Blocks**: None
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/main/index.ts:154-200` - 当前updater配置

  **Acceptance Criteria**:

  ```bash
  pnpm typecheck
  pnpm build
  # Assert: Both succeed
  ```

  **Commit**: YES
  - Message: `fix(updater): make update URL configurable`

---

- [x] 15. 实现Hook生命周期系统 (复用现有WorkflowEventEmitter)

  > **⚠️ 发现**: `WorkflowEventEmitter` 已存在于 `src/main/services/workforce/events.ts`，定义了 `task:started`、`task:completed` 等事件。但 `WorkforceEngine` **没有调用它**，事件系统处于休眠状态。

  **What to do**:
  - **Step 1 (必须)**: 在 `WorkforceEngine.executeWorkflow()` 中添加事件发射
    - 任务开始时: `workflowEvents.emit('task:started', { taskId, ... })`
    - 任务完成时: `workflowEvents.emit('task:completed', { taskId, result, ... })`
    - 工作流完成时: `workflowEvents.emit('workflow:completed', { ... })`
  - **Step 2 (可选扩展)**: 如果需要更通用的 hook 系统，再创建 `HookRegistry`
  - **Step 3**: 在 LLM 调用和工具执行处添加 hook 点 (如需要)
  - **Step 4**: 创建示例 hooks (日志、计时、指标收集)

  **Must NOT do**:
  - 不得删除现有的 `WorkflowEventEmitter`
  - 不得在 hook 中执行阻塞操作
  - 不得改变 `WorkforceEngine` 的核心执行逻辑

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 架构级功能，需要理解事件流
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4
  - **Blocks**: None
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/main/services/workforce/events.ts` - **关键**: 现有的 `WorkflowEventEmitter` 类，定义了事件类型
  - `src/main/services/workforce/workforce-engine.ts:137-248` - `executeWorkflow()` 方法，需要在此添加 emit 调用
  - `src/main/services/workforce/workforce-engine.ts:180-220` - 任务执行循环，在任务开始/结束处添加事件

  **API/Type References**:
  - `src/main/services/workforce/events.ts:WorkflowEvent` - 事件类型定义

  **Test References**:
  - 需要创建 `tests/unit/services/workforce/events.test.ts`

  **WHY Each Reference Matters**:
  - `events.ts`: 理解已定义的事件结构，避免重复定义
  - `workforce-engine.ts:137-248`: 找到正确的插入点发射事件
  - 不需要创建新的 `hook-registry.ts`，除非需要更复杂的 hook 类型

  **Acceptance Criteria**:

  ```bash
  pnpm test tests/unit/services/workforce/
  # Assert: All workforce tests pass

  pnpm typecheck
  # Assert: Exit code 0
  ```

  **Manual Verification**:

  ```typescript
  // 在开发环境中添加临时监听器验证事件发射
  import { workflowEvents } from './services/workforce/events'
  workflowEvents.on('task:completed', data => console.log('Task completed:', data))
  // 触发一个 workflow，观察控制台输出
  ```

  **Commit**: YES
  - Message: `feat(hooks): wire WorkflowEventEmitter into WorkforceEngine`
  - Files: `src/main/services/workforce/workforce-engine.ts`, `tests/unit/services/workforce/events.test.ts`

---

- [x] 16. 创建E2E聊天功能测试

  **What to do**:
  - 创建 `tests/e2e/chat-workflow.spec.ts`
  - 测试完整的聊天流程：发送消息→收到响应
  - 测试工具调用场景（如果有mock）
  - 测试错误处理（无API key等）

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
  - **Skills**: `["playwright"]`
    - `playwright`: E2E测试需要Playwright技能

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4
  - **Blocks**: Task 18
  - **Blocked By**: Task 8

  **References**:

  **Pattern References**:
  - `tests/e2e/session-workflow.spec.ts` - 现有E2E测试模式
  - `tests/e2e/fixtures/electron.ts` - Electron测试fixture

  **Acceptance Criteria**:

  ```bash
  pnpm test:e2e tests/e2e/chat-workflow.spec.ts
  # Assert: Tests pass
  ```

  **Commit**: YES
  - Message: `test(e2e): add chat workflow end-to-end tests`

---

- [x] 17. 更新文档与README (需验证Linux Web声明)

  > **⚠️ 发现**: README.md 声称 `pnpm start:web` 可启动 Web Server Mode，但计划中 Linux Web 功能已延后。需要验证并修正。

  **What to do**:
  - **首先验证**: 运行 `pnpm start:web` 检查是否真的可用
    - 如果可用: 更新文档说明其功能范围和限制
    - 如果不可用: 标注为 "计划中 (Planned)" 并移除 Quick Start 中的命令
  - 更新 README.md 反映实际功能状态
  - 更新架构文档 (`docs/architecture.md`)
  - 添加故障排除指南 (`docs/troubleshooting.md`)
  - 记录 SUL-1.0 许可证问题为技术债务
  - 确保所有 "Project Status" 声明与实际一致

  **Must NOT do**:
  - 不得声称未实现的功能已可用
  - 不得删除有价值的现有文档内容

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (Final)
  - **Blocks**: None
  - **Blocked By**: Task 16

  **References**:

  **Pattern References**:
  - `README.md` - 当前 README，检查 "Web Server Mode" 部分
  - `package.json` - 验证 `start:web` script 是否存在及其内容
  - `docs/` - 文档目录

  **Specific Checks**:
  - `README.md` Line ~50: "Web Server Mode (Linux/Remote)" 声明
  - `package.json` scripts: 检查 `start:web` 定义
  - 如果 script 指向不存在的文件或功能，需要移除或标注

  **WHY Each Reference Matters**:
  - `README.md`: 用户首先阅读的文档，必须准确
  - `package.json`: 验证命令是否真的存在

  **Acceptance Criteria**:

  ```bash
  # 验证 markdown 语法
  npx markdownlint README.md docs/*.md --ignore node_modules
  # Assert: No errors (or acceptable warnings)

  # 验证 start:web 命令状态
  grep -A2 '"start:web"' package.json
  # 记录结果用于文档更新
  ```

  **Content Verification**:
  - [ ] README 中所有 Quick Start 命令都可执行
  - [ ] 功能列表与实际实现一致
  - [ ] "Planned" 功能明确标注
  - [ ] 技术债务记录在 docs/ 或 README 中

  **Commit**: YES
  - Message: `docs: update README and documentation for current status`
  - Files: `README.md`, `docs/*.md`

---

## Commit Strategy

| After Task | Message                                                         | Files                     | Verification   |
| ---------- | --------------------------------------------------------------- | ------------------------- | -------------- |
| 1          | `fix(security): add path validation to file:read IPC handler`   | artifact.ts               | pnpm typecheck |
| 2          | `feat(security): add audit logging to sensitive IPC operations` | artifact.ts               | pnpm test      |
| 3          | `feat(tools): create unified ToolExecutionService`              | tool-execution.service.ts | pnpm typecheck |
| 4          | `feat(llm): add tool call support to Anthropic streaming`       | anthropic.adapter.ts      | pnpm test      |
| 5          | `feat(llm): add tool call loop to OpenAI adapter`               | openai.adapter.ts         | pnpm test      |
| 6          | `feat(llm): add tool call loop to Gemini adapter`               | gemini.adapter.ts         | pnpm test      |
| 7          | `feat(router): integrate SmartRouter into message handler`      | message.ts                | pnpm test      |
| 8          | `feat(ui): connect ChatView to IPC backend`                     | ChatView.tsx              | pnpm build     |
| 9          | `refactor(ui): unify ArtifactRail components`                   | ArtifactRail.tsx          | pnpm build     |
| 10         | `refactor(ui): unify ContentCanvas components`                  | ContentCanvas.tsx         | pnpm build     |
| 11         | `feat(ui): enable WorkflowView via ChatPage integration`        | MainLayout.tsx            | pnpm build     |
| 12         | `feat(ui): integrate AgentWorkViewer into workflow`             | WorkflowView.tsx          | pnpm build     |
| 13         | `ci: add GitHub Actions CI workflow`                            | .github/workflows/ci.yml  | yaml lint      |
| 14         | `fix(updater): make update URL configurable`                    | index.ts                  | pnpm build     |
| 15         | `feat(hooks): wire WorkflowEventEmitter into WorkforceEngine`   | workforce-engine.ts       | pnpm test      |
| 16         | `test(e2e): add chat workflow end-to-end tests`                 | chat-workflow.spec.ts     | pnpm test:e2e  |
| 17         | `docs: update README and documentation for current status`      | README.md, docs/\*.md     | markdownlint   |

---

## Success Criteria

### Verification Commands

```bash
# 1. 所有测试通过
pnpm test
# Expected: All 80+ tests pass

# 2. TypeScript无错误
pnpm typecheck
# Expected: Exit code 0

# 3. 构建成功
pnpm build
# Expected: Build completes without errors

# 4. E2E测试通过
pnpm test:e2e
# Expected: All E2E tests pass

# 5. 开发服务器可启动
pnpm dev &
sleep 15
curl -s http://localhost:5173 | grep -q "html"
# Expected: Returns HTML content
```

### Final Checklist

- [x] 所有"Must Have"功能正常工作
- [x] 所有"Must NOT Have"约束未被违反
- [x] 安全漏洞已修复（路径遍历不可利用）
- [x] ChatView可以发送和接收消息
- [x] 工具调用在聊天中可以工作（含Streaming模式）
- [x] CI/CD流水线配置完成
- [x] 所有现有测试继续通过
- [x] 文档已更新反映当前状态

---

## Risk Assessment

| Risk                      | Probability | Impact | Mitigation                   |
| ------------------------- | ----------- | ------ | ---------------------------- |
| Streaming工具调用实现复杂 | High        | High   | 提供备选方案：改用非流式模式 |
| 测试覆盖不足导致回归      | Low         | High   | 每个任务都运行完整测试套件   |
| UI组件合并引入bug         | Medium      | Low    | 保留旧组件备份，逐步切换     |

---

## Technical Debt (延后处理)

以下项目作为技术债务记录，不在本计划范围内：

| 项目              | 原因             | 计划处理时间 |
| ----------------- | ---------------- | ------------ |
| Linux Web服务器   | 用户决策延后     | 下一阶段     |
| SUL-1.0许可证重写 | 用户决策暂时忽略 | 待定         |

---

## Timeline Estimate

| Phase               | Tasks | Duration         | Parallelism               |
| ------------------- | ----- | ---------------- | ------------------------- |
| Phase 0: 安全与基础 | 1-3   | 2-3 days         | 3 parallel                |
| Phase 1: LLM适配器  | 4-7   | 4-5 days         | 3 parallel + 1 sequential |
| Phase 2: UI接线     | 8-12  | 3-4 days         | 5 parallel                |
| Phase 3: 交付准备   | 13-17 | 4-5 days         | 4 parallel + 1 sequential |
| **Total**           | 17    | **~2.5-3 weeks** | -                         |

---

_Plan generated: 2026-02-02_
_Updated after Metis review and user decisions_
_Ultraworked with [Sisyphus](https://github.com/code-yeongyu/oh-my-opencode)_
