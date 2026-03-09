# 从外部优秀实践迁移到 GodCode 的适配流程

本文给出将外部优秀实践（如 opencode / omo 的命令、Hook、权限、编排思路）迁移到 GodCode 的标准流程。

目标是“可迁移、可治理、可回滚”，而不是 1:1 复刻。

## 1. 迁移原则

1. 最小可行接入：先打通主链路，再做体验增强。
2. 统一安全边界：alias、权限、Hook 不能绕过治理。
3. 先适配后扩展：先落在 GodCode 既有抽象，再新增能力。
4. 全程可审计：关键决策可回放、可定位。

基线任务来源：
`/Users/mirage/AI/AiWork/GodCode/docs/opencode-omo-best-practices-task-list.md`

## 2. 外部能力到 GodCode 的映射

| 外部实践能力      | GodCode 对应能力                    | 核心文件                                                                       |
| ----------------- | ----------------------------------- | ------------------------------------------------------------------------------ |
| Slash 命令触发    | Skill registry + command items      | `/Users/mirage/AI/AiWork/GodCode/src/main/services/skills/registry.ts`         |
| 命令模板执行      | Skill Runtime Payload 组装          | `/Users/mirage/AI/AiWork/GodCode/src/main/ipc/handlers/message.ts`             |
| 工具名兼容        | Tool alias resolve                  | `/Users/mirage/AI/AiWork/GodCode/src/main/services/tools/tool-registry.ts`     |
| 执行权限模板      | PermissionPolicy + setting schema   | `/Users/mirage/AI/AiWork/GodCode/src/main/services/tools/permission-policy.ts` |
| 生命周期 Hook     | HookManager + hooks index           | `/Users/mirage/AI/AiWork/GodCode/src/main/services/hooks/manager.ts`           |
| Claude hooks 配置 | Claude Code adapter/config-loader   | `/Users/mirage/AI/AiWork/GodCode/src/main/services/hooks/claude-code/`         |
| 工作流事件观测    | workforce events -> onTaskLifecycle | `/Users/mirage/AI/AiWork/GodCode/src/main/services/workforce/events.ts`        |

## 3. 迁移前置检查

在正式迁移前，先确认以下三点：

1. **语义对齐**：外部能力是否能映射到 Skill / Tool / Hook / Workflow 四类。
2. **风险分级**：涉及写入、命令执行、浏览器交互的能力必须纳入 confirm/deny 机制。
3. **作用域边界**：优先使用“工具白名单 + 配置作用域（global/space）”而非硬编码放行。

相关设置框架：
`/Users/mirage/AI/AiWork/GodCode/src/main/services/settings/schema-registry.ts`

## 4. 分阶段适配流程

### 阶段 A：命令与 Skill 迁移

把外部“命令即流程”能力映射为 Skill：

- 定义 `id/name/template/triggers.command/allowedTools`
- 在 loader/registry 中可发现
- 在消息主链路组装 `SkillRuntimePayload`

关键函数：
`assembleSkillRuntimePayload(...)`

文件：
`/Users/mirage/AI/AiWork/GodCode/src/main/ipc/handlers/message.ts`

补充参考：
`/Users/mirage/AI/AiWork/GodCode/docs/如何新增skill.md`

### 阶段 B：工具名兼容与作用域收敛

将外部工具名映射到 GodCode 工具名：

- 在 `tool-registry.ts` 添加 alias
- 执行前统一 `resolveName`
- 与权限策略、建议名机制协同

文件：
`/Users/mirage/AI/AiWork/GodCode/src/main/services/tools/tool-registry.ts`
`/Users/mirage/AI/AiWork/GodCode/src/main/services/tools/tool-execution.service.ts`

补充参考：
`/Users/mirage/AI/AiWork/GodCode/docs/工具alias配置规范.md`

### 阶段 C：权限模板适配

把外部“安全模式”迁移为 GodCode 模板：

- Safe / Balanced / Full
- 模板写入系统设置 `permissionTemplate`
- 高风险工具即使 full 也强制确认（防静默高危执行）

文件：
`/Users/mirage/AI/AiWork/GodCode/src/main/services/tools/permission-policy.ts`
`/Users/mirage/AI/AiWork/GodCode/src/main/services/settings/schema-registry.ts`

补充参考：
`/Users/mirage/AI/AiWork/GodCode/docs/权限模板设计规范.md`

### 阶段 D：Hook 生命周期迁移

把外部 Hook 行为迁移到统一事件面：

- 工具前后逻辑 -> onToolStart/onToolEnd
- 消息增强 -> onMessageCreate
- 容错恢复 -> onEditError
- 工作流埋点 -> onTaskLifecycle

文件：
`/Users/mirage/AI/AiWork/GodCode/src/main/services/hooks/types.ts`
`/Users/mirage/AI/AiWork/GodCode/src/main/services/hooks/manager.ts`

对于 `.claude/settings.json` 来源，可直接使用兼容层：

- 配置加载顺序：`user < project < local < plugin`
- 事件映射：`PreToolUse/PostToolUse/PostToolUseFailure`

文件：
`/Users/mirage/AI/AiWork/GodCode/src/main/services/hooks/claude-code/config-loader.ts`
`/Users/mirage/AI/AiWork/GodCode/src/main/services/hooks/claude-code/adapter.ts`

### 阶段 E：观测与治理闭环

完成迁移后必须接入治理：

- `hook-governance:get/set` 可读写启停与优先级
- recent executions 可查看执行结果与失败原因
- 治理快照持久化到系统设置

文件：
`/Users/mirage/AI/AiWork/GodCode/src/main/ipc/handlers/workflow-observability.ts`
`/Users/mirage/AI/AiWork/GodCode/src/main/services/hooks/index.ts`

## 5. 关键安全约束（迁移必须遵守）

1. 先 alias 归一化，再做权限判定。
2. 未知工具不得默认 auto。
3. 高风险工具（如 bash/file_write）不得静默放行。
4. Hook 异常必须降级，不可拖垮主链路。
5. direct/workforce 路径应保持一致错误语义。

## 6. 回归验证清单

每次迁移最少覆盖以下验证：

1. Skill 可发现、可触发、可执行。
2. alias 命中后权限结果与真实工具一致。
3. Safe/Balanced/Full 三模板行为可复现。
4. Hook 异常（超时/错误）下主链路仍可继续。
5. governance 状态与审计日志可还原执行决策。

## 7. 常见迁移误区

1. 直接照搬外部字段，不做本地语义收敛。
2. 只迁移功能，不迁移权限和审计。
3. 在单一路径验证通过就宣布完成，忽略 direct/workforce 差异。
4. 将一次性实验配置写死进系统默认逻辑。

## 8. 推荐落地顺序（低风险）

1. Skill（可运行）
2. Tool alias（可兼容）
3. Permission template（可控）
4. Hook（可扩展）
5. Observability（可排障）

这样可以先保证“可用”，再保证“可控与可维护”。

## 9. 交付定义（迁移完成）

满足以下条件可认为迁移完成：

- 新能力可通过文档在新仓库复现
- 权限和 Hook 治理配置可视化可审计
- 关键失败场景可在诊断链路定位
- 回滚方案明确（配置回退 + Hook 禁用 + alias 移除）
