# 02 Prompt 资产清单与调用图

## Prompt 资产总览
- 本项目 Prompt 资产按六类归档：agent / system / hook / skill / category / tool。
- 主要来源分布在 `src/agents/*`、`src/tools/delegate-task/*`、`src/hooks/*prompt*`、`src/features/opencode-skill-loader/*`。
- Prompt 资产生命周期：定义（define）→ 组合（compose）→ 注入（inject）→ 路由（route）→ 分发（dispatch）→ 消费（consume）。

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
- `src/agents/atlas/prompt-section-builder.ts:16`
- `src/agents/atlas/prompt-section-builder.ts:55`
- `src/agents/prometheus/system-prompt.ts:12`

### system
- `src/agents/prometheus/system-prompt.ts:9`
- `src/agents/prometheus/system-prompt.ts:24`
- `src/tools/delegate-task/prompt-builder.ts:8`

### hook
- `src/hooks/ralph-loop/continuation-prompt-injector.ts:14`
- `src/hooks/ralph-loop/continuation-prompt-injector.ts:54`
- `src/hooks/ralph-loop/continuation-prompt-builder.ts:1`
- `src/hooks/claude-code-hooks/user-prompt-submit.ts:1`

### skill
- `src/features/opencode-skill-loader/index.ts:12`
- `src/features/opencode-skill-loader/loader.ts:39`
- `src/features/opencode-skill-loader/skill-discovery.ts:39`
- `src/features/opencode-skill-loader/merger.ts:14`

### category
- `src/agents/atlas/prompt-section-builder.ts:35`
- `src/agents/atlas/prompt-section-builder.ts:121`
- `src/tools/delegate-task/category-resolver.ts:1`

### tool
- `src/tools/delegate-task/prompt-builder.ts:8`
- `src/tools/delegate-task/sync-prompt-sender.ts:7`
- `src/tools/delegate-task/executor.ts:1`
- `src/tools/slashcommand/skill-command-converter.ts:1`
