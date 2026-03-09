# WP-06 Hook 治理产品化说明

## 1. 目标

本轮聚焦把 Hook 从“可运行框架”升级为“可治理产品能力”，补齐配置 schema、运行态可见性、持久化恢复与设置页治理闭环。

目标包括：

- 统一 Hook 治理共享契约
- 收敛 Hook 配置读写入口
- 将开关 / 优先级 / 超时 / 熔断阈值 / 冷却窗口纳入治理模型
- 在设置页展示来源、作用范围、运行态与审计摘要
- 让恢复后的治理快照可作用于后注册 Hook

## 2. 治理模型设计

新增共享契约：`src/shared/hook-governance-contract.ts`

### 2.1 核心字段

- `source`
  - `builtin`
  - `claude-code`
  - `custom`
- `scope`
  - `global`
  - `workspace`
  - `session`
  - `tool`
- `strategy`
  - `timeoutMs`
  - `failureThreshold`
  - `cooldownMs`
- `runtime`
  - `circuitState`
  - `circuitOpenUntil`
  - `lastStatus`
  - `lastDurationMs`
  - `lastError`
  - `lastExecutedAt`
- `audit`
  - `executionCount`
  - `errorCount`
  - `lastAuditAt`
  - `lastStatus`

### 2.2 持久化 schema

Hook 治理快照现在采用版本化结构：

- `version`
- `hooks[].id`
- `hooks[].enabled`
- `hooks[].priority`
- `hooks[].strategy.timeoutMs`
- `hooks[].strategy.failureThreshold`
- `hooks[].strategy.cooldownMs`

Main 进程使用统一 schema 解析 IPC 输入与 DB 中的治理快照，避免前后端与持久化各写一套归一化逻辑。

## 3. 代码落点

### 3.1 主进程治理入口
- `src/main/services/hooks/governance.ts`
  - 收敛 `get / update / restore / normalize / applyCached` 五类治理能力
  - 对 IPC 输入采用“过滤无效项、保留有效项”的兼容归一化策略
  - 持久化快照扩展为带 `strategy` 的版本化结构

### 3.2 Hook manager 运行态
- `src/main/services/hooks/manager.ts`
  - 将超时 / 熔断阈值 / 冷却窗口从硬编码升级为按 Hook 配置
  - 增加 `getHookRuntimeSnapshot()` 暴露运行态
  - 审计快照新增 `source / scope / timeoutMs / failureThreshold / cooldownMs`

### 3.3 Hook 注册元数据
- `src/main/services/hooks/*.ts`
  - 为内置 Hook 标注 `source='builtin'`
  - 按职责补齐 `scope=workspace/session/tool`
- `src/main/services/hooks/claude-code/adapter.ts`
  - 为 Claude Code 适配 Hook 标注 `source='claude-code'` 与 `scope='workspace'`

### 3.4 IPC 与事件桥
- `src/main/ipc/handlers/workflow-observability.ts`
  - 改为复用治理服务的统一归一化函数
- `src/main/services/event-bridge.service.ts`
  - 兼容 Hook 审计时间戳的 `Date|string` 序列化

### 3.5 Renderer 设置页
- `src/renderer/src/pages/SettingsPage.tsx`
  - Hook 明细支持编辑 `enabled / priority / timeoutMs / failureThreshold / cooldownMs`
  - 展示 `source / scope / runtime / audit`
  - 增加“默认 Hook 与治理策略说明”
  - 审计链路展示策略快照与状态中文标签
- `src/renderer/src/types/shims.d.ts`
  - 改为复用共享 Hook 治理契约

## 4. 生命周期治理说明

当前 Hook 生命周期治理闭环如下：

1. Hook 注册时写入 `source / scope / strategy`
2. 设置页通过 `hook-governance:get` 拉取配置、运行态与最近审计
3. 设置页通过 `hook-governance:set` 更新开关、优先级与可靠性策略
4. Governance service 将快照持久化到 `HOOK_GOVERNANCE_CONFIG`
5. 应用启动恢复快照后，可通过 `applyCachedHookGovernanceConfig()` 套用到后注册 Hook
6. Hook 执行时记录 `strategy -> execution -> result` 审计，并将运行态回写到治理视图

## 5. 结果

- Hook 治理不再只有“开关 + 优先级”，现在具备可见的可靠性策略与运行态。
- Hook 配置恢复不再只覆盖应用启动时已注册的 Hook，后注册 Hook 也可吃到缓存快照。
- 设置页现在可以直接定位“哪个 Hook、来自哪里、作用在哪、是否熔断、何时恢复”。
- IPC、Renderer、持久化三层现在复用同一份 Hook 治理契约。
