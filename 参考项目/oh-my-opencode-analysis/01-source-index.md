# 01 源码索引

## 扫描顺序
1. src/agents
2. src/tools（delegate-task/skill/slashcommand/background-task 优先）
3. src/hooks
4. src/plugin* + src/shared + src/cli
5. docs 与关键 tests 证据补充

## 索引条目模板
- 路径：`...`
- 职责：...
- 关键导出：...
- 公共变量/状态：...
- Prompt 触点：define/compose/inject/route/dispatch/consume
- 上下游：...
- 协同标签：planner/orchestrator/worker/skill/hook/transport

## 模块索引
### src/agents
- 路径：`src/agents/agent-builder.ts`
  - 职责：构建并注册 Agent 定义。
  - 关键导出：`buildAgent`
  - 公共变量/状态：Agent definition registry
  - Prompt 触点：compose
  - 上下游：上游 `src/agents/index.ts`；下游 `src/agents/builtin-agents.ts`
  - 协同标签：planner
- 路径：`src/agents/dynamic-agent-prompt-builder.ts`
  - 职责：动态拼装 Agent prompt 片段。
  - 关键导出：`buildDynamicAgentPrompt`
  - 公共变量/状态：Prompt section cache
  - Prompt 触点：define/compose/inject
  - 上下游：上游 `src/agents/agent-builder.ts`；下游 `src/agents/atlas/prompt-section-builder.ts`
  - 协同标签：orchestrator
- 路径：`src/agents/builtin-agents.ts`
  - 职责：汇总内置 Agent 集合。
  - 关键导出：`builtinAgents`
  - 公共变量/状态：Builtin agent list
  - Prompt 触点：define/route
  - 上下游：上游 `src/agents/index.ts`；下游 `src/agents/builtin-agents/general-agents.ts`
  - 协同标签：planner
- 路径：`src/agents/builtin-agents/agent-overrides.ts`
  - 职责：应用 agent override 配置。
  - 关键导出：`applyAgentOverrides`
  - 公共变量/状态：Override map
  - Prompt 触点：inject
  - 上下游：上游 `src/config/schema/agent-overrides.ts`；下游 `src/agents/builtin-agents/atlas-agent.ts`
  - 协同标签：support
- 路径：`src/agents/builtin-agents/atlas-agent.ts`
  - 职责：定义 atlas agent 入口与默认 prompt。
  - 关键导出：`atlasAgent`
  - 公共变量/状态：Atlas defaults
  - Prompt 触点：define/compose
  - 上下游：上游 `src/agents/atlas/default.ts`；下游 `src/agents/builtin-agents.ts`
  - 协同标签：worker
- 路径：`src/agents/builtin-agents/general-agents.ts`
  - 职责：定义通用 agent prompt 与能力配置。
  - 关键导出：`generalAgents`
  - 公共变量/状态：General agent specs
  - Prompt 触点：define
  - 上下游：上游 `src/agents/builtin-agents.ts`；下游 `src/cli/run/agent-resolver.ts`
  - 协同标签：worker
- 路径：`src/agents/builtin-agents/hephaestus-agent.ts`
  - 职责：定义 hephaestus 专用 agent。
  - 关键导出：`hephaestusAgent`
  - 公共变量/状态：Hephaestus config
  - Prompt 触点：define
  - 上下游：上游 `src/agents/hephaestus.ts`；下游 `src/agents/builtin-agents.ts`
  - 协同标签：worker
- 路径：`src/agents/builtin-agents/sisyphus-agent.ts`
  - 职责：定义 sisyphus 专用 agent。
  - 关键导出：`sisyphusAgent`
  - 公共变量/状态：Sisyphus config
  - Prompt 触点：define
  - 上下游：上游 `src/agents/sisyphus.ts`；下游 `src/agents/builtin-agents.ts`
  - 协同标签：worker
- 路径：`src/agents/atlas/agent.ts`
  - 职责：atlas agent 主逻辑。
  - 关键导出：`createAtlasAgent`
  - 公共变量/状态：Atlas runtime context
  - Prompt 触点：compose/dispatch
  - 上下游：上游 `src/agents/atlas/default.ts`；下游 `src/agents/atlas/gpt.ts`
  - 协同标签：orchestrator
- 路径：`src/agents/atlas/default.ts`
  - 职责：atlas 默认 prompt 配置。
  - 关键导出：`atlasDefaultPrompt`
  - 公共变量/状态：Default prompt blocks
  - Prompt 触点：define
  - 上下游：上游 `src/agents/atlas/agent.ts`；下游 `src/agents/dynamic-agent-prompt-builder.ts`
  - 协同标签：support
- 路径：`src/agents/atlas/gpt.ts`
  - 职责：atlas GPT 兼容 prompt 组装。
  - 关键导出：`buildAtlasGptPrompt`
  - 公共变量/状态：GPT prompt sections
  - Prompt 触点：compose/route
  - 上下游：上游 `src/agents/atlas/agent.ts`；下游 `src/cli/run/server-connection.ts`
  - 协同标签：transport
- 路径：`src/agents/atlas/prompt-section-builder.ts`
  - 职责：按段落构建 atlas prompt。
  - 关键导出：`buildPromptSections`
  - 公共变量/状态：Section assembly config
  - Prompt 触点：compose/inject
  - 上下游：上游 `src/agents/dynamic-agent-prompt-builder.ts`；下游 `src/agents/atlas/default.ts`
  - 协同标签：support
- 路径：`src/agents/prometheus/behavioral-summary.ts`
  - 职责：生成 prometheus 行为摘要段。
  - 关键导出：`buildBehavioralSummary`
  - 公共变量/状态：Behavior summary template
  - Prompt 触点：define/compose
  - 上下游：上游 `src/agents/prometheus/system-prompt.ts`；下游 `src/agents/prometheus/plan-template.ts`
  - 协同标签：planner
- 路径：`src/agents/prometheus/identity-constraints.ts`
  - 职责：定义身份与约束规则。
  - 关键导出：`identityConstraints`
  - 公共变量/状态：Constraint rules
  - Prompt 触点：define/inject
  - 上下游：上游 `src/agents/prometheus/system-prompt.ts`；下游 `src/agents/prometheus/interview-mode.ts`
  - 协同标签：support
- 路径：`src/agents/prometheus/interview-mode.ts`
  - 职责：构建访谈模式 prompt 流程。
  - 关键导出：`buildInterviewMode`
  - 公共变量/状态：Interview mode config
  - Prompt 触点：compose/route
  - 上下游：上游 `src/agents/prometheus/plan-generation.ts`；下游 `src/agents/prometheus/system-prompt.ts`
  - 协同标签：planner
- 路径：`src/agents/prometheus/plan-generation.ts`
  - 职责：生成执行计划 prompt。
  - 关键导出：`buildPlanGenerationPrompt`
  - 公共变量/状态：Plan generation settings
  - Prompt 触点：compose/dispatch
  - 上下游：上游 `src/agents/prometheus/plan-template.ts`；下游 `src/agents/prometheus/system-prompt.ts`
  - 协同标签：planner
- 路径：`src/agents/prometheus/plan-template.ts`
  - 职责：维护计划模板片段。
  - 关键导出：`planTemplate`
  - 公共变量/状态：Template text blocks
  - Prompt 触点：define
  - 上下游：上游 `src/agents/prometheus/plan-generation.ts`；下游 `src/agents/prometheus/system-prompt.ts`
  - 协同标签：support
- 路径：`src/agents/prometheus/system-prompt.ts`
  - 职责：拼接 prometheus system prompt。
  - 关键导出：`buildPrometheusSystemPrompt`
  - 公共变量/状态：System prompt parts
  - Prompt 触点：compose/inject
  - 上下游：上游 `src/agents/prometheus/index.ts`；下游 `src/agents/prometheus/behavioral-summary.ts`
  - 协同标签：orchestrator
- 路径：`src/agents/sisyphus-junior/agent.ts`
  - 职责：sisyphus-junior agent 逻辑。
  - 关键导出：`createSisyphusJuniorAgent`
  - 公共变量/状态：Junior agent runtime
  - Prompt 触点：compose/dispatch
  - 上下游：上游 `src/agents/sisyphus-junior/default.ts`；下游 `src/agents/sisyphus-junior/gpt.ts`
  - 协同标签：worker
- 路径：`src/agents/sisyphus-junior/default.ts`
  - 职责：sisyphus-junior 默认 prompt。
  - 关键导出：`sisyphusJuniorDefaultPrompt`
  - 公共变量/状态：Default prompt content
  - Prompt 触点：define
  - 上下游：上游 `src/agents/sisyphus-junior/agent.ts`；下游 `src/agents/dynamic-agent-prompt-builder.ts`
  - 协同标签：support
- 路径：`src/agents/sisyphus-junior/gpt.ts`
  - 职责：sisyphus-junior GPT prompt 适配。
  - 关键导出：`buildSisyphusJuniorGptPrompt`
  - 公共变量/状态：GPT adaptation config
  - Prompt 触点：compose/route
  - 上下游：上游 `src/agents/sisyphus-junior/agent.ts`；下游 `src/cli/run/runner.ts`
  - 协同标签：transport

### src/tools
### src/hooks
### src/plugin*
### src/shared
### src/cli
