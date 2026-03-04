# CodeAll 吸收 opencode / omo 优秀实践任务清单

> 目标：**学习并接入优秀能力**，而不是 1:1 复刻 opencode 或 omo。
>
> 原则：最小可行接入、低耦合、可测试、可回滚。

---

## 1. 范围定义

### 1.1 纳入范围（学习优秀实践）

- 命令式交互体验（`/命令`、快捷动作、可发现性）
- Skill 驱动的任务模板与执行治理
- 工具权限与安全策略（auto/confirm/deny）
- 多 Agent 协作编排（direct + workforce）
- 配置治理（全局/空间/工作区）
- 可观测性（任务状态、工具调用、失败恢复）

### 1.2 明确不做（当前阶段）

- 不做 opencode/omo 全量行为复刻
- 不做强依赖其私有内部 API 的能力
- 不做插件市场/远程分发系统
- 不追求配置文件字段完全一致

---

## 2. 当前可复用基础（CodeAll 现状）

- 聊天与输入主链路：`src/renderer/src/components/chat/MessageInput.tsx`
- 聊天页视图切换与动作扩展：`src/renderer/src/pages/ChatPage.tsx`
- 技能定义/注册/加载：
  - `src/main/services/skills/types.ts`
  - `src/main/services/skills/registry.ts`
  - `src/main/services/skills/loader.ts`
- 消息执行主链路（direct/workforce）：`src/main/ipc/handlers/message.ts`
- 工具注册与执行：
  - `src/main/services/tools/index.ts`
  - `src/main/services/tools/tool-registry.ts`
  - `src/main/services/tools/tool-executor.ts`
  - `src/main/services/tools/permission-policy.ts`
- Agent 定义与角色：
  - `src/shared/agent-definitions.ts`
  - `src/main/services/delegate/agents.ts`
- Workforce 编排引擎：`src/main/services/workforce/workforce-engine.ts`
- 设置页与配置存取：
  - `src/renderer/src/pages/SettingsPage.tsx`
  - `src/renderer/src/store/config.store.ts`
  - `src/shared/ipc-channels.ts`

---

## 3. 详细任务清单（按优先级）

## P0（必须优先完成）

### P0-1 命令面板（Slash Command Palette）

**目标**：让用户可发现并快速触发 skill/快捷动作。
**对标优秀点**：opencode/omo 的命令式交互效率。

**任务项**

- [ ] 在输入框增加 `/` 触发的命令面板 UI
- [ ] 支持按命令名/描述关键字过滤
- [ ] 支持键盘上下选择与回车确认
- [ ] 支持最近使用命令（MRU）
- [ ] 统一“插入命令草稿”与“直接执行命令”两种模式
- [ ] 在空输入态展示常用快捷动作

**涉及文件（初步）**

- `src/renderer/src/components/chat/MessageInput.tsx`
- `src/main/services/skills/registry.ts`

**验收标准**

- [ ] 用户输入 `/` 后 200ms 内出现命令列表
- [ ] 命令筛选结果与 `SkillRegistry` 一致
- [ ] 支持鼠标与键盘完整操作

---

### P0-2 Skill 执行器（Skill Runtime Bridge）

**目标**：把 skill 定义稳定接入消息执行链路。
**对标优秀点**：omo 的“命令即流程”执行一致性。

**任务项**

- [ ] 设计 `skill -> message payload` 组装协议
- [ ] 将 `template/allowedTools/agent/model/subtask/mcpConfig` 注入运行时
- [ ] 定义执行前校验（缺字段、禁用 skill、工具越权）
- [ ] 统一 direct/workforce 两条路径的 skill 调用行为
- [ ] 返回结构中增加 skill 元数据（用于 UI 展示与审计）

**涉及文件（初步）**

- `src/main/services/skills/types.ts`
- `src/main/services/skills/registry.ts`
- `src/main/ipc/handlers/message.ts`

**验收标准**

- [ ] 任一启用 skill 可稳定执行
- [ ] 运行日志中可追踪 skill id、工具白名单、agent 选择
- [ ] direct 与 workforce 的错误语义一致

---

### P0-3 工具名兼容层（Tool Alias / Adapter）

**目标**：避免“skill 可加载但工具找不到”的兼容问题。
**对标优秀点**：插件生态在不同宿主中的可迁移性。

**任务项**

- [ ] 定义工具别名映射表（如 `read -> file_read`）
- [ ] 在 tool resolve 阶段实现 alias 解析
- [ ] 增加冲突策略（同名优先级、禁用规则）
- [ ] 对 alias 命中进行审计日志记录
- [ ] 对高风险工具保留权限策略约束

**涉及文件（初步）**

- `src/main/services/tools/index.ts`
- `src/main/services/tools/tool-registry.ts`
- `src/main/services/tools/tool-executor.ts`
- `src/main/services/tools/permission-policy.ts`

**验收标准**

- [ ] 已配置 alias 的 skill 100% 能解析工具
- [ ] 未映射工具返回明确错误与建议
- [ ] 权限策略不被 alias 绕过

---

### P0-4 配置挂载能力（Skill/Feature Settings Schema）

**目标**：让功能以“配置驱动”而非硬编码方式运行。
**对标优秀点**：opencode/omo 设置可管理性。

**任务项**

- [ ] 定义 settings schema（类型、默认值、校验、可见范围）
- [ ] 增加 settings 注册中心
- [ ] 在设置页渲染动态配置项
- [ ] 支持全局与空间级覆盖
- [ ] 为关键配置提供导入/导出能力（可选）

**涉及文件（初步）**

- `src/renderer/src/pages/SettingsPage.tsx`
- `src/renderer/src/store/config.store.ts`
- `src/shared/ipc-channels.ts`

**验收标准**

- [ ] 新功能无需改 UI 主代码即可接入设置项
- [ ] 配置变更实时生效或明确重启策略
- [ ] 非法配置有前后端双重校验

---

### P0-5 生命周期 Hook 统一

**目标**：统一扩展事件面，避免多套 hook 体系分裂。
**对标优秀点**：插件/扩展行为可预测、可审计。

**任务项**

- [ ] 梳理现有 hook 事件并建立统一枚举
- [ ] 明确事件触发顺序与载荷结构
- [ ] 定义失败处理策略（阻断/降级/旁路）
- [ ] 增加 hook 执行超时与熔断策略
- [ ] 输出开发者文档与示例

**涉及文件（初步）**

- `src/main/services/hooks/manager.ts`
- `src/main/services/orchestration/hook-manager.ts`

**验收标准**

- [ ] 单一入口管理 hook 生命周期
- [ ] hook 异常不会导致主链路不可恢复中断
- [ ] 审计日志可定位每次 hook 执行结果

---

## P1（高价值增强）

### P1-1 内置 Skill Pack（精选工作流）

**目标**：沉淀高频研发场景的一键工作流。
**建议首批 skill**：`/review`、`/test-plan`、`/fix`、`/refactor`、`/explain`、`/summarize-diff`。

**任务项**

- [ ] 设计 skill 元数据标准（标签、场景、风险级别）
- [ ] 建立内置 skill 包目录与版本管理
- [ ] 每个 skill 补齐输入模板与输出结构约束
- [ ] 增加灰度开关（按空间/用户启用）
- [ ] 补齐回归用例（正向+异常）

**验收标准**

- [ ] 首批 skill 在真实项目场景可复现稳定结果
- [ ] skill 更新可追踪（版本、变更日志）

---

### P1-2 Agent Presets（角色预设）

**目标**：以最少配置切换不同协作模式。
**建议预设**：Planner、Coder、Reviewer、Researcher、Debugger。

**任务项**

- [ ] 定义 preset 与现有 AgentDefinition 的映射
- [ ] 支持 preset 绑定默认工具白名单
- [ ] 支持 preset 绑定推荐模型与温度
- [ ] 前端增加 preset 快速切换入口

**涉及文件（初步）**

- `src/shared/agent-definitions.ts`
- `src/main/services/delegate/agents.ts`
- `src/renderer/src/components/chat/AgentSelector.tsx`

**验收标准**

- [ ] 切换 preset 后执行行为符合预期角色
- [ ] preset 不破坏原有自定义 agent 配置

---

### P1-3 上下文注入策略标准化

**目标**：提升命令执行成功率与上下文相关性。

**任务项**

- [ ] 定义可注入上下文类型（当前文件、选区、最近消息、workspace）
- [ ] 定义注入优先级与截断策略
- [ ] 增加隐私/敏感路径过滤规则
- [ ] 在 UI 显示“本次注入上下文摘要”

**验收标准**

- [ ] 命令成功率有可观测提升
- [ ] 敏感内容不会被默认注入

---

### P1-4 权限模板与安全护栏

**目标**：在效率与安全间建立默认平衡。

**任务项**

- [ ] 设计权限模板（Safe / Balanced / Full）
- [ ] 模板映射到 `auto/confirm/deny`
- [ ] 高风险工具默认需要确认
- [ ] 在执行前展示权限预览
- [ ] 对拒绝/越权行为进行日志记录

**验收标准**

- [ ] 模板切换后权限行为可预测
- [ ] 高风险命令不会静默执行

---

## P2（工程化完善）

### P2-1 可观测性与诊断面板

**目标**：降低排障成本，提升线上可维护性。

**任务项**

- [ ] 统一采集：skill 执行、工具调用、hook 结果、失败原因
- [ ] 增加失败分类（配置错误、权限拒绝、工具不可用、模型失败）
- [ ] 输出诊断视图（按 session/task 追踪）
- [ ] 提供“复制诊断包”能力

**验收标准**

- [ ] 关键失败场景可在 1 次诊断链路中定位

---

### P2-2 兼容回归测试矩阵

**目标**：确保“升级后不退化”。

**任务项**

- [ ] 建立 skill 执行回归用例集
- [ ] 建立工具 alias 兼容用例集
- [ ] 建立权限模板行为用例集
- [ ] 建立 hook 生命周期回归用例集
- [ ] 纳入 CI 必跑检查

**验收标准**

- [ ] 关键链路在 CI 中稳定通过
- [ ] 兼容问题可被自动测试提前发现

---

### P2-3 开发者文档与迁移指南

**目标**：降低后续功能接入门槛。

**任务项**

- [x] 编写《如何新增 skill》指南
- [x] 编写《工具 alias 配置规范》
- [x] 编写《权限模板设计规范》
- [x] 编写《Hook 开发与调试指南》
- [x] 编写《从外部优秀实践迁移到 CodeAll 的适配流程》

**验收标准**

- [ ] 新成员可按文档独立新增一个可用 skill

---

## 4. 会话拆分原则（200k 上下文约束）

为确保每个任务在单次会话自动压缩前可完成，采用以下硬约束：

- 单批只解决一个可验收目标（不跨多个架构决策）
- 单批修改文件建议 `<= 4`（测试批次可放宽到 `<= 6`）
- 单批命令/工具调用建议 `<= 25`
- 单批输出必须包含“可见产物”（代码变更、测试结果、文档更新三选一）
- 单批必须可独立回滚（不依赖未提交的隐含状态）

**统一中止条件（任一触发即停止当前批次）**

- 会话上下文已接近压缩阈值（建议在明显冗长前主动收束）
- 出现新的架构分歧且无法在当前批次内达成一致
- 同类错误连续出现 2 次以上且根因未明确
- 需要新增超出本批次定义的跨模块改造

---

## 5. 执行批次清单（Session Batches）

> 说明：每个批次都包含 **输入 / 输出 / 验收标准 / 中止条件**，可直接作为单次会话任务单。

### B01｜命令面板数据协议与接口冻结（P0-1 前半） ✅ 已完成

- **输入**
  - 现有 Skill 模型与 Registry
  - `MessageInput` 当前交互逻辑
- **输出**
  - 命令项数据结构（label/command/description/argsHint）
  - 命令查询接口（按前缀、关键字过滤）
- **验收标准**
  - 命令结构字段完整并与 SkillRegistry 对齐
  - 查询接口可返回稳定排序结果
- **中止条件**
  - Skill 元数据定义需要大改（超出本批次）

### B02｜命令面板基础 UI（P0-1 后半） ✅ 已完成

- **输入**
  - B01 的命令结构与查询接口
- **输出**
  - `/` 触发面板
  - 列表渲染与空态提示
- **验收标准**
  - 输入 `/` 能显示命令列表
  - 输入非命令文本不误触发
- **中止条件**
  - 现有输入组件结构需重构为多组件（转入后续专项批次）

### B03｜命令面板可用性增强（键盘/MRU）（P0-1 收口） ✅ 已完成

- **输入**
  - B02 可用面板
- **输出**
  - 上下键选择、回车确认、ESC 关闭
  - 最近使用命令（MRU）
- **验收标准**
  - 全键盘可完成一次命令触发
  - MRU 在新会话可复用（按既定存储策略）
- **中止条件**
  - MRU 存储策略与全局设置方案冲突

### B04｜Skill Payload 组装器（P0-2 前半） ✅ 已完成

- **输入**
  - `Skill` 定义字段：template/allowedTools/agent/model/subtask/mcpConfig
- **输出**
  - skill -> message payload 组装逻辑
  - 缺失字段与禁用态校验
- **验收标准**
  - 任一合法 skill 可产出标准 payload
  - 非法 skill 返回可读错误
- **中止条件**
  - 发现 `Skill` 类型设计缺陷需先调整 schema

### B05｜Skill 执行接线（direct/workforce 一致化）（P0-2 后半） ✅ 已完成

- **输入**
  - B04 payload
  - `message` IPC 主链路
- **输出**
  - Skill 在 direct/workforce 两条路径都可运行
  - 返回结构中附带 skill 元数据（用于审计/展示）
- **验收标准**
  - 同一 skill 在两条路径行为一致（成功/失败语义）
- **中止条件**
  - workforce 路由策略需独立重构

### B06｜工具别名映射与解析（P0-3 前半） ✅ 已完成

- **输入**
  - 当前工具注册表
  - 目标 alias 清单（例如 read -> file_read）
- **输出**
  - alias 映射表
  - tool resolve 的 alias 解析流程
- **验收标准**
  - 映射内工具名均可解析到真实工具
  - 未映射名返回明确建议
- **中止条件**
  - 发现同名工具语义冲突无法自动消解

### B07｜权限护栏与 alias 安全校验（P0-3 后半） ✅ 已完成

- **输入**
  - B06 解析流程
  - permission-policy
- **输出**
  - alias 命中后的权限复核
  - 高风险工具确认策略不被绕过
- **验收标准**
  - alias 不改变原有安全等级
  - 有审计日志可追踪 alias 命中
- **中止条件**
  - 权限系统需引入新模型（超出本批次）

### B08｜配置 Schema 注册中心（P0-4 前半） ✅ 已完成

- **输入**
  - 现有 settings IPC 与 store
- **输出**
  - settings schema 定义（类型/默认值/校验/作用域）
  - 后端注册与读取接口
- **验收标准**
  - 新功能可声明并读取 schema 配置
- **中止条件**
  - 配置存储层需迁移数据库结构

### B09｜设置页动态渲染（P0-4 后半） ✅ 已完成

- **输入**
  - B08 schema
  - 设置页现有结构
- **输出**
  - schema 驱动渲染控件
  - 全局/空间覆盖交互
- **验收标准**
  - 至少一个新 schema 字段可从 UI 配置并生效
- **中止条件**
  - UI 框架约束导致需先抽象表单引擎

### B10｜Hook 事件统一与单入口（P0-5 前半） ✅ 已完成

- **输入**
  - 两套现有 hook manager
- **输出**
  - 统一事件枚举与载荷定义
  - 单入口分发机制
- **验收标准**
  - 核心事件（message/tool/task）均可经单入口触发
- **中止条件**
  - 发现历史事件兼容必须分阶段迁移

### B11｜Hook 可靠性策略（超时/熔断/降级）（P0-5 后半） ✅ 已完成

- **输入**
  - B10 统一入口
- **输出**
  - 超时控制
  - 熔断与降级策略
  - 开发者最小调试文档
- **验收标准**
  - hook 异常不阻断主链路
  - 可定位每次 hook 结果
- **中止条件**
  - 需要统一日志基础设施改造

### B12｜内置 Skill Pack 首批落地（P1-1）

- **输入**
  - P0 全部打通
- **输出**
  - 首批内置 skill（建议 3 个起步：`/review`、`/fix`、`/explain`）
  - skill 元数据规范与版本字段
- **验收标准**
  - 3 个 skill 在真实仓库场景可执行
- **中止条件**
  - 某个 skill 依赖未接入的外部能力（先剔除出首批）

### B13｜Agent Presets（P1-2）

- **输入**
  - 现有 agent definitions
- **输出**
  - 角色预设（Planner/Coder/Reviewer/Researcher/Debugger）
  - 预设切换入口
- **验收标准**
  - 切换后工具白名单与模型偏好生效
- **中止条件**
  - 自定义 agent 与 preset 冲突规则未定

### B14｜上下文注入与敏感过滤（P1-3）

- **输入**
  - 消息上下文来源
  - 安全过滤规则
- **输出**
  - 上下文注入优先级与截断策略
  - 敏感路径默认过滤
- **验收标准**
  - 注入摘要可展示，敏感内容不默认注入
- **中止条件**
  - 需要新增跨会话记忆系统

### B15｜权限模板（P1-4）

- **输入**
  - permission-policy
- **输出**
  - Safe / Balanced / Full 模板
  - 执行前权限预览
- **验收标准**
  - 模板切换后权限行为可预测
- **中止条件**
  - 需改动现有权限存储模型

### B16｜可观测性与诊断视图（P2-1）

- **输入**
  - 执行日志、任务状态、hook 结果
- **输出**
  - 失败分类
  - session/task 维度诊断视图
- **验收标准**
  - 一次失败可在单视图定位根因类别
- **中止条件**
  - 现有日志维度不足以支撑诊断视图

### B17｜兼容回归测试矩阵（P2-2）

- **输入**
  - P0/P1 产物
- **输出**
  - skill/alias/permission/hook 回归用例
  - CI 必跑项
- **验收标准**
  - 关键链路回归可自动发现退化
- **中止条件**
  - CI 资源不足或执行时长超出当前限制

### B18｜开发者文档与迁移指南（P2-3）

- **输入**
  - 实际落地经验
- **输出**
  - 新增 skill、alias、权限模板、hook 调试、迁移流程文档
- **验收标准**
  - 新成员按文档可独立完成一个 skill 接入
- **中止条件**
  - 核心接口仍在频繁变更（先冻结 API 再出文档）

---

## 6. 批次执行顺序（建议）

1. B01 → B02 → B03
2. B04 → B05
3. B06 → B07
4. B08 → B09
5. B10 → B11
6. B12 → B13 → B14 → B15
7. B16 → B17 → B18

---

## 7. 完成定义（Definition of Done）

- [ ] 用户可通过命令面板发现并执行关键技能
- [ ] 技能执行在 direct/workforce 模式行为一致
- [ ] 工具别名兼容不破坏权限安全边界
- [ ] 配置可视化管理并支持覆盖策略
- [ ] Hook 生命周期单一化且可审计
- [ ] 至少 1 组内置 skill pack 在真实仓库验证通过
- [ ] 关键回归测试纳入 CI

---

## 8. 备注

- 本清单强调“吸收优秀实践”，并非“镜像复刻”。
- 若后续决定引入更深插件生态，再单独立项设计插件协议与生命周期，不与本阶段耦合。

