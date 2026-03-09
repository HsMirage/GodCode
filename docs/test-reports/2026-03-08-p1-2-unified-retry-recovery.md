# P1-2 统一重试与恢复策略 — 验收记录（2026-03-08）

## 目标

- 对齐 LLM、tool、workflow recovery 三条链路的错误分类与下一步动作口径。
- 让日志和通知里可见统一的分类、退避、人工接管建议与 fallback 建议。
- 修复 OpenAI 链路未遵守 `maxRetries` 的行为漂移。

## 实现摘要

- 新增统一重试决策层：`src/main/services/retry/retry-governance.ts`
- LLM 重试工具改为复用统一决策：`src/main/services/llm/retry-utils.ts`
- LLM 重试通知补充统一字段：`src/main/services/llm/retry-notifier.ts`
- OpenAI / Anthropic / Gemini 适配器接入统一分类、退避和 next action：
  - `src/main/services/llm/openai.adapter.ts`
  - `src/main/services/llm/anthropic.adapter.ts`
  - `src/main/services/llm/gemini.adapter.ts`
- Workflow recovery 分类改为复用统一决策：`src/main/services/workforce/workflow-recovery-controller.ts`
- Tool 执行失败结果补充 `retryDecision`，并写入执行事件：`src/main/services/tools/tool-execution.service.ts`
- 扩展权限类错误识别：`src/main/services/workforce/retry.ts`

## 验收点对照

- 相同错误在不同链路下得到一致判断：已实现，统一由 `buildUnifiedRetryDecision()` 驱动。
- 日志里能看到统一分类与下一步动作：已实现，LLM / tool 日志均输出 `classification` 与 `nextAction`。
- 人工接管条件清晰可解释：已实现，统一输出 `manualTakeoverRequired`。
- `maxRetries` 行为一致：已实现，OpenAI 现在遵守配置上限，不再无限重连。

## 验证命令

```bash
pnpm vitest tests/unit/services/retry/retry-governance.test.ts tests/unit/services/llm/openai.adapter.test.ts tests/unit/services/llm/gemini.adapter.test.ts tests/unit/services/message/message-stream.service.test.ts tests/unit/services/tools/tool-execution.service.test.ts tests/unit/services/workforce/workflow-recovery-controller.test.ts --run
pnpm typecheck
```

## 验证结果

- 单测通过：6 个文件、51 条测试全部通过。
- 类型检查通过：`pnpm typecheck` 通过。

## 风险与后续

- 当前 tool 层已统一分类与建议动作，但尚未引入自动重试执行；后续可按工具类型选择性补齐。
- 当前统一策略先聚焦 main 主链，后续可继续把更细粒度 browser 工具局部重试并入统一决策。

## 结论

- P1-2 已完成本轮实现、测试与验收闭环，可继续进入 P1-3 恢复语义上下文增强。
