# 02 Prompt 资产清单与调用图

## Prompt 资产总览
- Prompt 资产分为：agent / system / hook / skill / category / tool 六类。
- 主干链路覆盖 `src/agents/*` → `src/tools/*` → `src/hooks/*` → `src/plugin/*` → session/model adapter。
- 生命周期边类型统一使用：define / compose / inject / route / dispatch / consume。

## 模板分类统计
| 分类 | 数量 | 代表样例 | 说明 |
|---|---:|---|---|
| agent | 5 | `src/agents/dynamic-agent-prompt-builder.ts:175` | Agent 级提示段定义与拼装 |
| system | 3 | `src/agents/prometheus/system-prompt.ts:12` | 系统提示拼接与权限策略 |
| hook | 4 | `src/hooks/ralph-loop/continuation-prompt-injector.ts:14` | Hook 中的续跑/注入提示 |
| skill | 4 | `src/features/opencode-skill-loader/index.ts:12` | 技能发现、合并、缓存、分发 |
| category | 3 | `src/agents/atlas/prompt-section-builder.ts:35` | 按类别映射最佳提示与模型 |
| tool | 4 | `src/tools/delegate-task/prompt-builder.ts:8` | 工具层拼接与发送 prompt |

## 来源路径清单
### agent
- `src/agents/dynamic-agent-prompt-builder.ts:67`
- `src/agents/dynamic-agent-prompt-builder.ts:175`
- `src/agents/dynamic-agent-prompt-builder.ts:198`
- `src/agents/atlas/prompt-section-builder.ts:16`
- `src/agents/atlas/prompt-section-builder.ts:35`
- `src/agents/atlas/prompt-section-builder.ts:55`
- `src/agents/prometheus/system-prompt.ts:12`

### system
- `src/agents/prometheus/system-prompt.ts:9`
- `src/agents/prometheus/system-prompt.ts:24`
- `src/tools/delegate-task/prompt-builder.ts:5`
- `src/tools/delegate-task/prompt-builder.ts:8`
- `src/tools/delegate-task/prompt-builder.ts:25`

### hook
- `src/hooks/ralph-loop/continuation-prompt-builder.ts:1`
- `src/hooks/ralph-loop/continuation-prompt-injector.ts:14`
- `src/hooks/ralph-loop/continuation-prompt-injector.ts:54`
- `src/hooks/claude-code-hooks/user-prompt-submit.ts:1`

### skill
- `src/features/opencode-skill-loader/index.ts:12`
- `src/features/opencode-skill-loader/index.ts:22`
- `src/features/opencode-skill-loader/loader.ts:39`
- `src/features/opencode-skill-loader/skill-discovery.ts:39`
- `src/features/opencode-skill-loader/merger.ts:14`
- `src/features/opencode-skill-loader/merger.ts:56`

### category
- `src/agents/atlas/prompt-section-builder.ts:35`
- `src/agents/atlas/prompt-section-builder.ts:121`
- `src/tools/delegate-task/category-resolver.ts:1`
- `src/tools/delegate-task/model-selection.ts:1`

### tool
- `src/tools/delegate-task/prompt-builder.ts:8`
- `src/tools/delegate-task/sync-prompt-sender.ts:7`
- `src/tools/delegate-task/executor.ts:1`
- `src/tools/slashcommand/skill-command-converter.ts:1`

## 边类型定义表
| 边类型 | 含义 | 典型锚点 |
|---|---|---|
| define | 声明模板与规则 | `src/agents/prometheus/system-prompt.ts:12` |
| compose | 组合多个提示片段 | `src/agents/dynamic-agent-prompt-builder.ts:220` |
| inject | 将技能/上下文注入 system/user prompt | `src/tools/delegate-task/prompt-builder.ts:31` |
| route | 决定 category/agent/model 路径 | `src/tools/delegate-task/category-resolver.ts:1` |
| dispatch | 触发会话 prompt 调用 | `src/tools/delegate-task/sync-prompt-sender.ts:21` |
| consume | 消费模型/子会话结果并格式化 | `src/tools/delegate-task/sync-result-fetcher.ts:1` |

## 主调用关系图（agents/tools/hooks/plugin）
- 图文件：`diagrams/prompt-asset-map.mmd`
- 主链路：
  1. agents 负责 define/compose：`src/agents/dynamic-agent-prompt-builder.ts:67`。
  2. tools 负责 inject/dispatch：`src/tools/delegate-task/prompt-builder.ts:8`、`src/tools/delegate-task/sync-prompt-sender.ts:21`。
  3. hooks 负责注入与恢复：`src/hooks/ralph-loop/continuation-prompt-injector.ts:14`。
  4. plugin 负责 hook 编排和 tool 前后处理：`src/plugin/tool-execute-before.ts:1`、`src/plugin/tool-execute-after.ts:1`。

## 生命周期时序图
- 图文件：`diagrams/prompt-lifecycle-sequence.mmd`
- 生命周期证据：
  - define：`src/agents/prometheus/system-prompt.ts:12`
  - compose：`src/agents/atlas/prompt-section-builder.ts:55`
  - inject：`src/tools/delegate-task/prompt-builder.ts:31`
  - route：`src/tools/delegate-task/model-selection.ts:1`
  - dispatch：`src/tools/delegate-task/sync-prompt-sender.ts:21`
  - consume：`src/tools/delegate-task/sync-result-fetcher.ts:1`

## 模型路由决策树
- 图文件：`diagrams/model-routing-decision-tree.mmd`
- 决策节点证据：
  - category 优先：`src/tools/delegate-task/category-resolver.ts:1`
  - model 解析与回退：`src/tools/delegate-task/model-selection.ts:1`
  - provider/model 可用性：`src/shared/model-resolver.ts:1`
  - 最终 dispatch：`src/tools/delegate-task/sync-prompt-sender.ts:33`
