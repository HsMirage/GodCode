# 03 Skills 机制

## 发现机制
- 技能入口通过 `getAllSkills` 聚合：`src/features/opencode-skill-loader/index.ts:3`、`src/features/opencode-skill-loader/skill-discovery.ts:12`。
- 扫描路径覆盖 user/project/opencode 全域：`src/features/opencode-skill-loader/skill-discovery.ts:10`、`src/features/opencode-skill-loader/skill-discovery.ts:16`、`src/features/opencode-skill-loader/skill-discovery.ts:22`、`src/features/opencode-skill-loader/skill-discovery.ts:29`。
- 全量发现优先级：opencode-project > opencode > project > user：`src/features/opencode-skill-loader/skill-discovery.ts:47`、`src/features/opencode-skill-loader/skill-discovery.ts:69`。
- 阻塞模式可通过 worker 扫描技能并设置超时：`src/features/opencode-skill-loader/blocking.ts:23`、`src/features/opencode-skill-loader/blocking.ts:36`、`src/features/opencode-skill-loader/blocking.ts:41`。

## 加载与合并
- 结构化类型包含 scope、allowedTools、mcpConfig、lazyContent：`src/features/opencode-skill-loader/types.ts:4`、`src/features/opencode-skill-loader/types.ts:26`。
- merge 主逻辑先载入 builtin，再应用 config，再覆盖文件系统 skill：`src/features/opencode-skill-loader/merger.ts:25`、`src/features/opencode-skill-loader/merger.ts:32`、`src/features/opencode-skill-loader/merger.ts:49`。
- 同名冲突按 SCOPE_PRIORITY 覆盖：`src/features/opencode-skill-loader/merger.ts:58`。
- 最后执行 enable/disable 过滤：`src/features/opencode-skill-loader/merger.ts:80`、`src/features/opencode-skill-loader/merger.ts:84`。
- 运行态缓存按 browserProvider 分桶：`src/features/opencode-skill-loader/skill-content.ts:6`、`src/features/opencode-skill-loader/skill-content.ts:13`、`src/features/opencode-skill-loader/skill-content.ts:72`。

## 执行流程
- skill 工具执行器负责从缓存/发现结果定位 skill：`src/tools/skill/tools.ts:129`、`src/tools/skill/tools.ts:167`。
- 通过 `extractSkillBody` 读取 lazy content 或 template：`src/tools/skill/tools.ts:43`、`src/tools/skill/tools.ts:54`。
- 执行结果输出“Base directory + Skill body”并可附加 MCP 能力：`src/tools/skill/tools.ts:187`、`src/tools/skill/tools.ts:195`。
- delegate-task 会把技能内容注入 system content：`src/tools/delegate-task/prompt-builder.ts:5`、`src/tools/delegate-task/prompt-builder.ts:31`。
- 同步委派发送时将 prompt 作为 parts text 下发：`src/tools/delegate-task/sync-prompt-sender.ts:21`、`src/tools/delegate-task/sync-prompt-sender.ts:32`。

## 与 slashcommand 的关系
- slashcommand 工具把技能转换为 CommandInfo 统一命令面板：`src/tools/slashcommand/skill-command-converter.ts:4`。
- `/command` 与 skill 同源并列展示：`src/tools/slashcommand/slashcommand-tool.ts:26`、`src/tools/slashcommand/slashcommand-tool.ts:29`。
- 命令精确匹配后可直接加载 skill 内容：`src/tools/slashcommand/slashcommand-tool.ts:74`、`src/tools/slashcommand/slashcommand-tool.ts:79`。
- 这形成“slashcommand 入口 → skill 内容注入 → delegate/agent 执行”的链路。

## 失败与回退
- skill 不存在时报可选列表错误：`src/tools/skill/tools.ts:170`。
- agent 限制不满足时报权限错误：`src/tools/skill/tools.ts:175`。
- mcp server 连接失败时降级为错误摘要，不中断 skill 主体输出：`src/tools/skill/tools.ts:116`。
- discover worker 超时则抛出 timeout，回退到上层调用处理：`src/features/opencode-skill-loader/blocking.ts:38`。
- delegate prompt 发送失败时统一格式化详细错误：`src/tools/delegate-task/sync-prompt-sender.ts:37`、`src/tools/delegate-task/sync-prompt-sender.ts:51`。
