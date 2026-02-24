# Agent Routing Alignment Design (FuXi / HaoTian / KuaFu)

## 1. TL;DR
采用方案A（入口修正 + 规则收敛）实现“行为等价”对齐参考项目：
- 主代理（fuxi/haotian/kuafu）统一走 workforce 编排链，避免入口层直接 delegate 造成分派失真。
- 实现任务采用 category-first；专家/研究任务采用 subagent。
- checkpoint owner 收敛到 haotian。
- fuxi 增加运行时硬门禁：仅规划，不允许直接执行实现。
- 伏羲计划默认产出路径从 `.sisyphus/*` 改为 `.fuxi/*`，并兼容读取历史 `.sisyphus/plans/*.md`。

## 2. Context
### 2.1 现状问题
1. 路由入口存在“agentCode 即 delegate”分支，可能绕过 workforce 的完整分解与分派策略，导致类别使用偏窄。
2. workforce 内部已有 category-first 与专家注入规则，但入口绕过时无法稳定生效。
3. fuxi 的 planning-only 目前主要依赖 prompt 约束，工程层缺少统一硬门禁。
4. checkpoint 的 owner 范围过宽（primary orchestrator 皆可），与角色边界不完全一致。
5. 计划文件路径当前围绕 `.sisyphus/plans/*.md`，需改为 `.fuxi/plans/*.md` 并兼容历史。

### 2.2 对齐目标（行为等价）
- 与参考项目一致采用“category 与 subagent 双轨互斥”思想：
  - implementation/domain execution -> category
  - specialist/research/review -> subagent
- planner 只产出计划工件；executor 执行计划；orchestrator 负责编排与质量门禁。

## 3. Design
### 3.1 Routing Architecture
#### 3.1.1 SmartRouter 主代理入口修正
- 当 context.agentCode 为 primary（fuxi/haotian/kuafu）时：
  - 不再走 `delegate` 快路径；统一走 `workforce`。
- 当 context.agentCode 为 subagent 时：
  - 仍允许 `delegate`。
- 保留显式 `forceWorkforce` 与显式指令优先级。

**效果**：主代理行为统一进入 workforce 的分解/依赖/波次/checkpoint 体系，避免入口分流导致的类别失真。

#### 3.1.2 category-first 保持并硬化
- 保持 workforce 现有规则：执行任务优先 category，专家任务才 subagent。
- 在任务归一化后增加一致性检查：
  - execution phase 禁止 specialist 作为终态执行分派（review phase 的 chongming/leigong 例外）。

### 3.2 Stage Ownership & Guardrails
#### 3.2.1 checkpoint owner 收敛
- `shouldRequireOrchestratorCheckpoint` 从“任意 primary orchestrator”收敛到仅 `haotian`。
- `runOrchestratorCheckpoint` 执行者归一化为 `haotian`（防止 fuxi/kuafu 进入 checkpoint 执行）。

#### 3.2.2 fuxi planning-only 运行时硬门禁
在 delegate 引擎添加硬校验：
- 若 `subagent_type=fuxi` 且 metadata/workflowStage 指向执行编排阶段（dispatch/checkpoint/integration/finalize/execution）或请求为实现型任务：直接拒绝并返回 handoff 指引。
- 允许 fuxi 在 planning 阶段产出计划工件（`.fuxi/plans` / `.fuxi/drafts`）。

### 3.3 Plan Artifact Path Migration
#### 3.3.1 新默认路径
- 计划文件：`.fuxi/plans/*.md`
- 草稿文件：`.fuxi/drafts/*.md`

#### 3.3.2 兼容读取（你已确认）
- 执行阶段读取顺序：
  1. 显式指定路径
  2. `.fuxi/plans/*.md`
  3. 历史 `.sisyphus/plans/*.md`（兼容）
- 输入解析与正则匹配需同时支持 `.fuxi` 与 `.sisyphus`。
- 对用户提示文案统一改为 `.fuxi`，但检测到旧路径时允许继续执行并提示可迁移。

## 4. File-level Change Scope
1. `src/main/services/router/smart-router.ts`
   - 调整 `context.agentCode` 分支：primary -> workforce，subagent -> delegate。

2. `src/main/services/workforce/workforce-engine.ts`
   - checkpoint owner 收敛与执行者归一化。
   - 计划路径解析：新增 `.fuxi` 默认并保留 `.sisyphus` 兼容读取。
   - `extractPlanPathFromInput` 与相关路径提取/匹配支持双前缀。
   - 用户提示文本改为 `.fuxi/plans`。

3. `src/main/services/delegate/prompts/fuxi.ts`
   - 输出路径约束改为 `.fuxi/plans` 与 `.fuxi/drafts`。

4. `src/main/services/delegate/delegate-engine.ts`
   - 增加 fuxi runtime role guard（planning-only）。

5. 相关测试文件（新增/更新）
   - `tests/unit/services/workforce/workforce-engine.test.ts`
   - `tests/integration/workforce-engine.test.ts`
   - `tests/unit/services/delegate/delegate-engine.test.ts`
   - `tests/unit/services/router/smart-router.test.ts`（如已有则扩展）

## 5. Error Handling Strategy
- 仅在系统边界做约束：
  - 主代理错误路由（primary 走 delegate）-> 在 router 层纠正。
  - fuxi 非 planning 调用 -> 明确拒绝错误，返回可执行下一步提示。
  - 找不到计划文件 -> 错误信息优先 `.fuxi`，附带兼容 `.sisyphus` 说明。
- 不引入额外回退黑魔法，避免隐式行为。

## 6. Testing Strategy
### 6.1 路由测试
- `primary agentCode` 走 workforce；`subagent agentCode` 走 delegate。

### 6.2 workforce 分派测试
- execution phase 为 category-first。
- discovery/review phase 允许 specialist。
- checkpoint owner 仅 haotian。

### 6.3 fuxi 约束测试
- fuxi 在执行阶段请求被拒绝。
- fuxi planning 请求允许并保留 planning 工件路径。

### 6.4 路径兼容测试
- 新路径 `.fuxi/plans/*.md` 可解析并执行。
- 历史 `.sisyphus/plans/*.md` 仍可读取执行（兼容）。
- 输入中两类路径正则均可提取。

## 7. Rollout / Risk
- 风险低：以入口修正 + 约束硬化为主，不改核心存储结构。
- 潜在影响：依赖旧入口“primary 直 delegate”的边缘流程会变更到 workforce；通过测试覆盖保障。

## 8. Success Criteria
1. 主代理任务稳定进入 workforce，不再出现入口绕过导致的类别分配异常。
2. implementation 子任务以 category 为主，specialist 仅用于 research/review。
3. checkpoint 仅由 haotian 拥有。
4. fuxi 不能直接执行实现任务。
5. 新计划路径 `.fuxi/*` 生效，且旧 `.sisyphus/plans/*` 可兼容读取。