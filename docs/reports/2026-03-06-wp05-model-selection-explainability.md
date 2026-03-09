# WP-05 模型选择解释性增强说明

## 1. 目标

本轮聚焦模型选择主链的可解释性，解决“任务最终为什么用了这个模型、为何没有命中更高优先级绑定、是否发生过回退”不可见的问题。

目标包括：

- 为 `ModelSelectionService` 返回结构补齐解释字段
- 在 `delegate` 与 `workforce` 链路透传解释信息
- 在 `Task.metadata`、run log、workflow observability 中保留解释摘要
- 在 `TaskPanel` 与 `WorkflowView` 节点详情展示模型来源与回退原因
- 为 override / agent-binding / category-binding / system-default 四条命中路径补测试

## 2. 解释字段设计

新增共享契约：`src/shared/model-selection-contract.ts`

### 2.1 核心字段

- `modelSelectionSource`
  - `override`
  - `agent-binding`
  - `category-binding`
  - `system-default`
- `modelSelectionReason`
  - `explicit-override`
  - `agent-binding-hit`
  - `category-binding-hit`
  - `system-default-hit`
- `fallbackReason`
  - `override-not-requested`
  - `binding-not-requested`
  - `binding-not-configured`
  - `binding-disabled`
  - `binding-model-unset`
  - `system-default-not-configured`
- `fallbackAttemptSummary`
  - 记录本次命中前的跳过 / 回退步骤摘要

### 2.2 最小展示字段集

在 task / run / UI 层统一保留以下最小字段：

- `modelSelectionSource`
- `modelSelectionReason`
- `modelSelectionSummary`
- `fallbackReason`
- `fallbackAttemptSummary`
- 兼容保留旧字段 `modelSource`

## 3. 代码落点

### 3.1 模型选择服务
- `src/main/services/llm/model-selection.service.ts`
  - 为 override / agent-binding / category-binding / system-default 四条路径生成解释摘要
  - 将“跳过 / 回退”步骤写入 `fallbackAttemptSummary`
  - 保留兼容字段 `source`，同时新增 `modelSelectionSource`

### 3.2 Delegate 链路
- `src/main/services/delegate/delegate-engine.ts`
  - `DelegateTaskResult` 透传解释字段
  - 在 task 创建 metadata 中写入 `modelSelection`
  - 在 run log 中新增 `Model selection resolved` 记录

### 3.3 Workforce 链路
- `src/main/services/workforce/workforce-engine.ts`
  - 在 subtask metadata 中写入顶层 `modelSelection`
  - 在 `runtimeBindingSnapshot` 中写入 `modelSelection`
  - 在 execution / timeline / shared context 中透传解释字段
- `src/main/services/workforce/workflow-observability-writer.ts`
  - assignment 记录新增 `modelSelectionReason / modelSelectionSummary / fallbackReason / fallbackAttemptSummary`

### 3.4 Renderer 展示
- `src/renderer/src/components/panels/TaskPanel.tsx`
  - 任务卡片展示来源、命中原因、选择摘要、回退原因
  - 详情面板展示完整模型选择解释
  - workflow observability 与 task metadata 双路径兼容读取
- `src/renderer/src/components/workflow/TaskNode.tsx`
  - 节点卡片展示 `Source / Reason / Summary`
- `src/renderer/src/components/workflow/WorkflowView.tsx`
  - 将 observability assignment 的解释字段并入节点 metadata

## 4. 命中与回退说明表

| 最终命中 | 命中原因 | 常见回退原因 | UI 可见位置 |
| --- | --- | --- | --- |
| `override` | `explicit-override` | 无 | TaskPanel / TaskNode |
| `agent-binding` | `agent-binding-hit` | `override-not-requested` | TaskPanel / TaskNode |
| `category-binding` | `category-binding-hit` | `binding-not-requested` / `binding-disabled` / `binding-not-configured` | TaskPanel / TaskNode |
| `system-default` | `system-default-hit` | `binding-disabled` / `binding-model-unset` / `binding-not-configured` | TaskPanel / TaskNode |

## 5. 结果

- 模型选择来源从“只有内部 `source`”扩展为“可解释链路”。
- delegate / workforce / renderer 三层现在都能看到最终命中与回退原因。
- Workflow 子任务 assignment 现在能直接展示模型来源，而不必靠人工对照绑定配置推断。
- 非 workflow 的独立 delegate task 也能从 task metadata 看到解释摘要。
