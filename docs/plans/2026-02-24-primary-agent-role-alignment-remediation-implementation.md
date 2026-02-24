# Primary Agent Role Alignment Remediation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 完整修复伏羲/昊天/夸父与辅助 agent/任务类别调用偏差，使行为与参考项目 Prometheus/Sisyphus/Atlas 的“规划-编排-执行 + category/subagent 双轨”语义一致。

**Architecture:** 在三个边界层做收敛：入口路由层（显式主 Agent 必须进入 workforce）、委托执行层（伏羲运行时 planning-only 硬门禁）、编排调度层（checkpoint owner 与计划路径解析统一）。同时把计划工件默认路径迁移到 `.fuxi/*`，并保留 `.sisyphus/*` 兼容读取。

**Tech Stack:** TypeScript, Electron IPC (main process), Workforce/Delegate services, Vitest unit/integration tests.

---

### Task 1: 修复主 Agent 入口路由（primary -> workforce, subagent -> delegate）

**Files:**
- Modify: `src/main/services/router/smart-router.ts:136-177`
- Modify: `src/shared/agent-definitions.ts:69-76`
- Test: `tests/unit/services/router/smart-router.test.ts:133-148`
- Test: `tests/unit/shared/agent-definitions.test.ts:56-64`

**Step 1: Write the failing test**

```ts
it('should route primary agentCode through workforce even without forceWorkforce', async () => {
  await router.route('创建用户注册功能', {
    sessionId: 'session-1',
    agentCode: 'haotian'
  })

  expect(mockWorkforceEngine.executeWorkflow).toHaveBeenCalledWith(
    '创建用户注册功能',
    'session-1',
    expect.objectContaining({ agentCode: 'haotian' })
  )
  expect(mockDelegateEngine.delegateTask).not.toHaveBeenCalled()
})

it('should keep subagent agentCode on delegate route', async () => {
  await router.route('分析模块边界', {
    sessionId: 'session-1',
    agentCode: 'qianliyan'
  })

  expect(mockDelegateEngine.delegateTask).toHaveBeenCalledWith(
    expect.objectContaining({ subagent_type: 'qianliyan' })
  )
})
```

在 `agent-definitions` 增加断言：

```ts
expect(fuxi?.defaultStrategy).toBe('workforce')
```

**Step 2: Run test to verify it fails**

Run:
- `pnpm vitest tests/unit/services/router/smart-router.test.ts -t "primary agentCode through workforce" --run`
- `pnpm vitest tests/unit/shared/agent-definitions.test.ts -t "defaultStrategy" --run`

Expected:
- FAIL，因为当前 `context.agentCode` 分支仍返回 `delegate`
- FAIL，因为当前 `fuxi.defaultStrategy` 仍是 `direct-enhanced`

**Step 3: Write minimal implementation**

```ts
// smart-router.ts
const PRIMARY_AGENT_CODES = new Set(['fuxi', 'haotian', 'kuafu'])

if (context?.agentCode?.trim()) {
  const normalized = context.agentCode.trim().toLowerCase()
  if (PRIMARY_AGENT_CODES.has(normalized)) {
    rationale.push('primary agentCode must route through workforce orchestration')
    return { strategy: 'workforce', category: 'dayu', complexityScore: 0.7, rationale }
  }

  rationale.push('subagent agentCode requires delegate route')
  return { strategy: 'delegate', subagent: context.agentCode.trim(), complexityScore: 0.55, rationale }
}
```

```ts
// agent-definitions.ts (fuxi)
defaultStrategy: 'workforce'
```

**Step 4: Run test to verify it passes**

Run:
- `pnpm vitest tests/unit/services/router/smart-router.test.ts --run`
- `pnpm vitest tests/unit/shared/agent-definitions.test.ts --run`

Expected: PASS

**Step 5: Commit**

```bash
git add tests/unit/services/router/smart-router.test.ts tests/unit/shared/agent-definitions.test.ts src/main/services/router/smart-router.ts src/shared/agent-definitions.ts
git commit -m "fix(routing): force primary agents through workforce entry"
```

---

### Task 2: 增加伏羲运行时 planning-only 硬门禁（非 strict mode 也生效）

**Files:**
- Modify: `src/main/services/delegate/delegate-engine.ts:368-436`
- Test: `tests/unit/services/delegate/delegate-engine.test.ts:466-536`

**Step 1: Write the failing test**

```ts
it('should reject fuxi execution-stage request even when strict role mode is off', async () => {
  const result = await delegateEngine.delegateTask({
    description: '实现支付链路并修改后端代码',
    prompt: '请直接实现并提交代码',
    subagent_type: 'fuxi',
    sessionId: 'test-session-123',
    metadata: { workflowStage: 'execution' }
  })

  expect(result.success).toBe(false)
  expect(result.output).toContain('FuXi is planning-only')
  expect(result.output).toContain('handoff')
})

it('should allow fuxi plan-stage request', async () => {
  const result = await delegateEngine.delegateTask({
    description: '为支付链路生成执行计划',
    prompt: '输出计划文件到 .fuxi/plans/payment.md',
    subagent_type: 'fuxi',
    sessionId: 'test-session-123',
    metadata: { workflowStage: 'plan' }
  })

  expect(result.success).toBe(true)
})
```

**Step 2: Run test to verify it fails**

Run:
- `pnpm vitest tests/unit/services/delegate/delegate-engine.test.ts -t "reject fuxi execution-stage" --run`

Expected: FAIL（当前仅 strict role mode 下才阻断）

**Step 3: Write minimal implementation**

```ts
const FUXI_BLOCKED_STAGES = new Set(['dispatch', 'checkpoint', 'integration', 'finalize', 'execution'])
const IMPLEMENTATION_INTENT_PATTERN = /(修复|实现|新增|重构|开发|改代码|implement|fix|build|refactor)/i

const normalizedStage =
  typeof metadataInput.workflowStage === 'string' ? metadataInput.workflowStage.trim().toLowerCase() : ''

if (resolvedSubagentType === 'fuxi') {
  const blockedByStage = normalizedStage && FUXI_BLOCKED_STAGES.has(normalizedStage)
  const blockedByIntent = IMPLEMENTATION_INTENT_PATTERN.test(`${description}\n${prompt}`)

  if (blockedByStage || blockedByIntent) {
    return {
      taskId: '',
      output:
        'FuXi is planning-only and cannot execute implementation tasks. Please handoff to haotian (orchestration) / kuafu (execution).',
      success: false,
      agentType: 'fuxi',
      model: modelConfig.model,
      modelSource,
      systemPromptTokens: 0
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run:
- `pnpm vitest tests/unit/services/delegate/delegate-engine.test.ts --run`

Expected: PASS

**Step 5: Commit**

```bash
git add tests/unit/services/delegate/delegate-engine.test.ts src/main/services/delegate/delegate-engine.ts
git commit -m "fix(delegate): hard-enforce fuxi planning-only runtime guard"
```

---

### Task 3: 收敛 checkpoint owner 到昊天（haotian-only）

**Files:**
- Modify: `src/main/services/workforce/workforce-engine.ts:2718-2720,3034-3040`
- Test: `tests/unit/services/workforce/workforce-engine.test.ts:454-471,1953`

**Step 1: Write the failing test**

```ts
it('should only require orchestrator checkpoint for haotian', async () => {
  await workforceEngine.executeWorkflow('执行流程', 'test-session-123', {
    agentCode: 'fuxi',
    enableRetry: false
  })

  const checkpointCalls = mockWorkerDispatcher.dispatch.mock.calls
    .map(call => call[0])
    .filter(input => input.metadata?.orchestrationCheckpoint)

  expect(checkpointCalls).toHaveLength(0)
})

it('should dispatch checkpoint reviewer as haotian', async () => {
  await workforceEngine.executeWorkflow('执行流程', 'test-session-123', {
    agentCode: 'haotian',
    enableRetry: false
  })

  const checkpointCall = mockWorkerDispatcher.dispatch.mock.calls
    .map(call => call[0])
    .find(input => input.metadata?.orchestrationCheckpoint)

  expect(checkpointCall?.subagent_type).toBe('haotian')
})
```

**Step 2: Run test to verify it fails**

Run:
- `pnpm vitest tests/unit/services/workforce/workforce-engine.test.ts -t "only require orchestrator checkpoint for haotian" --run`

Expected: FAIL（当前 primary orchestrator 都触发 checkpoint）

**Step 3: Write minimal implementation**

```ts
private shouldRequireOrchestratorCheckpoint(agentCode?: string): boolean {
  return (agentCode || '').trim().toLowerCase() === 'haotian'
}
```

```ts
// runOrchestratorCheckpoint dispatch payload
subagent_type: 'haotian'
```

**Step 4: Run test to verify it passes**

Run:
- `pnpm vitest tests/unit/services/workforce/workforce-engine.test.ts --run`

Expected: PASS

**Step 5: Commit**

```bash
git add tests/unit/services/workforce/workforce-engine.test.ts src/main/services/workforce/workforce-engine.ts
git commit -m "fix(workforce): restrict checkpoint ownership to haotian"
```

---

### Task 4: 统一计划路径为 `.fuxi/*` 默认，并保留 `.sisyphus/*` 兼容

**Files:**
- Modify: `src/main/services/workforce/workforce-engine.ts:1898-1901,1996-1999`
- Modify: `src/main/services/delegate/prompts/fuxi.ts:35-37`
- Test: `tests/unit/services/workforce/workforce-engine.test.ts:1063-1439`
- Test: `tests/integration/chat-ipc.test.ts:574-640`

**Step 1: Write the failing test**

```ts
it('should parse both .fuxi and legacy .sisyphus plan paths from input', async () => {
  vi.spyOn(fs, 'existsSync').mockImplementation(p =>
    String(p).includes('.fuxi/plans/new-plan.md') || String(p).includes('.sisyphus/plans/old-plan.md')
  )
  vi.spyOn(fs, 'readFileSync').mockReturnValue('- [ ] Task 1: 实现接口')

  await workforceEngine.executeWorkflow('执行计划 .fuxi/plans/new-plan.md', 'test-session-123', { agentCode: 'kuafu' })
  await workforceEngine.executeWorkflow('执行计划 .sisyphus/plans/old-plan.md', 'test-session-123', { agentCode: 'kuafu' })

  expect(mockWorkerDispatcher.dispatch).toHaveBeenCalledTimes(2)
})
```

**Step 2: Run test to verify it fails**

Run:
- `pnpm vitest tests/unit/services/workforce/workforce-engine.test.ts -t "parse both .fuxi and legacy" --run`

Expected: FAIL（当前 regex 只匹配 `.sisyphus/plans/*.md`）

**Step 3: Write minimal implementation**

```ts
private extractPlanPathFromInput(input: string): string | undefined {
  const match = input.match(
    /(?:[A-Za-z]:)?[^\s"'`]*(?:\.fuxi|\.sisyphus)[\\/]+plans[\\/]+[^\s"'`<>]+\.md/i
  )
  return match?.[0]
}
```

```ts
// missing-plan message
'未找到可执行计划文件。请先让伏羲生成计划，或手动指定路径：执行计划 .fuxi/plans/<plan>.md（兼容 .sisyphus/plans/<plan>.md）'
```

```ts
// prompts/fuxi.ts
- 计划文件仅允许: .fuxi/plans/{plan-name}.md
- 草稿文件仅允许: .fuxi/drafts/{name}.md
```

**Step 4: Run test to verify it passes**

Run:
- `pnpm vitest tests/unit/services/workforce/workforce-engine.test.ts --run`
- `pnpm vitest tests/integration/chat-ipc.test.ts -t "fuxi handoff should capture .fuxi plan path" --run`

Expected: PASS

**Step 5: Commit**

```bash
git add tests/unit/services/workforce/workforce-engine.test.ts tests/integration/chat-ipc.test.ts src/main/services/workforce/workforce-engine.ts src/main/services/delegate/prompts/fuxi.ts
git commit -m "feat(plan-path): prefer .fuxi plans with legacy .sisyphus compatibility"
```

---

### Task 5: 迁移 boulder/continuation 默认路径到 `.fuxi`，并保留 legacy fallback

**Files:**
- Modify: `src/main/services/boulder-state.service.ts:30-31,150-153`
- Modify: `src/main/services/task-continuation.service.ts:31,205-233`
- Test: `tests/unit/services/boulder-state.test.ts:193-227`
- Test: `tests/unit/services/task-continuation.test.ts:105-119,275-291`

**Step 1: Write the failing test**

```ts
it('should create default boulder state under .fuxi', async () => {
  vi.mocked(fs.existsSync).mockReturnValue(false)
  const service = BoulderStateService.getInstance()
  const state = await service.getState()
  expect(state.active_plan).toContain('.fuxi/plans/')
})

it('should read continuation boulder from .fuxi first with .sisyphus fallback', () => {
  // arrange fs.existsSync/readFileSync for both paths and assert .fuxi priority
})
```

**Step 2: Run test to verify it fails**

Run:
- `pnpm vitest tests/unit/services/boulder-state.test.ts -t "default boulder state under .fuxi" --run`
- `pnpm vitest tests/unit/services/task-continuation.test.ts -t "boulder" --run`

Expected: FAIL（当前默认仍是 `.sisyphus`）

**Step 3: Write minimal implementation**

```ts
// boulder-state.service.ts
this.boulderPath = path.join(process.cwd(), '.fuxi', 'boulder.json')
const defaultPlanPath = path.join(process.cwd(), '.fuxi', 'plans', `${defaultPlanName}.md`)
```

```ts
// task-continuation.service.ts
const BOULDER_STATE_PATHS = [
  path.join(process.cwd(), '.fuxi', 'boulder.json'),
  path.join(process.cwd(), '.sisyphus', 'boulder.json')
]

// readBoulderContinuationContext() loops BOULDER_STATE_PATHS and reads first existing file
```

**Step 4: Run test to verify it passes**

Run:
- `pnpm vitest tests/unit/services/boulder-state.test.ts tests/unit/services/task-continuation.test.ts --run`

Expected: PASS

**Step 5: Commit**

```bash
git add tests/unit/services/boulder-state.test.ts tests/unit/services/task-continuation.test.ts src/main/services/boulder-state.service.ts src/main/services/task-continuation.service.ts
git commit -m "feat(state): move boulder defaults to .fuxi with legacy fallback"
```

---

### Task 6: 锁定“execution = category-first 且不只 dayu/zhinv”的回归保障

**Files:**
- Test: `tests/unit/services/workforce/workforce-engine.test.ts:1126-1189`
- (If needed) Modify: `src/main/services/workforce/workforce-engine.ts:1388-1422,2301-2356`

**Step 1: Write the failing test**

```ts
it('should map execution tasks into diverse categories (not only dayu/zhinv)', async () => {
  mockAdapter.sendMessage.mockResolvedValue({
    content: JSON.stringify({
      subtasks: [
        { id: 't1', description: '实现数据库迁移脚本', dependencies: [] },
        { id: 't2', description: '修复测试用例并补充断言', dependencies: [] },
        { id: 't3', description: '增加CI工作流和发布脚本', dependencies: [] }
      ]
    })
  })

  await workforceEngine.executeWorkflow('按实现任务执行', 'test-session-123', {
    agentCode: 'haotian',
    enableRetry: false
  })

  const calls = mockWorkerDispatcher.dispatch.mock.calls.map(call => call[0])
  const executionCalls = calls.filter(input => input.metadata?.workflowPhase === 'execution')

  expect(executionCalls.some(input => input.category === 'cangjie')).toBe(true)
  expect(executionCalls.some(input => input.category === 'tianbing')).toBe(true)
  expect(executionCalls.some(input => input.category === 'guigu')).toBe(true)
  expect(executionCalls.every(input => input.subagent_type === undefined)).toBe(true)
})
```

**Step 2: Run test to verify it fails**

Run:
- `pnpm vitest tests/unit/services/workforce/workforce-engine.test.ts -t "diverse categories" --run`

Expected: FAIL（若当前启发式未覆盖，或被默认 dayu 吞并）

**Step 3: Write minimal implementation (only if test fails)**

```ts
// workforce-engine.ts
// keep execution phase category-first
// ensure category inference includes cangjie/tianbing/guigu/maliang/guixu/tudi patterns before dayu fallback
```

**Step 4: Run test to verify it passes**

Run:
- `pnpm vitest tests/unit/services/workforce/workforce-engine.test.ts --run`

Expected: PASS

**Step 5: Commit**

```bash
git add tests/unit/services/workforce/workforce-engine.test.ts src/main/services/workforce/workforce-engine.ts
git commit -m "test(workforce): lock category-first execution diversity"
```

---

### Task 7: 全量验证与收尾

**Files:**
- Verify only (no mandatory file changes)

**Step 1: Run focused suites**

Run:
- `pnpm vitest tests/unit/services/router/smart-router.test.ts --run`
- `pnpm vitest tests/unit/shared/agent-definitions.test.ts --run`
- `pnpm vitest tests/unit/services/delegate/delegate-engine.test.ts --run`
- `pnpm vitest tests/unit/services/workforce/workforce-engine.test.ts --run`
- `pnpm vitest tests/unit/services/boulder-state.test.ts --run`
- `pnpm vitest tests/unit/services/task-continuation.test.ts --run`
- `pnpm vitest tests/integration/chat-ipc.test.ts --run`

Expected: PASS

**Step 2: Run project-wide test gate**

Run:
- `pnpm test`

Expected: PASS（若有与本变更无关失败，记录并停止扩展改动）

**Step 3: Spec-alignment checklist**

```md
- [ ] 显式主 Agent（fuxi/haotian/kuafu）默认进入 workforce
- [ ] subagent 仍走 delegate
- [ ] fuxi 运行时 planning-only（非 strict mode 也阻断实现请求）
- [ ] checkpoint owner 为 haotian
- [ ] 计划路径默认 .fuxi/plans，兼容 .sisyphus/plans
- [ ] execution 阶段 category-first 且类别不被 dayu/zhinv 锁死
```

**Step 4: Final commit (only if there are leftover adjustments)**

```bash
git add src/main/services/router/smart-router.ts src/shared/agent-definitions.ts src/main/services/delegate/delegate-engine.ts src/main/services/workforce/workforce-engine.ts src/main/services/delegate/prompts/fuxi.ts src/main/services/boulder-state.service.ts src/main/services/task-continuation.service.ts tests/unit/services/router/smart-router.test.ts tests/unit/shared/agent-definitions.test.ts tests/unit/services/delegate/delegate-engine.test.ts tests/unit/services/workforce/workforce-engine.test.ts tests/unit/services/boulder-state.test.ts tests/unit/services/task-continuation.test.ts tests/integration/chat-ipc.test.ts
git commit -m "feat(alignment): finalize primary-role routing and .fuxi plan-path remediation"
```

**Step 5: Pre-merge review handoff**

Use `@superpowers:requesting-code-review` before merge/PR.

---

## Execution Notes

- 每个 Task 严格使用 TDD（先失败测试，再最小实现，再通过测试）。
- 仅修复本计划范围，不做额外重构。
- 小步提交，保持每次提交可回滚。
- 若遇到外部依赖导致不稳定测试，先固定复现并在当前 Task 内解决，不跨 Task 扩散。
