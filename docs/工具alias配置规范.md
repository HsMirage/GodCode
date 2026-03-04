# 工具 alias 配置规范

本文定义 CodeAll 中工具别名（alias）的设计与接入规则，确保 Skill 与 Agent 在不同命名风格下稳定执行且不绕过权限。

## 1. alias 作用与边界

alias 的核心目的：把“外部/简写工具名”解析到“系统真实工具名”。

实现入口：

- 工具注册表解析：`/Users/mirage/AI/AiWork/CodeAll/src/main/services/tools/tool-registry.ts`
- 执行器解析与审计：`/Users/mirage/AI/AiWork/CodeAll/src/main/services/tools/tool-executor.ts`
- 执行服务解析与审计：`/Users/mirage/AI/AiWork/CodeAll/src/main/services/tools/tool-execution.service.ts`
- 权限策略归一化：`/Users/mirage/AI/AiWork/CodeAll/src/main/services/tools/permission-policy.ts`
- Agent/Category 工具作用域别名映射：`/Users/mirage/AI/AiWork/CodeAll/src/main/services/delegate/tool-allowlist.ts`

## 2. 现有默认 alias

默认映射定义于 `tool-registry.ts` 中 `DEFAULT_TOOL_ALIASES`，例如：

- `read -> file_read`
- `write -> file_write`
- `list/ls -> file_list`
- `fetch -> webfetch`
- `search -> websearch`

## 3. 配置原则

### 3.1 一对一优先

优先保持单一语义映射，避免一个 alias 指向多个语义冲突工具。

### 3.2 解析先于权限

执行链路中先 `resolveName`，后做 `isAllowed` 检查，保证 alias 不绕过权限策略。

### 3.3 失败可诊断

工具不存在时必须返回建议名（`suggestName`），降低排障成本。

### 3.4 命中要可审计

当 `requestedName !== resolvedName` 时记录 `Tool alias resolved` 日志。

## 4. 新增 alias 的推荐流程

1. 在 `tool-registry.ts` 的 alias 映射中新增条目。
2. 在 `delegate/tool-allowlist.ts` 同步检查 profile 映射是否需要补充。
3. 验证 `permission-policy.ts` 下解析后的真实工具权限是否符合预期。
4. 补充至少 2 类测试：
   - 正向：alias 可执行
   - 反向：未授权时仍被拒绝

## 5. 冲突与兼容策略

- 禁止将高风险工具伪装为低风险别名（例如将 `bash` 伪装成读工具名）。
- 遇到历史兼容需求时，优先新增 alias，不直接替换已有真实工具名。
- 若 alias 与真实工具同名冲突，应优先真实工具，并移除歧义 alias。

## 6. 验收标准

1. alias 能在 registry、executor、permission 三层一致解析。
2. alias 命中与拒绝都可在日志中定位。
3. 高风险工具 alias 仍触发同等级权限行为。
4. 未映射工具报错包含明确建议（Did you mean ...）。
