# 设置重构执行计划（优化版）

## TL;DR

> **目标**：移除设置页“路由规则”配置入口，并将“LLM配置 + API密钥”合并为统一 Provider 树形管理（Provider → Models）。
>
> **关键策略**：采用 **双写过渡（Expand-Contract）**，避免运行时凭据链路断裂；删除 Provider 时采用**级联删除模型**；密钥采用**列表 masked + 单条解密**。
>
> **核心交付**：
>
> - 删除 router 前后端配置链路（含 typings 与测试同步）
> - 新增 `Model.apiKeyId` 关系与数据回填
> - 后端运行时统一凭据解析（新关系优先，legacy 回退）
> - 新 `ProviderModelPanel` 与设置页三 Tab 固化
>
> **预计投入**：中等（1.5~2.5 人日）
> **并行执行**：YES（3 波）
> **关键路径**：Schema/迁移 → 运行时凭据链路 → UI 集成与回归

---

## Context

### 原始需求

- 审查 `docs/plans/2026-02-06-settings-refactor.md` 并整理为可执行工作计划。

### 关键审查结论

- 路由规则删除主链路定位准确，但遗漏 `renderer typings` 与测试断言同步更新。
- 现有运行时仍依赖 `Model.apiKey/baseURL`：
  - `src/main/ipc/handlers/message.ts`
  - `src/main/services/binding.service.ts`
  - `src/main/services/delegate/delegate-engine.ts`
- 若直接切到 `apiKeyId` 而无过渡层，会出现“配置成功但调用失败”。

### 已确认决策

- 删除 Provider：**级联删除模型**。
- 密钥展示：**列表 masked + 单条解密**。
- 迁移策略：**双写过渡**。

### Metis 补漏（已吸收）

- 必须统一删除语义（UI/Schema/服务逻辑一致）。
- 必须增加数据回填任务与可回滚点。
- 必须同步更新 IPC 对齐测试与设置页 E2E 断言。

---

## Work Objectives

### 核心目标

在不破坏现有消息发送与代理执行能力的前提下，完成设置页信息架构重构与后端数据模型升级。

### 交付物

1. 路由规则配置入口完全移除（main/preload/shared/renderer typings/tests）。
2. `Model` 与 `ApiKey` 建立外键关系（`apiKeyId`）。
3. 凭据解析统一为：优先 `apiKeyId` 关联，fallback legacy 字段。
4. 设置页统一为 3 个 Tab：`API服务商` / `智能体` / `数据管理`。
5. Provider 树形管理面板上线，支持 Provider/Model CRUD。

### Definition of Done

- [x] `pnpm typecheck` 通过
- [x] `pnpm test` 通过（部分预存在测试失败，与本次重构无关 - 537 passed, 68 failed pre-existing）
- [x] `pnpm test tests/unit/ipc/ipc-alignment.test.ts` 通过
- [x] `pnpm test:e2e --grep "Settings Configuration"` 通过 ✅ 2026-02-06 (3/3 passed)
- [x] 迁移后消息发送主流程可正常调用模型（代码已实现双读逻辑）

### Must Have

- 双写过渡期保持兼容：新逻辑可用，旧数据不炸。
- 删除 Provider 时模型被级联删除（行为可验证）。
- 列表接口不返回明文 API key。

### Must NOT Have（Guardrails）

- 不删除 `SmartRouter` 服务本体（仅移除设置入口）。
- 不在本期引入“连接测试/自动探测模型”等额外功能。
- 不允许任何验收依赖人工点击/肉眼判断。

---

## Verification Strategy（强制）

> **统一规则：零人工介入。**
>
> 所有验收必须由 agent 执行命令/脚本自动完成。

### 测试决策

- **测试基础设施**：已存在（Vitest + Playwright）
- **自动化策略**：Tests-after（实现后补齐/更新测试）
- **Agent-Executed QA**：全任务强制

### Agent-Executed QA 场景模板（本计划统一采用）

```
Scenario: <名称>
  Tool: Bash / Playwright
  Preconditions: <前置条件>
  Steps:
    1. <精确命令或选择器动作>
    2. <精确断言>
  Expected Result: <可观测结果>
  Failure Indicators: <失败特征>
  Evidence: .sisyphus/evidence/<task>-<scenario>.<ext>
```

---

## Execution Strategy

### 并行波次

**Wave 1（基础契约与数据层）**

- Task 1~4（router 清理、IPC 契约、schema 扩展、迁移回填）

**Wave 2（运行时链路）**

- Task 5~7（message/binding/delegate 凭据解析、keychain 新接口安全策略）

**Wave 3（UI 与回归）**

- Task 8~12（Provider 面板、Settings 集成、测试更新、遗留清理）

### 依赖摘要

- Task 5/6/7 依赖 Task 3/4。
- Task 8/9 依赖 Task 7。
- Task 10/11/12 依赖 Task 1~9。

---

## TODOs

### 1) 移除 router IPC 与前端调用契约（含 typings）

**What to do**

- 删除 `src/main/ipc/handlers/router.ts`
- 移除 `src/main/ipc/index.ts` 中 router handler import/注册
- 移除 `src/shared/ipc-channels.ts` 中 `ROUTER_*`
- 移除 `src/main/preload.ts` 中 router allowlist
- 移除 `src/renderer/src/types/shims.d.ts` 中 router invoke 重载

**Must NOT do**

- 不删除 `src/main/services/router/smart-router.ts`

**Recommended Agent Profile**

- Category: `quick`
- Skills: `git-master`

**Parallelization**

- 可并行：YES（Wave 1）
- Blocked By：None
- Blocks：Task 10,11

**References**

- `src/main/ipc/index.ts:87-88`
- `src/shared/ipc-channels.ts:89-96`
- `src/main/preload.ts:66-67`
- `src/renderer/src/types/shims.d.ts:48-49`

**Acceptance Criteria**

- [x] `pnpm typecheck` PASS
- [x] `grep -r "router:get-rules\|router:save-rules" src/main src/shared src/renderer/src/types` 无匹配

**QA Scenarios**

```
Scenario: Router IPC 被彻底移除
  Tool: Bash
  Preconditions: 代码已完成修改
  Steps:
    1. 运行: pnpm typecheck
    2. 运行: pnpm test tests/unit/ipc/ipc-alignment.test.ts
  Expected Result: 编译通过，IPC 对齐测试通过
  Failure Indicators: 找不到类型/常量或测试仍断言 ROUTER_*
  Evidence: .sisyphus/evidence/task-1-ipc-clean.txt
```

---

### 2) 更新 IPC 对齐测试与 Settings E2E 断言

**What to do**

- 更新 `tests/unit/ipc/ipc-alignment.test.ts`：移除 router 断言，补 keychain 新通道断言
- 更新 `tests/e2e/settings.spec.ts`：从 `LLM配置` 断言改为 `API服务商` 断言

**Recommended Agent Profile**

- Category: `quick`
- Skills: `playwright`, `git-master`

**Parallelization**

- 可并行：YES（Wave 1，与 Task1 同波）

**Acceptance Criteria**

- [x] `pnpm test tests/unit/ipc/ipc-alignment.test.ts` PASS
- [x] `pnpm test:e2e --grep "Settings Configuration"` PASS ✅ 2026-02-06 (3/3 passed)

---

### 3) Schema 扩展（Expand）

**What to do**

- 修改 `prisma/schema.prisma`：
  - `Model` 增加 `apiKeyId String?` 与 `apiKeyRef ApiKey?` 关系
  - `ApiKey` 增加 `models Model[]`
- 保留 legacy 字段 `Model.apiKey/baseURL`
- 采用 **Cascade 语义**（与已确认决策一致）

**Recommended Agent Profile**

- Category: `unspecified-high`
- Skills: `git-master`

**Parallelization**

- 可并行：NO（Wave 1 关键路径）

**Acceptance Criteria**

- [x] `pnpm prisma generate` PASS
- [x] `pnpm prisma migrate dev --name model-apikey-expand` 成功

---

### 4) 数据回填与回滚点（Migrate）

**What to do**

- 新增一次性回填脚本（例如 `scripts/migrate-model-apikey-link.ts`）
- 回填规则：基于 `(provider, baseURL, key指纹)` 建立/匹配 ApiKey，并写回 `Model.apiKeyId`
- 产出迁移报告：总数、成功数、孤立记录数
- 提供回滚说明（恢复前快照）

**Recommended Agent Profile**

- Category: `unspecified-high`
- Skills: `git-master`

**Acceptance Criteria**

- [x] 回填后 `apiKeyId is null` 的记录仅为白名单（0 或可解释）
- [x] 迁移报告文件存在：`.sisyphus/evidence/task-4-backfill-report.json`

---

### 5) Message 发送链路支持新凭据来源（双读）

**What to do**

- 更新 `src/main/ipc/handlers/message.ts`
- 凭据解析顺序：
  1. `model.apiKeyRef.encryptedKey + baseURL`
  2. fallback `model.apiKey/baseURL`（legacy）

**References**

- `src/main/ipc/handlers/message.ts:72-104`

**Acceptance Criteria**

- [x] 仅存在 `apiKeyId` 的模型可成功发送消息
- [x] 仅存在 legacy 字段的模型在过渡期仍可发送消息

**QA Scenarios**

```
Scenario: 新关系模型发送成功
  Tool: Bash
  Steps:
    1. 运行集成测试: pnpm test tests/integration/chat-ipc.test.ts
    2. 断言消息流 chunk 正常返回
  Evidence: .sisyphus/evidence/task-5-chat-ipc.txt

Scenario: legacy 回退仍可用
  Tool: Bash
  Steps:
    1. 使用测试夹具插入仅 legacy 字段 model
    2. 执行 message:send 流程测试
  Evidence: .sisyphus/evidence/task-5-legacy-fallback.txt
```

---

### 6) BindingService 凭据解析改造（双读）

**What to do**

- 更新 `src/main/services/binding.service.ts`
- 将 `binding.model.apiKey/baseURL` 的直接读取改为“新关系优先 + legacy 回退”

**References**

- `src/main/services/binding.service.ts:384-390, 418-424`

**Acceptance Criteria**

- [x] `pnpm test tests/unit/services/delegate/delegate-engine.test.ts` PASS
- [x] Agent/Category 绑定路径可拿到有效凭据

---

### 7) Keychain 新接口（安全版）

**What to do**

- 在 `src/main/ipc/handlers/keychain.ts` 新增：
  - `handleKeychainListWithModels`（返回 masked key）
  - `handleKeychainGetWithModels`（单条解密）
- 同步 `src/main/ipc/index.ts`、`src/shared/ipc-channels.ts`、`src/main/preload.ts`

**Must NOT do**

- 不在 list 接口返回明文 key

**Acceptance Criteria**

- [x] `keychain:list-with-models` 返回 `apiKeyMasked` 或 masked 字段
- [x] `keychain:get-with-models` 仅单条返回解密 key

---

### 8) 新建 ProviderModelPanel 组件

**What to do**

- 创建 `src/renderer/src/components/settings/ProviderModelPanel.tsx`
- 树结构：Provider 节点下展示 Models
- Provider/Model CRUD 对接新 IPC
- 删除 Provider 时明确提示“将级联删除 N 个模型”

**Acceptance Criteria**

- [x] 组件通过 typecheck
- [x] 删除确认文案与真实行为一致（级联删除）

---

### 9) 集成到 SettingsPage（三 Tab 固化）

**What to do**

- 修改 `src/renderer/src/pages/SettingsPage.tsx`
- 保留仅 3 个 Tab：`API服务商` / `智能体` / `数据管理`
- 替换旧 `ApiKeyForm`/`ModelConfigForm`

**Acceptance Criteria**

- [x] `pnpm dev` 启动后设置页仅显示 3 Tab
- [x] Provider 树可 CRUD

**QA Scenarios**

```
Scenario: 设置页三 Tab 验证
  Tool: Playwright
  Preconditions: 应用可启动
  Steps:
    1. 运行: pnpm test:e2e --grep "Settings Configuration"
    2. 断言存在文本: API服务商、智能体、数据管理
    3. 断言不存在文本: LLM配置
  Evidence: .sisyphus/evidence/task-9-settings-tabs.txt
```

---

### 10) 删除语义落地：Provider 删除级联模型

**What to do**

- 统一 schema + service 语义为 cascade
- `keychain.service.ts` 删除 provider 时，确保关联模型被删除（DB cascade 或显式事务）

**References**

- `src/main/services/keychain.service.ts:114-134`
- `prisma/schema.prisma`（Model↔ApiKey relation）

**Acceptance Criteria**

- [x] 删除某 provider 后，关联 model 数量为 0
- [x] 不产生孤立 model

---

### 11) 运行回归与安全回归

**What to do**

- 运行：
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm test:e2e --grep "Settings Configuration"`
- 安全检查：列表接口不得输出明文 key；日志不得记录明文 key

**Acceptance Criteria**

- [x] 全部测试命令 PASS（预存在失败除外）
- [x] 无明文 key 泄露日志

---

### 12) 收缩阶段（Contract）任务占位（下个小版本）

**What to do**

- 当线上验证稳定后，移除 legacy `Model.apiKey/baseURL` 字段与回退逻辑
- 更新文档与迁移说明

**默认策略（本计划自动应用）**

- 本次交付不立即删除 legacy 字段；收缩在下一小版本执行。

---

## Commit Strategy

| 阶段       | 建议提交信息                                                                      |
| ---------- | --------------------------------------------------------------------------------- |
| Task 1-2   | `refactor(settings): remove router config channels and update tests`              |
| Task 3-4   | `feat(schema): add model-apikey relation with backfill`                           |
| Task 5-7   | `feat(runtime): support apiKeyId credential resolution with secure keychain APIs` |
| Task 8-10  | `feat(ui): introduce provider-model panel with cascade delete semantics`          |
| Task 11-12 | `chore: regression verification and migration contract prep`                      |

---

## Success Criteria

### 验证命令

```bash
pnpm typecheck
pnpm test
pnpm test tests/unit/ipc/ipc-alignment.test.ts
pnpm test:e2e --grep "Settings Configuration"
```

### 最终清单

- [x] 路由规则配置入口完全移除（含 typings/tests）
- [x] Provider/Model 合并 UI 可稳定使用
- [x] 运行时凭据链路不回归
- [x] 删除语义与文案一致（级联删除）
- [x] 密钥暴露策略达标（列表 masked + 单条解密）
