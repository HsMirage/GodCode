# 提供商重构 + 全局导航优化

## TL;DR

> **Quick Summary**: 移除所有预设 AI 服务提供商，统一为 OpenAI 兼容 API 接入方式；在全局导航栏添加条件返回按钮，为所有子界面提供一致的返回功能。
>
> **Deliverables**:
>
> - 简化后的 LLM 适配器系统（仅 OpenAI 兼容）
> - 重构后的模型配置表单（Base URL + API Key 选择）
> - 重构后的 API 密钥管理（自定义标签列表）
> - 全局导航栏条件返回按钮
> - 数据迁移脚本
> - 完整的自动化测试套件
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: Task 1 → Task 3 → Task 5 → Task 8

---

## Context

### Original Request

1. 移除所有预设的AI服务提供商接入模块（Anthropic、OpenAI、Google、Ollama），重构为单一的自定义 OpenAI 兼容 API 接入方式
2. 修复所有子界面缺乏返回功能的问题，在全局导航栏添加条件返回按钮

### Interview Summary

**Key Discussions**:

- UI设计: 完全移除提供商选择下拉，只显示 Base URL (必填) 和 API Key 选择
- 密钥管理: 保留多密钥功能，每个密钥有自定义标签，模型配置通过下拉选择密钥标签
- 路由规则: 重置为默认规则，清除引用特定提供商的规则
- 返回按钮: 添加到全局导航栏 (TopNavigation)，非首页时显示
- ChatPage: 不需要返回按钮，tabs 设计已足够直观
- 测试策略: TDD with Vitest + Playwright

**Research Findings**:

- `OpenAICompatAdapter` 继承自 `OpenAIAdapter`，保留基类作为依赖
- `SettingsPage` 已有返回按钮实现可作为参考模式
- 数据库 `Model` 表有 `provider` 字段，`ApiKey` 表按 `provider` 唯一索引
- 路由使用 React Router HashRouter，两个路由: `/` 和 `/settings`

### Metis Review

**Identified Gaps** (addressed):

- 数据迁移策略: 保留 `provider` 字段，值统一设为 `"openai-compat"`
- 返回按钮行为: 使用 `navigate(-1)` 并检查历史长度，无历史时回退到 `/`
- 路由规则重置: 同时更新代码默认值和清除数据库持久化规则
- 隐藏的 provider 使用: 需全局搜索并更新所有引用点

---

## Work Objectives

### Core Objective

将多提供商 LLM 系统简化为单一 OpenAI 兼容接入方式，同时通过全局导航栏返回按钮提升子界面导航体验。

### Concrete Deliverables

- `src/main/services/llm/factory.ts` - 简化后的适配器工厂
- `src/renderer/src/components/ModelConfigForm.tsx` - 重构后的模型配置表单
- `src/renderer/src/components/settings/ApiKeyForm.tsx` - 重构后的 API 密钥管理
- `src/renderer/src/components/layout/TopNavigation.tsx` - 添加条件返回按钮
- `src/main/ipc/handlers/keychain.ts` - 更新密钥管理 IPC
- `prisma/migrations/xxx_migrate_provider.sql` - 数据迁移
- `tests/ui/*.spec.ts` - Playwright UI 测试
- `tests/unit/*.test.ts` - Vitest 单元测试

### Definition of Done

- [ ] 所有预设提供商选项从 UI 完全移除 (`pnpm test:e2e -- --grep "no provider dropdown"` PASS)
- [ ] 自定义 API 接入功能正常工作 (`pnpm test:e2e -- --grep "openai-compat"` PASS)
- [ ] 所有子界面返回按钮功能正常 (`pnpm test:e2e -- --grep "back button"` PASS)
- [ ] 整体应用稳定性测试通过 (`pnpm test` PASS)

### Must Have

- Base URL 字段必填验证
- API 密钥自定义标签管理
- 模型配置选择已保存的密钥标签
- 全局导航栏条件返回按钮
- 数据迁移脚本

### Must NOT Have (Guardrails)

- 不添加新的 AI 提供商或扩展设置功能
- 不修改与返回按钮无关的导航或路由
- 不更改 ChatPage 内部 tabs 导航
- 不在每个页面单独实现返回按钮（使用统一的全局导航）
- 不为未使用的提供商保留死代码

---

## Verification Strategy (MANDATORY)

### Test Decision

- **Infrastructure exists**: YES (Vitest + Playwright)
- **User wants tests**: TDD
- **Framework**: Vitest (unit), Playwright (e2e)

### TDD Workflow

Each TODO follows RED-GREEN-REFACTOR:

1. **RED**: Write failing test first
2. **GREEN**: Implement minimum code to pass
3. **REFACTOR**: Clean up while keeping green

### Automated Verification Tools

| Type            | Verification Tool | Automated Procedure                  |
| --------------- | ----------------- | ------------------------------------ |
| **Frontend/UI** | Playwright        | Navigate, interact, assert DOM state |
| **API/Backend** | Vitest + mock     | Unit test adapter and factory        |
| **Database**    | Prisma + script   | Verify migration with queries        |

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately):
├── Task 1: 重构 API 密钥管理 (ApiKeyForm)
├── Task 2: 添加全局返回按钮 (TopNavigation)
└── Task 6: 搜索并记录所有 provider 引用点

Wave 2 (After Wave 1):
├── Task 3: 重构模型配置表单 (ModelConfigForm) [depends: 1]
├── Task 4: 简化 LLM 工厂 (factory.ts) [depends: 6]
└── Task 5: 更新路由规则默认值 [depends: 6]

Wave 3 (After Wave 2):
├── Task 7: 数据迁移脚本 [depends: 4]
└── Task 8: 集成测试与清理 [depends: 3, 4, 5, 7]
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
| ---- | ---------- | ------ | -------------------- |
| 1    | None       | 3      | 2, 6                 |
| 2    | None       | 8      | 1, 6                 |
| 3    | 1          | 8      | 4, 5                 |
| 4    | 6          | 7, 8   | 3, 5                 |
| 5    | 6          | 8      | 3, 4                 |
| 6    | None       | 4, 5   | 1, 2                 |
| 7    | 4          | 8      | -                    |
| 8    | 3, 4, 5, 7 | None   | -                    |

### Agent Dispatch Summary

| Wave | Tasks   | Recommended Agents                                                                       |
| ---- | ------- | ---------------------------------------------------------------------------------------- |
| 1    | 1, 2, 6 | `delegate_task(category="visual-engineering")`, `delegate_task(subagent_type="explore")` |
| 2    | 3, 4, 5 | `delegate_task(category="quick")`                                                        |
| 3    | 7, 8    | `delegate_task(category="quick")`                                                        |

---

## TODOs

### Task 1: 重构 API 密钥管理

- [x] 1. 重构 ApiKeyForm 为自定义标签列表

  **What to do**:
  - 移除按提供商分类的固定列表 (`PROVIDERS` 常量)
  - 改为动态列表：用户可添加/编辑/删除自定义 API 密钥条目
  - 每个条目包含: 自定义标签 (label)、Base URL (必填)、API Key
  - 添加 "新增密钥" 按钮
  - 更新 IPC 调用以支持新的数据结构
  - 更新 Prisma schema: `ApiKey` 表添加 `label` 和 `baseURL` 字段，移除 `provider` 唯一约束

  **Must NOT do**:
  - 不保留任何硬编码的提供商列表
  - 不使用固定的 provider 名称作为键

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: 涉及 React 组件重构和表单 UI 设计
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: 需要设计新的动态列表 UI 和交互模式

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 6)
  - **Blocks**: Task 3 (模型配置需要引用密钥标签)
  - **Blocked By**: None

  **References**:

  **Pattern References** (existing code to follow):
  - `src/renderer/src/components/settings/ApiKeyForm.tsx:1-241` - 当前实现，需完全重构
  - `src/renderer/src/pages/SettingsPage.tsx:349-423` - 路由规则的动态列表 UI 模式可参考

  **API/Type References** (contracts to implement against):
  - `src/main/ipc/handlers/keychain.ts` - IPC 处理器，需更新支持新数据结构
  - `prisma/schema.prisma:126-135` - ApiKey 表定义，需添加 label 和 baseURL 字段

  **Test References**:
  - 项目使用 Vitest + Playwright，参考 `package.json` 中的测试脚本配置

  **Acceptance Criteria**:

  **TDD Tests (create first):**
  - [ ] Test file created: `tests/unit/api-key-form.test.ts`
  - [ ] Test covers: 添加新密钥条目、编辑标签、删除条目、Base URL 必填验证
  - [ ] `pnpm test tests/unit/api-key-form.test.ts` → PASS

  **Automated Verification (Playwright):**

  ```
  # tests/e2e/api-key-management.spec.ts
  1. Navigate to: http://localhost:5173/#/settings
  2. Click tab: "API密钥"
  3. Assert: 无固定提供商列表 (OpenAI, Anthropic, Google)
  4. Click: "新增密钥" 按钮
  5. Fill: 标签输入框 with "My Custom API"
  6. Fill: Base URL 输入框 with "https://api.example.com/v1"
  7. Fill: API Key 输入框 with "sk-test-key"
  8. Click: "保存" 按钮
  9. Assert: 列表中显示 "My Custom API" 条目
  10. Screenshot: .sisyphus/evidence/task-1-api-key-list.png
  ```

  **Evidence to Capture:**
  - [ ] 截图显示新的密钥列表 UI
  - [ ] 测试输出日志

  **Commit**: YES
  - Message: `refactor(settings): convert ApiKeyForm to custom label-based key management`
  - Files: `src/renderer/src/components/settings/ApiKeyForm.tsx`, `src/main/ipc/handlers/keychain.ts`, `prisma/schema.prisma`
  - Pre-commit: `pnpm test`

---

### Task 2: 添加全局导航栏返回按钮

- [x] 2. 在 TopNavigation 添加条件返回按钮

  **What to do**:
  - 在 `TopNavigation.tsx` 添加返回按钮，仅在非首页路由时显示
  - 使用 `useLocation` 检测当前路由
  - 使用 `useNavigate` 实现返回功能，并处理历史为空的情况（回退到 `/`）
  - 返回按钮样式参考 SettingsPage 现有实现
  - 移除 SettingsPage 中的独立返回按钮（改用全局导航栏）

  **Must NOT do**:
  - 不修改 ChatPage 内部的 tabs 导航
  - 不添加与导航无关的功能

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: React 组件修改 + 路由逻辑
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: 确保返回按钮样式一致

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 6)
  - **Blocks**: Task 8 (集成测试)
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/renderer/src/pages/SettingsPage.tsx:273-280` - 现有返回按钮实现模式
  - `src/renderer/src/components/layout/TopNavigation.tsx` - 需修改的目标文件

  **Test References**:
  - Playwright 用于 UI 测试

  **Acceptance Criteria**:

  **TDD Tests:**
  - [ ] Test file created: `tests/e2e/back-button.spec.ts`
  - [ ] `pnpm test:e2e tests/e2e/back-button.spec.ts` → PASS

  **Automated Verification (Playwright):**

  ```
  # tests/e2e/back-button.spec.ts

  # Test 1: 首页不显示返回按钮
  1. Navigate to: http://localhost:5173/#/
  2. Assert: 返回按钮不存在 (selector: "[data-testid='back-button']")

  # Test 2: 设置页显示返回按钮
  1. Navigate to: http://localhost:5173/#/settings
  2. Assert: 返回按钮存在且可见
  3. Screenshot: .sisyphus/evidence/task-2-settings-back-button.png

  # Test 3: 点击返回按钮回到首页
  1. Navigate to: http://localhost:5173/#/
  2. Navigate to: http://localhost:5173/#/settings
  3. Click: "[data-testid='back-button']"
  4. Assert: URL is http://localhost:5173/#/
  ```

  **Evidence to Capture:**
  - [ ] 截图显示设置页的返回按钮
  - [ ] 测试输出日志

  **Commit**: YES
  - Message: `feat(nav): add conditional back button to global navigation`
  - Files: `src/renderer/src/components/layout/TopNavigation.tsx`, `src/renderer/src/pages/SettingsPage.tsx`
  - Pre-commit: `pnpm test`

---

### Task 3: 重构模型配置表单

- [x] 3. 重构 ModelConfigForm 移除提供商选择

  **What to do**:
  - 移除 `provider` 下拉选择 (anthropic, openai, google, ollama, custom)
  - 保留 `modelName` 输入框
  - 将 `apiKey` 输入框改为下拉选择，选项来自已保存的 API 密钥标签
  - `baseURL` 字段保留但改为只读，显示所选密钥的 Base URL
  - 更新表单提交逻辑，`provider` 值固定为 `"openai-compat"`

  **Must NOT do**:
  - 不保留任何提供商选择 UI
  - 不允许在此表单直接输入 API Key（必须先在密钥管理中创建）

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: React 表单组件重构
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 5)
  - **Blocks**: Task 8
  - **Blocked By**: Task 1 (需要密钥标签列表 API)

  **References**:

  **Pattern References**:
  - `src/renderer/src/components/ModelConfigForm.tsx:1-212` - 当前实现
  - `src/renderer/src/components/settings/ApiKeyForm.tsx` - Task 1 重构后的密钥管理

  **API/Type References**:
  - `src/renderer/src/types/domain.ts` - Model 类型定义
  - `src/main/ipc/handlers/model.ts` - 模型 CRUD IPC

  **Acceptance Criteria**:

  **TDD Tests:**
  - [ ] Test file: `tests/unit/model-config-form.test.ts`
  - [ ] `pnpm test tests/unit/model-config-form.test.ts` → PASS

  **Automated Verification (Playwright):**

  ```
  # tests/e2e/model-config.spec.ts
  1. Navigate to: http://localhost:5173/#/settings
  2. Assert: 无 "提供商" 下拉选择
  3. Assert: 有 "模型名称" 输入框
  4. Assert: 有 "API 密钥" 下拉选择 (不是输入框)
  5. Fill: 模型名称 with "gpt-4o"
  6. Select: API 密钥下拉选择第一个选项
  7. Assert: Base URL 字段显示所选密钥的 URL
  8. Screenshot: .sisyphus/evidence/task-3-model-config.png
  ```

  **Commit**: YES
  - Message: `refactor(settings): remove provider selection from ModelConfigForm, use key labels`
  - Files: `src/renderer/src/components/ModelConfigForm.tsx`
  - Pre-commit: `pnpm test`

---

### Task 4: 简化 LLM 适配器工厂

- [x] 4. 重构 factory.ts 移除多提供商支持

  **What to do**:
  - 移除 `switch` 语句中的 anthropic, openai, google, gemini 分支
  - 直接使用 `OpenAICompatAdapter` 作为唯一适配器
  - 保留 `openai.adapter.ts` 作为基类（被 OpenAICompatAdapter 继承）
  - 删除 `anthropic.adapter.ts` 和 `gemini.adapter.ts` 文件
  - 更新 `createLLMAdapter` 函数签名，移除 provider 参数或忽略其值

  **Must NOT do**:
  - 不删除 `openai.adapter.ts`（被继承使用）
  - 不修改 `mock.adapter.ts`（测试用）

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 相对简单的代码删除和重构
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 3, 5)
  - **Blocks**: Task 7, Task 8
  - **Blocked By**: Task 6 (需先确认所有引用点)

  **References**:

  **Pattern References**:
  - `src/main/services/llm/factory.ts:1-32` - 当前工厂实现
  - `src/main/services/llm/openai-compat.adapter.ts` - 保留的适配器

  **Files to Delete**:
  - `src/main/services/llm/anthropic.adapter.ts`
  - `src/main/services/llm/gemini.adapter.ts`

  **Acceptance Criteria**:

  **TDD Tests:**
  - [ ] Test file: `tests/unit/llm-factory.test.ts`
  - [ ] Test covers: createLLMAdapter 返回 OpenAICompatAdapter 实例
  - [ ] `pnpm test tests/unit/llm-factory.test.ts` → PASS

  **Automated Verification (Bash):**

  ```bash
  # 验证文件已删除
  ls src/main/services/llm/anthropic.adapter.ts 2>&1 | grep "No such file"
  ls src/main/services/llm/gemini.adapter.ts 2>&1 | grep "No such file"

  # 验证代码无 switch 语句
  grep -c "case 'anthropic'" src/main/services/llm/factory.ts
  # Assert: 输出为 0
  ```

  **Commit**: YES
  - Message: `refactor(llm): simplify adapter factory to OpenAI-compat only`
  - Files: `src/main/services/llm/factory.ts`, deleted files
  - Pre-commit: `pnpm test`

---

### Task 5: 更新路由规则默认值

- [x] 5. 重置路由规则配置

  **What to do**:
  - 更新 `SettingsPage.tsx` 中的 `DEFAULT_RULES` 常量，移除引用特定模型的规则
  - 添加清除数据库持久化规则的 IPC 调用
  - 新的默认规则应只包含 strategy 和 category，不绑定特定模型

  **Must NOT do**:
  - 不完全删除路由规则功能
  - 不修改规则匹配逻辑

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 简单的配置更新
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 3, 4)
  - **Blocks**: Task 8
  - **Blocked By**: Task 6 (确认规则中的模型引用)

  **References**:

  **Pattern References**:
  - `src/renderer/src/pages/SettingsPage.tsx:27-54` - DEFAULT_RULES 定义

  **Acceptance Criteria**:

  **Automated Verification (Bash):**

  ```bash
  # 验证默认规则不包含特定模型
  grep -E "(gemini|gpt-4|claude-opus)" src/renderer/src/pages/SettingsPage.tsx
  # Assert: 输出为空 (不匹配任何行)
  ```

  **Commit**: YES
  - Message: `refactor(router): reset default routing rules, remove provider-specific models`
  - Files: `src/renderer/src/pages/SettingsPage.tsx`
  - Pre-commit: `pnpm test`

---

### Task 6: 搜索所有 provider 引用点

- [x] 6. 全局搜索并记录 provider 引用

  **What to do**:
  - 使用 grep/lsp_find_references 搜索所有 `provider` 相关引用
  - 记录需要更新的文件列表
  - 为后续任务提供完整的影响范围

  **Recommended Agent Profile**:
  - **Subagent**: `explore`
    - Reason: 代码搜索任务
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Task 4, Task 5
  - **Blocked By**: None

  **References**:
  - 使用 `grep -r "provider" src/` 或 `lsp_find_references`

  **Acceptance Criteria**:

  **Automated Verification (Bash):**

  ```bash
  # 创建引用报告
  grep -rn "provider" src/main/services/llm/ src/renderer/src/components/ > .sisyphus/evidence/provider-references.txt
  wc -l .sisyphus/evidence/provider-references.txt
  # 记录行数作为基准
  ```

  **Commit**: NO (仅研究任务)

---

### Task 7: 数据迁移脚本

- [ ] 7. 创建数据迁移脚本

  **What to do**:
  - 创建 Prisma 迁移：更新 ApiKey 表添加 label/baseURL 字段
  - 创建数据迁移脚本：将所有 `provider` 值更新为 `"openai-compat"`
  - 处理 ApiKey 表的 provider 唯一约束（需修改或移除）

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 数据库迁移任务
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 8
  - **Blocked By**: Task 4 (需工厂重构完成)

  **References**:

  **Pattern References**:
  - `prisma/schema.prisma` - 当前 schema
  - Prisma migration 文档

  **Acceptance Criteria**:

  **Automated Verification (Bash):**

  ```bash
  # 运行迁移
  pnpm prisma migrate dev --name migrate_to_openai_compat

  # 验证迁移成功
  pnpm prisma db execute --stdin <<< "SELECT COUNT(*) FROM \"Model\" WHERE provider != 'openai-compat';"
  # Assert: 输出为 0
  ```

  **Commit**: YES
  - Message: `chore(db): add migration for openai-compat provider unification`
  - Files: `prisma/migrations/*`, `prisma/schema.prisma`
  - Pre-commit: `pnpm prisma generate`

---

### Task 8: 集成测试与清理

- [ ] 8. 最终集成测试和代码清理

  **What to do**:
  - 运行完整测试套件验证所有功能
  - 清理未使用的代码和导入
  - 验证应用稳定性

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 验证和清理任务
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (final)
  - **Blocks**: None
  - **Blocked By**: Tasks 3, 4, 5, 7

  **Acceptance Criteria**:

  **Automated Verification (Bash):**

  ```bash
  # 完整测试套件
  pnpm test
  # Assert: 所有测试通过

  pnpm test:e2e
  # Assert: 所有 E2E 测试通过

  # 类型检查
  pnpm tsc --noEmit
  # Assert: 无类型错误

  # 构建验证
  pnpm build
  # Assert: 构建成功
  ```

  **Commit**: YES
  - Message: `chore: cleanup after provider refactor and navigation optimization`
  - Files: various cleanup
  - Pre-commit: `pnpm test && pnpm build`

---

## Commit Strategy

| After Task | Message                                                                       | Files                                      | Verification            |
| ---------- | ----------------------------------------------------------------------------- | ------------------------------------------ | ----------------------- |
| 1          | `refactor(settings): convert ApiKeyForm to custom label-based key management` | ApiKeyForm.tsx, keychain.ts, schema.prisma | pnpm test               |
| 2          | `feat(nav): add conditional back button to global navigation`                 | TopNavigation.tsx, SettingsPage.tsx        | pnpm test               |
| 3          | `refactor(settings): remove provider selection from ModelConfigForm`          | ModelConfigForm.tsx                        | pnpm test               |
| 4          | `refactor(llm): simplify adapter factory to OpenAI-compat only`               | factory.ts, deleted adapters               | pnpm test               |
| 5          | `refactor(router): reset default routing rules`                               | SettingsPage.tsx                           | pnpm test               |
| 7          | `chore(db): add migration for openai-compat provider unification`             | prisma/\*                                  | pnpm prisma generate    |
| 8          | `chore: cleanup after provider refactor and navigation optimization`          | various                                    | pnpm test && pnpm build |

---

## Success Criteria

### Verification Commands

```bash
# 所有测试通过
pnpm test           # Expected: PASS
pnpm test:e2e       # Expected: PASS

# 类型检查
pnpm tsc --noEmit   # Expected: no errors

# 构建
pnpm build          # Expected: success

# 验证无提供商选项
grep -r "anthropic\|google\|gemini" src/renderer/src/components/ | grep -v test
# Expected: no matches

# 验证返回按钮存在
grep "data-testid='back-button'" src/renderer/src/components/layout/TopNavigation.tsx
# Expected: match found
```

### Final Checklist

- [ ] 所有预设提供商选项从 UI 完全移除
- [ ] 自定义 API 接入功能正常工作
- [ ] 所有子界面返回按钮功能正常
- [ ] 数据迁移成功执行
- [ ] 所有测试通过
- [ ] 构建成功
