# Hook 开发与调试指南

本文面向 CodeAll 开发者，说明如何基于现有 Hook 生命周期框架新增 Hook、调试 Hook、治理 Hook，并保证主链路稳定性。

## 1. Hook 框架与目标

Hook 体系用于在主执行链路上提供可治理扩展点，覆盖：

- 工具调用前后（onToolStart / onToolEnd）
- 消息创建（onMessageCreate）
- 上下文窗口溢出（onContextOverflow）
- 编辑类错误恢复（onEditError）
- 任务与工作流事件（onTaskLifecycle）

核心定义：
`/Users/mirage/AI/AiWork/CodeAll/src/main/services/hooks/types.ts`

核心调度与可靠性实现：
`/Users/mirage/AI/AiWork/CodeAll/src/main/services/hooks/manager.ts`

## 2. 生命周期事件与回调签名

事件类型定义（节选）：

```ts
export type HookEventType =
  | 'onToolStart'
  | 'onToolEnd'
  | 'onMessageCreate'
  | 'onContextOverflow'
  | 'onEditError'
  | 'onTaskLifecycle'
```

不同事件的回调返回值支持“温和改写”而非强耦合侵入：

- `onToolStart` 可 `modified` 输入或 `skip`
- `onToolEnd` 可 `modifiedOutput`
- `onMessageCreate` 可 `modifiedContent` 与 `inject`
- `onContextOverflow` 可返回 `action: compact|warn|ignore`

参考：
`/Users/mirage/AI/AiWork/CodeAll/src/main/services/hooks/types.ts`
`/Users/mirage/AI/AiWork/CodeAll/src/main/services/hooks/manager.ts`

## 3. 新增一个 Hook（最小路径）

### 步骤 1：实现 Hook 工厂

建议放在：
`/Users/mirage/AI/AiWork/CodeAll/src/main/services/hooks/`

最小示例（onToolEnd）：

```ts
import type { HookConfig, HookContext, ToolExecutionInput, ToolExecutionOutput } from './types'

export function createSampleHook(): HookConfig<'onToolEnd'> {
  return {
    id: 'sample-hook',
    name: 'Sample Hook',
    event: 'onToolEnd',
    priority: 50,
    enabled: true,
    description: 'Sample hook for output post-processing',
    callback: async (
      _context: HookContext,
      _input: ToolExecutionInput,
      output: ToolExecutionOutput
    ) => {
      if (!output.success) return {}
      return {
        modifiedOutput: {
          output: output.output
        }
      }
    }
  }
}
```

### 步骤 2：在 hooks/index 注册

默认 Hook 注册入口：
`/Users/mirage/AI/AiWork/CodeAll/src/main/services/hooks/index.ts`

```ts
export function initializeDefaultHooks(): void {
  hookManager.register(createRulesInjectorHook())
  // ...
  hookManager.register(createSampleHook())
}
```

### 步骤 3：通过消息/工具链路触发验证

工具事件由工具执行服务触发：
`/Users/mirage/AI/AiWork/CodeAll/src/main/services/tools/tool-execution.service.ts`

消息事件由消息处理主链路触发：
`/Users/mirage/AI/AiWork/CodeAll/src/main/ipc/handlers/message.ts`

## 4. 内置 Hook 参考实现

建议优先复用内置模式：

- 规则注入：`rules-injector.hook.ts`
- 上下文监控：`context-window-monitor.ts`
- 编辑错误恢复：`edit-error-recovery.ts`
- 工具输出截断：`tool-output-truncator.ts`
- todo 连续性提醒：`todo-continuation.hook.ts`

参考文件：
`/Users/mirage/AI/AiWork/CodeAll/src/main/services/hooks/rules-injector.hook.ts`
`/Users/mirage/AI/AiWork/CodeAll/src/main/services/hooks/context-window-monitor.ts`
`/Users/mirage/AI/AiWork/CodeAll/src/main/services/hooks/edit-error-recovery.ts`
`/Users/mirage/AI/AiWork/CodeAll/src/main/services/hooks/tool-output-truncator.ts`

## 5. 调试与观测

### 5.1 Hook 状态查询

IPC：`hook-governance:get` / `hook-governance:set`

处理器：
`/Users/mirage/AI/AiWork/CodeAll/src/main/ipc/handlers/workflow-observability.ts`

服务接口：
`/Users/mirage/AI/AiWork/CodeAll/src/main/services/hooks/index.ts`

可得到：

- hooks 列表（enabled/priority/executionCount/errorCount）
- recentExecutions（最近执行审计）

### 5.2 审计与持久化

HookManager 内部保留最近审计（上限 200 条），并持久化到审计日志：

- `maxExecutionAudits = 200`
- `AuditLogService.log({ action: 'hook:execution', ... })`

参考：
`/Users/mirage/AI/AiWork/CodeAll/src/main/services/hooks/manager.ts`

### 5.3 治理快照持久化

治理快照存储于系统设置键：
`SETTING_KEYS.HOOK_GOVERNANCE_CONFIG`

参考：
`/Users/mirage/AI/AiWork/CodeAll/src/main/services/settings/schema-registry.ts`
`/Users/mirage/AI/AiWork/CodeAll/src/main/services/hooks/index.ts`

## 6. 可靠性与降级机制

框架内置保护（默认）：

- 单 Hook 超时：`2000ms`
- 熔断阈值：连续失败 `3` 次
- 熔断冷却：`30000ms`
- 状态：`success | error | timeout | circuit_open`

含义：

1. Hook 失败不会直接打断主流程。
2. 高频失败 Hook 会被临时跳过（degraded）。
3. 主流程可继续，避免系统级雪崩。

参考：
`/Users/mirage/AI/AiWork/CodeAll/src/main/services/hooks/manager.ts`

## 7. 与 Claude Code Hook 兼容

CodeAll 提供兼容层，可加载 `.claude/settings.json` hooks 并映射到本地事件模型。

入口：
`/Users/mirage/AI/AiWork/CodeAll/src/main/services/hooks/claude-code/index.ts`

关键映射：

- `PreToolUse -> onToolStart`
- `PostToolUse -> onToolEnd`
- `PostToolUseFailure -> onToolEnd`

关键约定：

- 命令 handler `exitCode === 2` 视为阻断（continue=false）
- 其他非零退出码默认降级忽略（不阻断）

参考：
`/Users/mirage/AI/AiWork/CodeAll/src/main/services/hooks/claude-code/adapter.ts`
`/Users/mirage/AI/AiWork/CodeAll/src/main/services/hooks/claude-code/config-loader.ts`

## 8. 常见问题与排查清单

1. Hook 不生效
   - 检查 `enabled` 是否为 true
   - 检查 `event` 是否与触发链路匹配
   - 检查优先级是否被其他 Hook 覆盖

2. Hook 频繁超时
   - 检查 callback 中是否有阻塞 IO
   - 尽量减少外部依赖或把重任务移出 Hook

3. 输出被异常改写
   - 查 recentExecutions，定位对应 `hookId`
   - 临时通过治理接口关闭可疑 Hook

4. 重启后治理配置丢失
   - 检查 `HOOK_GOVERNANCE_CONFIG` 是否写入成功
   - 检查系统设置表与 DB 初始化状态

## 9. 验收标准（Hook 文档）

- 新成员可按文档新增一个 onToolEnd 或 onMessageCreate Hook 并生效
- 能通过治理接口调整 Hook 启停和优先级
- 能在 recentExecutions 与审计日志中定位失败 Hook
- Hook 异常时主链路仍可继续执行
