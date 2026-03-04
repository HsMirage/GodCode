# 如何新增 Skill

本文说明在 CodeAll 中新增一个可用 Skill 的最小路径，覆盖定义、注册、发现、执行与验证。

## 1. Skill 基础模型

Skill 类型定义位于：`/Users/mirage/AI/AiWork/CodeAll/src/main/services/skills/types.ts`

最关键字段：

- `id`：唯一标识
- `name`：展示名
- `description`：说明文案
- `template`：运行时提示词模板
- `triggers.command`：用于 `/xxx` 触发
- `triggers.keywords`：自然语言匹配
- `allowedTools`：技能级工具白名单
- `agent` / `model` / `subtask`：可选执行偏好

## 2. 新增 Builtin Skill（推荐主路径）

### 步骤 1：新增 Skill 文件

在目录 `src/main/services/skills/builtin/` 新建一个 `*.ts` 文件并导出 `Skill` 对象。

示例（最小可用）：

```ts
import type { Skill } from '../types'

export const summarizeDiffSkill: Skill = {
  id: 'summarize-diff',
  name: 'Summarize Diff',
  description: 'Summarize current code changes with concise risk notes.',
  template: `You are a code summarizer.\n\nGiven the current changes, output:\n1) Summary\n2) Risks\n3) Suggested checks`,
  triggers: {
    command: 'summarize-diff',
    keywords: ['summarize diff', 'change summary', '变更总结']
  },
  allowedTools: ['read', 'grep', 'glob'],
  builtin: true,
  enabled: true
}
```

### 步骤 2：加入 Builtin 导出

编辑：`/Users/mirage/AI/AiWork/CodeAll/src/main/services/skills/builtin/index.ts`

增加导出：

```ts
export { summarizeDiffSkill } from './summarize-diff'
```

### 步骤 3：加入加载器

编辑：`/Users/mirage/AI/AiWork/CodeAll/src/main/services/skills/loader.ts`

- 顶部 import 新 Skill
- 将其加入 `builtinSkills` 数组

### 步骤 4：更新技能系统对外导出（可选）

编辑：`/Users/mirage/AI/AiWork/CodeAll/src/main/services/skills/index.ts`

把新 Skill 一并导出，便于统一引用。

## 3. Slash 命令发现链路

- Renderer 输入框调用 `skill:command-items`：
  `/Users/mirage/AI/AiWork/CodeAll/src/renderer/src/components/chat/MessageInput.tsx`
- 主进程处理器返回命令项：
  `/Users/mirage/AI/AiWork/CodeAll/src/main/ipc/handlers/skill.ts`
- Registry 根据 `triggers.command` 构建候选：
  `/Users/mirage/AI/AiWork/CodeAll/src/main/services/skills/registry.ts`

说明：只有 `enabled !== false` 且定义了 `triggers.command` 的 Skill，才会出现在命令面板。

## 4. 运行时执行链路

Skill 命令最终在消息主链路组装并执行：

- `assembleSkillRuntimePayload`：
  `/Users/mirage/AI/AiWork/CodeAll/src/main/ipc/handlers/message.ts`
- 组装内容包含：`renderedPrompt`、`allowedTools`、`agent`、`model`、`subtask`、`mcpConfig`
- 执行阶段通过 `withAllowedTools` 做工具作用域约束：
  `/Users/mirage/AI/AiWork/CodeAll/src/main/services/tools/tool-execution.service.ts`

## 5. User/Workspace Skill（JSON）路径

加载器支持从 JSON 文件加载 Skill：

- User 目录：`~/.codeall/skills`
- Workspace 目录：`<workspace>/.codeall/skills`

加载逻辑见：`/Users/mirage/AI/AiWork/CodeAll/src/main/services/skills/loader.ts`

最小 JSON 需要字段：`id`、`name`、`template`。

## 6. 新成员接入验收清单

1. 新 Skill 在命令面板可检索（输入 `/` + 命令前缀）。
2. 发送后消息 metadata 含 `skill.id`。
3. `allowedTools` 生效（未授权工具会被拒绝）。
4. direct/workforce 路径至少一条执行成功。
5. 对应单测或最小手测记录已补齐。
