# oh-my-opencode 源码分析

本目录是对 `参考项目/oh-my-opencode` 的结构化技术分析，聚焦 Prompt 资产、Skills 机制、Agent 编排与信息流。

## 结论摘要
- Prompt 链路呈现稳定的六阶段闭环：define → compose → inject → route → dispatch → consume。
- Skills 机制采用“多源发现 + scope 优先级合并 + 缓存 + 运行时注入”的策略，兼顾扩展性与可控性。
- Agent 团队编排由 BackgroundManager/TmuxSessionManager/call-omo-agent 构成多层协同，支持同步与异步双通道。
- 信息流由 Prompt 流、控制流、状态流三条主线构成，且具备通知串行化、stale 清理、session 恢复等韧性机制。

## 导航
- [01 源码索引](./01-source-index.md)
- [02 Prompt 资产清单与调用图](./02-prompt-inventory-and-callgraph.md)
- [03 Skills 机制](./03-skills-mechanism.md)
- [04 Agent 团队编排](./04-agent-team-orchestration.md)
- [05 信息流总览](./05-information-flow.md)

## 图示清单
- [prompt-asset-map](./diagrams/prompt-asset-map.mmd)
- [prompt-lifecycle-sequence](./diagrams/prompt-lifecycle-sequence.mmd)
- [model-routing-decision-tree](./diagrams/model-routing-decision-tree.mmd)
- [skill-execution-pipeline](./diagrams/skill-execution-pipeline.mmd)
- [agent-orchestration-sequence](./diagrams/agent-orchestration-sequence.mmd)
- [resilience-loop](./diagrams/resilience-loop.mmd)

## 关键证据锚点（示例）
- `src/agents/dynamic-agent-prompt-builder.ts:175`
- `src/tools/delegate-task/prompt-builder.ts:8`
- `src/tools/delegate-task/sync-prompt-sender.ts:21`
- `src/features/opencode-skill-loader/merger.ts:14`
- `src/features/background-agent/manager.ts:116`
- `src/features/background-agent/manager.ts:1396`
- `src/features/tmux-subagent/manager.ts:41`

## 复核指引（file:line 规则）
1. 所有证据按 `file_path:line_number` 书写，且路径必须以 `src/` 开头。
2. 复核时先验证文件存在，再验证行号 `1 <= line <= file_total_lines`。
3. 每篇分析文档需提供充足锚点（至少 10 个 `src/` 锚点），并覆盖主结论段落。
4. 抽样复核建议：每章随机抽取 3-5 个锚点，核对“描述-代码”是否一致。

## 评审建议
1. 先读 `01-source-index.md` 获取模块地图，再读 `02`/`03` 理解 Prompt 与 Skills。
2. 通过 `04` 把握同步/异步编排与韧性回路。
3. 最后读 `05` 做全局信息流对齐，并结合图示进行 code walk。
