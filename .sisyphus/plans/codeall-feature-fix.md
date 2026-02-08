# CodeAll 三大功能缺失修复计划

## TL;DR

> **Quick Summary**: 修复CodeAll项目中三个关键功能缺失：文件系统浏览、内部浏览器AI集成、Agent模块完整迁移。基于oh-my-opencode的神话体系完成9个Agent的完整迁移。
>
> **Deliverables**:
>
> - 完整可用的文件树浏览功能（IPC + UI）
> - AI可调用的浏览器工具集成
> - 9个omo Agent完整迁移（含提示模板）
> - 统一的Agent定义系统
>
> **Estimated Effort**: Large (3-5天)
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: Task 0 → Task 1-3 → Task 4 → Task 5-11 → Task 12

---

## Context

### Original Request

用户报告CodeAll项目存在三个关键功能缺失：

1. 无法查看系统文件夹结构及内容
2. 内部浏览器功能无法被AI调用使用
3. Agent模块未正确接入系统

要求基于项目规划文档完成omo Agent的完整迁移。

### Interview Summary

**Key Discussions**:

- FileTreeService已实现但缺少IPC/Preload/UI连接
- 浏览器UI功能完整，但AI工具未绑定到Agent系统
- 仅3个遗留Agent定义，缺少神话体系的9个Agent
- Agent提示模板完全缺失（每个需300-600行）
- LLM工厂只需支持openai-compatible（用户确认）

**Research Findings**:

- oh-my-opencode有11个Agent，每个有复杂的提示结构
- 主要Agent(Prometheus/Sisyphus/Atlas/Hephaestus)需400-600行提示
- 子Agent(Oracle/Metis/Momus/Librarian/Explore)需200-400行提示
- 工具限制按Agent类型区分（readonly vs executor）
- 8个Category已在agent-definitions.ts中定义

### Metis Review

**Identified Gaps** (addressed):

- 缺少验证阶段：添加Task 0验证先决条件
- 缺少边缘情况处理：在AC中明确错误处理
- 缺少性能指标：添加具体时间限制
- Prompt模板存放位置：使用独立文件 `src/main/services/delegate/prompts/`

---

## Work Objectives

### Core Objective

修复三大功能缺失，完成omo Agent体系的完整迁移，使CodeAll具备完整的文件浏览、浏览器AI操控、多Agent协同能力。

### Concrete Deliverables

- `src/main/ipc/handlers/file-tree.ts` - 文件树IPC处理器
- `src/main/preload.ts` - 添加file-tree通道
- `src/renderer/src/components/sidebar/LocalFileExplorer.tsx` - 本地文件浏览器组件
- `src/main/services/delegate/prompts/*.ts` - 9个Agent提示模板
- `src/main/services/delegate/agents.ts` - 统一Agent定义
- `src/main/services/tools/index.ts` - 完整工具注册

### Definition of Done

- [x] 文件树在侧边栏可见并可展开/折叠
- [x] AI Agent可调用浏览器工具（navigate/screenshot/click）
- [x] 所有9个omo Agent可通过DelegateEngine调用
- [x] 每个Agent有完整的系统提示模板
- [x] 工具限制按Agent类型正确执行

### Must Have

- 文件树只读浏览（不含创建/删除/重命名）
- 浏览器工具绑定到Agent系统
- 9个Agent完整提示模板
- 中国神话命名体系保持一致
- openai-compatible LLM适配器

### Must NOT Have (Guardrails)

- 文件创建/删除/重命名操作（文件树仅查看）
- 重新设计Agent提示（移植，不重写）
- Agent链式编排（保持单Agent调用）
- 修改LLM工厂（保持openai-compatible）
- 用户可见的Agent选择UI（内部调度）
- 实时文件监控（手动刷新即可）

---

## Verification Strategy

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**
>
> ALL tasks in this plan MUST be verifiable WITHOUT any human action.

### Test Decision

- **Infrastructure exists**: YES
- **Automated tests**: Tests-after (在实现后添加测试)
- **Framework**: bun test / vitest

### Agent-Executed QA Scenarios (MANDATORY)

**Verification Tool by Deliverable Type:**

| Type                 | Tool                    | How Agent Verifies  |
| -------------------- | ----------------------- | ------------------- |
| **IPC Handlers**     | Bash (bun test)         | 单元测试验证IPC响应 |
| **React Components** | Playwright              | 导航、交互、断言DOM |
| **Agent Prompts**    | Bash (bun test)         | 验证提示加载和格式  |
| **Tool Integration** | Bash (integration test) | 调用Agent执行工具   |

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 0 (Prerequisites Verification):
└── Task 0: 验证先决条件（FileTreeService/Browser MCP/Tools）

Wave 1 (Core Infrastructure - After Wave 0):
├── Task 1: 文件树IPC处理器
├── Task 2: Preload通道暴露
└── Task 3: 创建提示模板目录结构

Wave 2 (UI + First Agent - After Wave 1):
├── Task 4: LocalFileExplorer组件
├── Task 5: 移植Explore Agent（验证模式）
└── Task 6: 浏览器工具绑定

Wave 3 (Remaining Agents - After Task 5 verified):
├── Task 7: 移植Oracle Agent
├── Task 8: 移植Librarian Agent
├── Task 9: 移植Metis Agent
├── Task 10: 移植Momus Agent
└── Task 11: 移植主要Agents（FuXi/HaoTian/KuaFu/LuBan）

Wave 4 (Integration + Cleanup - After Wave 3):
└── Task 12: 统一Agent定义并清理遗留代码
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
| ---- | ---------- | ------ | -------------------- |
| 0    | None       | 1,2,3  | None (prerequisite)  |
| 1    | 0          | 4      | 2,3                  |
| 2    | 0          | 4      | 1,3                  |
| 3    | 0          | 5-11   | 1,2                  |
| 4    | 1,2        | 12     | 5,6                  |
| 5    | 3          | 7-11   | 4,6                  |
| 6    | 0          | 12     | 4,5                  |
| 7    | 5          | 12     | 8,9,10,11            |
| 8    | 5          | 12     | 7,9,10,11            |
| 9    | 5          | 12     | 7,8,10,11            |
| 10   | 5          | 12     | 7,8,9,11             |
| 11   | 5          | 12     | 7,8,9,10             |
| 12   | 4,7-11     | None   | None (final)         |

### Agent Dispatch Summary

| Wave | Tasks | Recommended Category                   |
| ---- | ----- | -------------------------------------- |
| 0    | 0     | quick (验证脚本)                       |
| 1    | 1,2,3 | quick (基础设施)                       |
| 2    | 4,5,6 | visual-engineering (UI) / deep (Agent) |
| 3    | 7-11  | deep (Agent迁移)                       |
| 4    | 12    | quick (清理)                           |

---

## TODOs

### Phase 0: Prerequisites Verification

- [x] 0. 验证先决条件

  **What to do**:
  - 验证FileTreeService.getTree()可正常工作
  - 验证浏览器工具定义存在于ai-browser/tools/
  - 验证toolRegistry包含基础工具(read/write/grep/glob)
  - 验证agent-definitions.ts包含9个Agent定义
  - 如有任何失败，记录并报告阻塞项

  **Must NOT do**:
  - 修改任何文件
  - 尝试修复发现的问题

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - Reason: 纯验证任务，无需复杂技能

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 0 (single)
  - **Blocks**: Tasks 1-12
  - **Blocked By**: None

  **References**:
  - `src/main/services/file-tree.service.ts` - FileTreeService实现
  - `src/main/services/ai-browser/tools/index.ts` - 浏览器工具导出
  - `src/main/services/tools/index.ts` - 工具注册
  - `src/shared/agent-definitions.ts` - Agent定义

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: FileTreeService功能验证
    Tool: Bash (bun test)
    Preconditions: 项目已安装依赖
    Steps:
      1. 检查文件存在: ls src/main/services/file-tree.service.ts
      2. 检查导出: grep -n "export class FileTreeService" src/main/services/file-tree.service.ts
      3. 检查getTree方法: grep -n "async getTree" src/main/services/file-tree.service.ts
    Expected Result: 文件存在，类和方法已导出
    Evidence: 命令输出

  Scenario: 浏览器工具定义验证
    Tool: Bash
    Steps:
      1. 检查目录: ls src/main/services/ai-browser/tools/
      2. 检查导出: grep -n "export" src/main/services/ai-browser/tools/index.ts
    Expected Result: 工具文件存在，有导出
    Evidence: 命令输出

  Scenario: Agent定义验证
    Tool: Bash
    Steps:
      1. 检查9个Agent: grep -c "code:" src/shared/agent-definitions.ts
      2. 验证关键Agent: grep "fuxi\|haotian\|baize\|qianliyan" src/shared/agent-definitions.ts
    Expected Result: 至少9个Agent定义
    Evidence: 命令输出
  ```

  **Commit**: NO (验证任务，无文件修改)

---

### Phase 1: File System Feature

- [x] 1. 创建文件树IPC处理器

  **What to do**:
  - 创建 `src/main/ipc/handlers/file-tree.ts`
  - 实现 `file-tree:get` 处理器调用 FileTreeService.getTree()
  - 实现 `file-tree:watch` 处理器调用 FileTreeService.watchDirectory()
  - 实现 `file-tree:unwatch` 处理器调用 FileTreeService.unwatchDirectory()
  - 在 `src/main/ipc/index.ts` 中注册处理器
  - 添加文件变更事件转发到renderer

  **Must NOT do**:
  - 添加文件创建/删除/重命名功能
  - 修改FileTreeService核心逻辑

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - Reason: 标准IPC模式，参考现有handlers

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Task 4
  - **Blocked By**: Task 0

  **References**:
  - `src/main/ipc/handlers/space.ts:12-91` - IPC handler模式参考
  - `src/main/ipc/handlers/artifact.ts` - 复杂handler示例
  - `src/main/services/file-tree.service.ts` - FileTreeService API
  - `src/main/ipc/index.ts:57-135` - handler注册模式

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: IPC处理器文件创建
    Tool: Bash
    Steps:
      1. 检查文件存在: ls src/main/ipc/handlers/file-tree.ts
      2. 检查导出: grep "registerFileTreeHandlers" src/main/ipc/handlers/file-tree.ts
      3. 检查注册: grep "registerFileTreeHandlers" src/main/ipc/index.ts
    Expected Result: 文件创建，函数导出并注册
    Evidence: 命令输出

  Scenario: Handler实现验证
    Tool: Bash
    Steps:
      1. 检查get handler: grep "file-tree:get" src/main/ipc/handlers/file-tree.ts
      2. 检查watch handler: grep "file-tree:watch" src/main/ipc/handlers/file-tree.ts
      3. 检查unwatch handler: grep "file-tree:unwatch" src/main/ipc/handlers/file-tree.ts
    Expected Result: 三个handler都存在
    Evidence: 命令输出
  ```

  **Commit**: YES
  - Message: `feat(ipc): add file-tree handlers for directory browsing`
  - Files: `src/main/ipc/handlers/file-tree.ts`, `src/main/ipc/index.ts`
  - Pre-commit: `bun run typecheck`

---

- [x] 2. 更新Preload暴露文件树通道

  **What to do**:
  - 在 `src/main/preload.ts` 的 ALLOWED_CHANNELS 中添加:
    - `file-tree:get`
    - `file-tree:watch`
    - `file-tree:unwatch`
    - `file-tree:changed` (事件通道)
  - 验证类型安全

  **Must NOT do**:
  - 修改现有通道
  - 添加不必要的通道

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - Reason: 简单配置修改

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Task 4
  - **Blocked By**: Task 0

  **References**:
  - `src/main/preload.ts:8-106` - ALLOWED_CHANNELS数组
  - `src/main/preload.ts:40-55` - browser通道示例

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: 通道添加验证
    Tool: Bash
    Steps:
      1. grep "file-tree:get" src/main/preload.ts
      2. grep "file-tree:watch" src/main/preload.ts
      3. grep "file-tree:unwatch" src/main/preload.ts
      4. grep "file-tree:changed" src/main/preload.ts
    Expected Result: 四个通道都存在于ALLOWED_CHANNELS
    Evidence: 命令输出

  Scenario: TypeScript编译验证
    Tool: Bash
    Steps:
      1. bun run typecheck
    Expected Result: 无类型错误
    Evidence: 编译输出
  ```

  **Commit**: YES (groups with Task 1)
  - Message: `feat(preload): expose file-tree IPC channels`
  - Files: `src/main/preload.ts`
  - Pre-commit: `bun run typecheck`

---

- [x] 3. 创建提示模板目录结构

  **What to do**:
  - 创建目录 `src/main/services/delegate/prompts/`
  - 创建 `src/main/services/delegate/prompts/index.ts` 导出文件
  - 创建基础类型定义 `src/main/services/delegate/prompts/types.ts`
  - 定义 AgentPromptTemplate 接口

  **Must NOT do**:
  - 编写具体Agent提示（后续任务）
  - 修改现有代码

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - Reason: 目录和基础文件创建

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Tasks 5-11
  - **Blocked By**: Task 0

  **References**:
  - `参考项目/oh-my-opencode/src/agents/types.ts` - Agent类型定义参考
  - `src/shared/agent-definitions.ts` - 现有Agent定义

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: 目录结构验证
    Tool: Bash
    Steps:
      1. ls -la src/main/services/delegate/prompts/
      2. cat src/main/services/delegate/prompts/index.ts
      3. cat src/main/services/delegate/prompts/types.ts
    Expected Result: 目录和文件存在，有基础导出
    Evidence: 命令输出
  ```

  **Commit**: YES
  - Message: `chore(delegate): create prompts directory structure`
  - Files: `src/main/services/delegate/prompts/*`
  - Pre-commit: `bun run typecheck`

---

- [x] 4. 创建LocalFileExplorer UI组件

  **What to do**:
  - 创建 `src/renderer/src/components/sidebar/LocalFileExplorer.tsx`
  - 实现树形结构展示（使用现有UI库或自定义）
  - 调用 `window.codeall.invoke('file-tree:get', ...)` 获取数据
  - 实现展开/折叠功能
  - 实现懒加载（点击文件夹时加载子目录）
  - 添加加载状态和错误处理
  - 集成到Sidebar.tsx

  **Must NOT do**:
  - 添加文件编辑功能
  - 添加右键菜单操作
  - 实现拖拽功能

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`]
  - Reason: React组件开发，需要UI/UX技能

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 6)
  - **Blocks**: Task 12
  - **Blocked By**: Tasks 1, 2

  **References**:
  - `src/renderer/src/components/artifact/FileTree.tsx` - 现有树形组件参考
  - `src/renderer/src/components/sidebar/SpaceList.tsx` - Sidebar组件模式
  - `src/renderer/src/components/layout/Sidebar.tsx` - Sidebar布局

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: 组件文件创建
    Tool: Bash
    Steps:
      1. ls src/renderer/src/components/sidebar/LocalFileExplorer.tsx
      2. grep "LocalFileExplorer" src/renderer/src/components/layout/Sidebar.tsx
    Expected Result: 组件文件存在，已集成到Sidebar
    Evidence: 命令输出

  Scenario: 组件功能验证
    Tool: Playwright
    Preconditions: 应用运行在localhost:5173
    Steps:
      1. Navigate to: http://localhost:5173
      2. Wait for: [data-testid="sidebar"] visible (timeout: 10s)
      3. Assert: [data-testid="file-explorer"] exists
      4. Click: 第一个文件夹图标
      5. Wait for: 子项目出现 (timeout: 3s)
      6. Assert: 子文件/文件夹可见
      7. Screenshot: .sisyphus/evidence/task-4-file-explorer.png
    Expected Result: 文件树可见，可展开
    Evidence: .sisyphus/evidence/task-4-file-explorer.png

  Scenario: 错误处理验证
    Tool: Playwright
    Steps:
      1. 模拟无效路径请求
      2. Assert: 显示错误信息而非崩溃
    Expected Result: 优雅的错误处理
    Evidence: Screenshot
  ```

  **Commit**: YES
  - Message: `feat(ui): add LocalFileExplorer component for directory browsing`
  - Files: `src/renderer/src/components/sidebar/LocalFileExplorer.tsx`, `src/renderer/src/components/layout/Sidebar.tsx`
  - Pre-commit: `bun run typecheck`

---

### Phase 2: Browser AI Integration

- [x] 6. 绑定浏览器工具到Agent系统

  **What to do**:
  - 确保 `src/main/services/tools/builtin/browser-tools.ts` 中所有工具已适配
  - 在 `src/main/services/tools/index.ts` 中注册完整浏览器工具集
  - 更新 `src/main/services/delegate/agents.ts` 添加浏览器工具到相关Agent
  - 确保工具定义符合OpenAI function calling格式
  - 添加工具到tool-execution.service的调用链

  **Must NOT do**:
  - 创建新的浏览器功能
  - 修改BrowserViewManager核心逻辑
  - 给所有Agent添加浏览器权限（仅executor类型）

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []
  - Reason: 需要理解工具系统架构

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 5)
  - **Blocks**: Task 12
  - **Blocked By**: Task 0

  **References**:
  - `src/main/services/ai-browser/tools/index.ts` - 浏览器工具定义
  - `src/main/services/tools/builtin/browser-tools.ts` - 工具适配器
  - `src/main/services/tools/tool-execution.service.ts` - 工具执行服务
  - `src/main/services/delegate/delegate-engine.ts:197-200` - LLM适配器调用

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: 工具注册验证
    Tool: Bash
    Steps:
      1. grep -c "register" src/main/services/tools/index.ts
      2. grep "browser" src/main/services/tools/index.ts
    Expected Result: 浏览器工具已注册
    Evidence: 命令输出

  Scenario: Agent工具列表验证
    Tool: Bash
    Steps:
      1. grep -A5 "luban" src/main/services/delegate/agents.ts
      2. Assert: tools数组包含browser相关工具
    Expected Result: executor类型Agent有浏览器工具
    Evidence: 命令输出

  Scenario: 工具调用集成测试
    Tool: Bash (integration test)
    Steps:
      1. 运行测试: bun test src/main/services/tools/browser-tools.test.ts
    Expected Result: 测试通过
    Evidence: 测试输出
  ```

  **Commit**: YES
  - Message: `feat(tools): integrate browser tools with agent system`
  - Files: `src/main/services/tools/index.ts`, `src/main/services/delegate/agents.ts`
  - Pre-commit: `bun test`

---

### Phase 3: Agent System Migration

- [x] 5. 移植Explore Agent（验证模式）

  **What to do**:
  - 创建 `src/main/services/delegate/prompts/explore.ts`
  - 从oh-my-opencode移植Explore Agent提示模板
  - 适配CodeAll的变量注入格式
  - 更新agents.ts中explore的定义使用新提示
  - 编写单元测试验证提示加载
  - 编写集成测试验证Agent可调用

  **Must NOT do**:
  - 重写提示内容（移植并适配）
  - 修改Explore的工具限制（保持readonly）

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []
  - Reason: 首个Agent迁移，建立模式

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 6)
  - **Blocks**: Tasks 7-11 (pattern validation)
  - **Blocked By**: Task 3

  **References**:
  - `参考项目/oh-my-opencode/src/agents/explore.ts` - 原始Explore实现
  - `src/shared/agent-definitions.ts:115-124` - 千里眼(QianLiYan)定义
  - `src/main/services/delegate/delegate-engine.ts:207-210` - systemPrompt使用

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: 提示文件创建
    Tool: Bash
    Steps:
      1. ls src/main/services/delegate/prompts/explore.ts
      2. wc -l src/main/services/delegate/prompts/explore.ts
    Expected Result: 文件存在，至少200行
    Evidence: 命令输出

  Scenario: 提示内容验证
    Tool: Bash
    Steps:
      1. grep "千里眼\|QianLiYan\|Explore" src/main/services/delegate/prompts/explore.ts
      2. grep "readonly\|READ-ONLY" src/main/services/delegate/prompts/explore.ts
    Expected Result: 包含Agent身份和权限限制
    Evidence: 命令输出

  Scenario: Agent调用集成测试
    Tool: Bash
    Steps:
      1. 创建测试文件并运行: bun test src/main/services/delegate/explore.test.ts
      2. 测试内容: 调用DelegateEngine.delegateTask({subagent_type: 'explore', prompt: 'test'})
    Expected Result: 返回结果无错误
    Evidence: 测试输出
  ```

  **Commit**: YES
  - Message: `feat(agents): migrate Explore (QianLiYan) agent with prompt template`
  - Files: `src/main/services/delegate/prompts/explore.ts`, `src/main/services/delegate/prompts/index.ts`
  - Pre-commit: `bun run typecheck`

---

- [x] 7. 移植Oracle Agent

  **What to do**:
  - 创建 `src/main/services/delegate/prompts/oracle.ts`
  - 从oh-my-opencode移植Oracle Agent提示模板（约300行）
  - 适配为白泽(BaiZe)命名
  - 确保readonly工具限制
  - 添加到prompts/index.ts导出

  **Must NOT do**:
  - 修改工具权限（保持readonly）
  - 重新设计提示内容

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []
  - Reason: Agent迁移任务

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 8, 9, 10, 11)
  - **Blocks**: Task 12
  - **Blocked By**: Task 5

  **References**:
  - `参考项目/oh-my-opencode/src/agents/oracle.ts` - 原始Oracle实现
  - `src/shared/agent-definitions.ts:75-84` - 白泽(BaiZe)定义
  - `src/main/services/delegate/prompts/explore.ts` - 迁移模式参考

  **Acceptance Criteria**:

  ```
  Scenario: Oracle提示验证
    Tool: Bash
    Steps:
      1. ls src/main/services/delegate/prompts/oracle.ts
      2. grep "白泽\|BaiZe\|Oracle" src/main/services/delegate/prompts/oracle.ts
      3. wc -l src/main/services/delegate/prompts/oracle.ts
    Expected Result: 文件存在，包含身份标识，至少200行
    Evidence: 命令输出
  ```

  **Commit**: YES
  - Message: `feat(agents): migrate Oracle (BaiZe) agent with prompt template`
  - Files: `src/main/services/delegate/prompts/oracle.ts`
  - Pre-commit: `bun run typecheck`

---

- [x] 8. 移植Librarian Agent

  **What to do**:
  - 创建 `src/main/services/delegate/prompts/librarian.ts`
  - 从oh-my-opencode移植Librarian Agent提示模板
  - 适配为谛听(DiTing)命名
  - 确保工具集包含: webfetch, websearch, context7, github_search
  - 添加到prompts/index.ts导出

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 12
  - **Blocked By**: Task 5

  **References**:
  - `参考项目/oh-my-opencode/src/agents/librarian.ts` - 原始Librarian实现
  - `src/shared/agent-definitions.ts:105-114` - 谛听(DiTing)定义

  **Acceptance Criteria**:

  ```
  Scenario: Librarian提示验证
    Tool: Bash
    Steps:
      1. ls src/main/services/delegate/prompts/librarian.ts
      2. grep "谛听\|DiTing\|Librarian" src/main/services/delegate/prompts/librarian.ts
    Expected Result: 文件存在，包含身份标识
    Evidence: 命令输出
  ```

  **Commit**: YES
  - Message: `feat(agents): migrate Librarian (DiTing) agent with prompt template`
  - Files: `src/main/services/delegate/prompts/librarian.ts`
  - Pre-commit: `bun run typecheck`

---

- [x] 9. 移植Metis Agent

  **What to do**:
  - 创建 `src/main/services/delegate/prompts/metis.ts`
  - 从oh-my-opencode移植Metis Agent提示模板（约347行）
  - 适配为重明(ChongMing)命名
  - 预规划分析专用提示
  - 添加到prompts/index.ts导出

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 12
  - **Blocked By**: Task 5

  **References**:
  - `参考项目/oh-my-opencode/src/agents/metis.ts` - 原始Metis实现
  - `src/shared/agent-definitions.ts:85-94` - 重明(ChongMing)定义

  **Acceptance Criteria**:

  ```
  Scenario: Metis提示验证
    Tool: Bash
    Steps:
      1. ls src/main/services/delegate/prompts/metis.ts
      2. grep "重明\|ChongMing\|Metis" src/main/services/delegate/prompts/metis.ts
    Expected Result: 文件存在，包含身份标识
    Evidence: 命令输出
  ```

  **Commit**: YES
  - Message: `feat(agents): migrate Metis (ChongMing) agent with prompt template`
  - Files: `src/main/services/delegate/prompts/metis.ts`
  - Pre-commit: `bun run typecheck`

---

- [x] 10. 移植Momus Agent

  **What to do**:
  - 创建 `src/main/services/delegate/prompts/momus.ts`
  - 从oh-my-opencode移植Momus Agent提示模板
  - 适配为雷公(LeiGong)命名
  - 计划审查专用提示
  - 添加到prompts/index.ts导出

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 12
  - **Blocked By**: Task 5

  **References**:
  - `参考项目/oh-my-opencode/src/agents/momus.ts` - 原始Momus实现
  - `src/shared/agent-definitions.ts:95-104` - 雷公(LeiGong)定义

  **Acceptance Criteria**:

  ```
  Scenario: Momus提示验证
    Tool: Bash
    Steps:
      1. ls src/main/services/delegate/prompts/momus.ts
      2. grep "雷公\|LeiGong\|Momus" src/main/services/delegate/prompts/momus.ts
    Expected Result: 文件存在，包含身份标识
    Evidence: 命令输出
  ```

  **Commit**: YES
  - Message: `feat(agents): migrate Momus (LeiGong) agent with prompt template`
  - Files: `src/main/services/delegate/prompts/momus.ts`
  - Pre-commit: `bun run typecheck`

---

- [x] 11. 移植主要Agents（FuXi/HaoTian/KuaFu/LuBan）

  **What to do**:
  - 创建 `src/main/services/delegate/prompts/prometheus.ts` (伏羲/FuXi) - 战略规划器
  - 创建 `src/main/services/delegate/prompts/sisyphus.ts` (昊天/HaoTian) - 主编排器
  - 创建 `src/main/services/delegate/prompts/atlas.ts` (夸父/KuaFu) - 工作计划执行器
  - 创建 `src/main/services/delegate/prompts/hephaestus.ts` (鲁班/LuBan) - 自主深度工作者
  - 每个约400-600行提示模板
  - 确保executor类型Agent有完整工具集

  **Must NOT do**:
  - 简化提示内容
  - 修改Agent角色定义

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []
  - Reason: 复杂提示模板迁移

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 7-10)
  - **Blocks**: Task 12
  - **Blocked By**: Task 5

  **References**:
  - `参考项目/oh-my-opencode/src/agents/prometheus/` - Prometheus模块
  - `参考项目/oh-my-opencode/src/agents/sisyphus.ts` - Sisyphus实现
  - `参考项目/oh-my-opencode/src/agents/atlas/` - Atlas模块
  - `参考项目/oh-my-opencode/src/agents/hephaestus.ts` - Hephaestus实现
  - `src/shared/agent-definitions.ts:31-72` - 主要Agent定义

  **Acceptance Criteria**:

  ```
  Scenario: 主要Agent提示验证
    Tool: Bash
    Steps:
      1. ls src/main/services/delegate/prompts/prometheus.ts
      2. ls src/main/services/delegate/prompts/sisyphus.ts
      3. ls src/main/services/delegate/prompts/atlas.ts
      4. ls src/main/services/delegate/prompts/hephaestus.ts
      5. wc -l src/main/services/delegate/prompts/*.ts | tail -1
    Expected Result: 4个文件存在，总计超过1500行
    Evidence: 命令输出

  Scenario: 身份标识验证
    Tool: Bash
    Steps:
      1. grep "伏羲\|FuXi" src/main/services/delegate/prompts/prometheus.ts
      2. grep "昊天\|HaoTian" src/main/services/delegate/prompts/sisyphus.ts
      3. grep "夸父\|KuaFu" src/main/services/delegate/prompts/atlas.ts
      4. grep "鲁班\|LuBan" src/main/services/delegate/prompts/hephaestus.ts
    Expected Result: 每个文件包含对应中文名称
    Evidence: 命令输出
  ```

  **Commit**: YES
  - Message: `feat(agents): migrate primary agents (FuXi, HaoTian, KuaFu, LuBan) with prompt templates`
  - Files: `src/main/services/delegate/prompts/prometheus.ts`, `sisyphus.ts`, `atlas.ts`, `hephaestus.ts`
  - Pre-commit: `bun run typecheck`

---

### Phase 4: Integration & Cleanup

- [x] 12. 统一Agent定义并清理遗留代码

  **What to do**:
  - 更新 `src/main/services/delegate/agents.ts`:
    - 移除旧的hardcoded agents (oracle, explore, librarian)
    - 从 `agent-definitions.ts` 导入并使用统一定义
    - 每个Agent关联对应的提示模板
    - 设置正确的工具限制
  - 更新 DelegateEngine 使用新的Agent解析逻辑
  - 确保 BindingService 与新定义兼容
  - 运行完整测试套件

  **Must NOT do**:
  - 删除agent-definitions.ts（这是源头）
  - 修改Category定义（已完整）

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - Reason: 清理和统一任务

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (final)
  - **Blocks**: None
  - **Blocked By**: Tasks 4, 6, 7-11

  **References**:
  - `src/main/services/delegate/agents.ts` - 当前遗留定义
  - `src/shared/agent-definitions.ts` - 统一定义源
  - `src/main/services/binding.service.ts` - 绑定服务
  - `src/main/services/delegate/delegate-engine.ts` - 委托引擎

  **Acceptance Criteria**:

  ```
  Scenario: Agent定义统一验证
    Tool: Bash
    Steps:
      1. grep -c "from '@/shared/agent-definitions'" src/main/services/delegate/agents.ts
      2. 确认无hardcoded agent定义
    Expected Result: 使用统一导入，无hardcoded
    Evidence: 命令输出

  Scenario: 完整Agent列表验证
    Tool: Bash
    Steps:
      1. grep "code:" src/main/services/delegate/agents.ts | wc -l
    Expected Result: 至少9个Agent
    Evidence: 命令输出

  Scenario: 端到端集成测试
    Tool: Bash
    Steps:
      1. bun test src/main/services/delegate/
      2. bun run typecheck
    Expected Result: 所有测试通过，无类型错误
    Evidence: 测试输出
  ```

  **Commit**: YES
  - Message: `refactor(agents): unify agent definitions and remove legacy code`
  - Files: `src/main/services/delegate/agents.ts`, `src/main/services/delegate/delegate-engine.ts`
  - Pre-commit: `bun test && bun run typecheck`

---

## Commit Strategy

| After Task | Message                                                  | Files                                               | Verification |
| ---------- | -------------------------------------------------------- | --------------------------------------------------- | ------------ |
| 1+2        | `feat(ipc): add file-tree handlers and preload channels` | file-tree.ts, index.ts, preload.ts                  | typecheck    |
| 3          | `chore(delegate): create prompts directory structure`    | prompts/\*                                          | typecheck    |
| 4          | `feat(ui): add LocalFileExplorer component`              | LocalFileExplorer.tsx, Sidebar.tsx                  | typecheck    |
| 5          | `feat(agents): migrate Explore agent`                    | explore.ts                                          | typecheck    |
| 6          | `feat(tools): integrate browser tools with agents`       | tools/index.ts, agents.ts                           | test         |
| 7          | `feat(agents): migrate Oracle agent`                     | oracle.ts                                           | typecheck    |
| 8          | `feat(agents): migrate Librarian agent`                  | librarian.ts                                        | typecheck    |
| 9          | `feat(agents): migrate Metis agent`                      | metis.ts                                            | typecheck    |
| 10         | `feat(agents): migrate Momus agent`                      | momus.ts                                            | typecheck    |
| 11         | `feat(agents): migrate primary agents`                   | prometheus.ts, sisyphus.ts, atlas.ts, hephaestus.ts | typecheck    |
| 12         | `refactor(agents): unify definitions and cleanup`        | agents.ts, delegate-engine.ts                       | test         |

---

## Success Criteria

### Verification Commands

```bash
# 1. TypeScript编译
bun run typecheck  # Expected: 无错误

# 2. 单元测试
bun test  # Expected: 所有测试通过

# 3. 文件树IPC测试
grep -r "file-tree" src/main/ipc/  # Expected: handler存在

# 4. Agent数量验证
grep -c "code:" src/main/services/delegate/agents.ts  # Expected: >= 9

# 5. 提示模板行数
wc -l src/main/services/delegate/prompts/*.ts  # Expected: > 2000 total

# 6. 浏览器工具注册
grep "browser" src/main/services/tools/index.ts  # Expected: 工具已注册
```

### Final Checklist

- [x] 文件树在UI侧边栏可见并可交互
- [x] AI Agent可成功调用浏览器工具
- [x] 9个Agent全部注册并有提示模板
- [x] 所有Agent遵循中国神话命名
- [x] 遗留Agent定义已清理
- [x] TypeScript编译无错误
- [x] 单元测试全部通过

---

## Agent 对照表（最终状态）

| omo Agent  | CodeAll代码名 | 中文名 | 类型     | 提示模板文件  |
| ---------- | ------------- | ------ | -------- | ------------- |
| Prometheus | fuxi          | 伏羲   | primary  | prometheus.ts |
| Sisyphus   | haotian       | 昊天   | primary  | sisyphus.ts   |
| Atlas      | kuafu         | 夸父   | primary  | atlas.ts      |
| Hephaestus | luban         | 鲁班   | primary  | hephaestus.ts |
| Oracle     | baize         | 白泽   | subagent | oracle.ts     |
| Metis      | chongming     | 重明   | subagent | metis.ts      |
| Momus      | leigong       | 雷公   | subagent | momus.ts      |
| Librarian  | diting        | 谛听   | subagent | librarian.ts  |
| Explore    | qianliyan     | 千里眼 | subagent | explore.ts    |

---

## Risk Mitigation

| Risk                  | Mitigation                       |
| --------------------- | -------------------------------- |
| FileTreeService不工作 | Task 0验证，阻塞后续任务         |
| 提示模板过长          | 使用动态截断或分段加载           |
| 工具格式不兼容        | 参考现有browser-tools.ts适配模式 |
| 类型错误累积          | 每个task后运行typecheck          |
| 遗留代码依赖          | 先验证新系统，再删除旧代码       |
