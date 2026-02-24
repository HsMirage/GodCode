# Agent Routing Alignment (FuXi / HaoTian / KuaFu) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Align primary-agent routing and execution boundaries to behavior-equivalent OMO semantics: primary agents always orchestrate via workforce, implementation stays category-first, and FuXi is hard-restricted to planning with `.fuxi/*` plan artifacts plus `.sisyphus/*` compatibility reads.

**Architecture:** We will enforce boundaries at three layers: router entry (primary vs subagent route split), workforce orchestration (checkpoint owner + plan path resolution), and delegate runtime guardrails (FuXi planning-only hard rejection for execution-stage requests). Plan artifact migration is introduced as `.fuxi/plans` + `.fuxi/drafts` defaults while preserving compatibility with historical `.sisyphus/plans` reads. Tests are updated first (TDD) to lock behavior before implementation.

**Tech Stack:** TypeScript, Electron main-process services, Vitest unit/integration tests, Prisma-backed task/session metadata.

---

### Task 1: Route primary agentCode to workforce

**Files:**
- Modify: `src/main/services/router/smart-router.ts:136-177`
- Test: `tests/unit/services/router/smart-router.test.ts:133-148`
- Reference: `docs/plans/2026-02-24-agent-routing-alignment-design.md`

**Step 1: Write the failing test**

```ts
it('should route primary agentCode through workforce even when delegate rules match', async () => {
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
  await router.route('分析该模块', {
    sessionId: 'session-1',
    agentCode: 'qianliyan'
  })

  expect(mockDelegateEngine.delegateTask).toHaveBeenCalledWith(
    expect.objectContaining({ subagent_type: 'qianliyan' })
  )
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest tests/unit/services/router/smart-router.test.ts -t "should route primary agentCode through workforce" --run`
Expected: FAIL because current logic routes any `context.agentCode` to `delegate`.

**Step 3: Write minimal implementation**

```ts
const PRIMARY_AGENT_CODES = new Set(['fuxi', 'haotian', 'kuafu'])

if (context?.agentCode?.trim()) {
  const normalizedAgentCode = context.agentCode.trim().toLowerCase()

  if (PRIMARY_AGENT_CODES.has(normalizedAgentCode)) {
    rationale.push('primary agentCode must route through workforce orchestration')
    return {
      strategy: 'workforce',
      category: 'dayu',
      complexityScore: 0.7,
      rationale
    }
  }

  rationale.push('subagent agentCode requires delegate route')
  return {
    strategy: 'delegate',
    subagent: context.agentCode.trim(),
    complexityScore: 0.55,
    rationale
  }
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest tests/unit/services/router/smart-router.test.ts --run`
Expected: PASS with updated primary/subagent route behavior.

**Step 5: Commit**

```bash
git add tests/unit/services/router/smart-router.test.ts src/main/services/router/smart-router.ts
git commit -m "fix(router): send primary agents through workforce orchestration"
```

---

### Task 2: Enforce haotian-only checkpoint + dual-prefix plan path parsing

**Files:**
- Modify: `src/main/services/workforce/workforce-engine.ts:1897-2007,2718-2720,3016-3051`
- Test: `tests/unit/services/workforce/workforce-engine.test.ts:1063-1439`

**Step 1: Write the failing test**

```ts
it('should parse .fuxi and legacy .sisyphus plan paths from input', async () => {
  vi.spyOn(fs, 'existsSync').mockImplementation(p =>
    String(p).includes('.fuxi/plans/new-plan.md') || String(p).includes('.sisyphus/plans/old-plan.md')
  )
  vi.spyOn(fs, 'readFileSync').mockReturnValue('- [ ] Task 1: 实现接口')

  await workforceEngine.executeWorkflow('执行计划 .fuxi/plans/new-plan.md', 'test-session-123', {
    agentCode: 'kuafu'
  })

  await workforceEngine.executeWorkflow('执行计划 .sisyphus/plans/old-plan.md', 'test-session-123', {
    agentCode: 'kuafu'
  })

  expect(mockWorkerDispatcher.dispatch).toHaveBeenCalledTimes(2)
})

it('should only require orchestrator checkpoint for haotian', async () => {
  mockAdapter.sendMessage.mockResolvedValueOnce({
    content: JSON.stringify({ subtasks: [{ id: 't1', description: 'Do work', dependencies: [] }] })
  })

  await workforceEngine.executeWorkflow('Run flow', 'test-session-123', {
    agentCode: 'fuxi',
    enableRetry: false
  })

  const checkpointCalls = mockWorkerDispatcher.dispatch.mock.calls
    .map(call => call[0])
    .filter(input => input.metadata?.orchestrationCheckpoint)

  expect(checkpointCalls).toHaveLength(0)
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest tests/unit/services/workforce/workforce-engine.test.ts -t "should parse .fuxi and legacy .sisyphus" --run`
Expected: FAIL because parser currently matches only `.sisyphus/plans/*.md`.

Run: `pnpm vitest tests/unit/services/workforce/workforce-engine.test.ts -t "should only require orchestrator checkpoint for haotian" --run`
Expected: FAIL because checkpoint currently applies to any primary orchestrator.

**Step 3: Write minimal implementation**

```ts
private extractPlanPathFromInput(input: string): string | undefined {
  const match = input.match(
    /(?:[A-Za-z]:)?[^\s"'`]*(?:\.fuxi|\.sisyphus)[\\/]+plans[\\/]+[^\s"'`<>]+\.md/i
  )
  return match?.[0]
}

private shouldRequireOrchestratorCheckpoint(agentCode?: string): boolean {
  return (agentCode || '').trim().toLowerCase() === 'haotian'
}

// In runOrchestratorCheckpoint dispatch payload
subagent_type: 'haotian'
```

Also update user-facing missing-plan message to prefer `.fuxi` and mention legacy compatibility:

```ts
'未找到可执行计划文件。请先让伏羲生成计划，或手动指定路径：执行计划 .fuxi/plans/<plan>.md（兼容 .sisyphus/plans/<plan>.md）'
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest tests/unit/services/workforce/workforce-engine.test.ts --run`
Expected: PASS including `.fuxi`/`.sisyphus` compatibility and checkpoint owner behavior.

**Step 5: Commit**

```bash
git add tests/unit/services/workforce/workforce-engine.test.ts src/main/services/workforce/workforce-engine.ts
git commit -m "fix(workforce): enforce haotian checkpoints and .fuxi plan path support"
```

---

### Task 3: Add FuXi runtime planning-only hard guard

**Files:**
- Modify: `src/main/services/delegate/delegate-engine.ts:231-436`
- Test: `tests/unit/services/delegate/delegate-engine.test.ts:466-536` (extend)

**Step 1: Write the failing test**

```ts
it('should reject fuxi execution-stage request even when strict role mode is off', async () => {
  const result = await delegateEngine.delegateTask({
    description: '实现支付链路并修改后端代码',
    prompt: '请直接实现并提交代码',
    subagent_type: 'fuxi',
    sessionId: 'test-session-123',
    metadata: {
      workflowStage: 'execution'
    }
  })

  expect(result.success).toBe(false)
  expect(result.output).toContain('FuXi is planning-only')
  expect(result.output).toContain('handoff')
})

it('should allow fuxi planning-stage request', async () => {
  const result = await delegateEngine.delegateTask({
    description: '为支付链路生成执行计划',
    prompt: '输出计划文件到 .fuxi/plans/payment.md',
    subagent_type: 'fuxi',
    sessionId: 'test-session-123',
    metadata: {
      workflowStage: 'plan'
    }
  })

  expect(result.success).toBe(true)
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest tests/unit/services/delegate/delegate-engine.test.ts -t "should reject fuxi execution-stage request" --run`
Expected: FAIL because current hard guard only depends on strict role mode.

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

Run: `pnpm vitest tests/unit/services/delegate/delegate-engine.test.ts --run`
Expected: PASS with runtime planning-only rejection independent of strict mode toggle.

**Step 5: Commit**

```bash
git add tests/unit/services/delegate/delegate-engine.test.ts src/main/services/delegate/delegate-engine.ts
git commit -m "fix(delegate): hard-enforce fuxi planning-only runtime guard"
```

---

### Task 4: Migrate FuXi prompt and message IPC plan path extraction to `.fuxi/*`

**Files:**
- Modify: `src/main/services/delegate/prompts/fuxi.ts:34-37`
- Modify: `src/main/ipc/handlers/message.ts:58-69,381-437`
- Test: `tests/integration/chat-ipc.test.ts:574-599` (update assertions)

**Step 1: Write the failing test**

```ts
test('fuxi handoff should capture .fuxi plan path and expose kuafu handoff metadata', async () => {
  // mock stream output includes: 计划路径: .fuxi/plans/codeall-repair.md
  // ... existing setup ...

  expect(result.content).toContain('执行计划')
  expect((result.metadata as any)?.handoffToAgent).toBe('kuafu')
  expect((result.metadata as any)?.planPath).toContain('.fuxi/plans/codeall-repair.md')
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest tests/integration/chat-ipc.test.ts -t "fuxi handoff should capture .fuxi plan path" --run`
Expected: FAIL because regex currently only matches `.sisyphus/plans/*.md`.

**Step 3: Write minimal implementation**

```ts
// message.ts
function extractPlanPath(content: string): string | undefined {
  const match = content.match(
    /(?:[A-Za-z]:)?[^\s"'`]*(?:\.fuxi|\.sisyphus)[\\/]+plans[\\/]+[^\s"'`<>]+\.md/i
  )
  return match?.[0]
}
```

```ts
// fuxi.ts prompt constraints
- 计划文件仅允许: .fuxi/plans/{plan-name}.md
- 草稿文件仅允许: .fuxi/drafts/{name}.md
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest tests/integration/chat-ipc.test.ts --run`
Expected: PASS with `.fuxi` detection and preserved handoff metadata.

**Step 5: Commit**

```bash
git add tests/integration/chat-ipc.test.ts src/main/ipc/handlers/message.ts src/main/services/delegate/prompts/fuxi.ts
git commit -m "fix(fuxi): switch prompt and IPC plan path detection to .fuxi defaults"
```

---

### Task 5: Move default plan storage to `.fuxi/plans` with legacy read compatibility

**Files:**
- Modify: `src/main/services/boulder-state.service.ts:30-31,150-156`
- Modify: `src/main/services/plan-file.service.ts:25-55,38-77`
- Test: `tests/unit/services/boulder-state.test.ts:193-227`
- Test: `tests/unit/services/plan-file.test.ts:51-68`

**Step 1: Write the failing test**

```ts
it('should create default boulder state under .fuxi/plans', async () => {
  vi.mocked(fs.existsSync).mockReturnValue(false)

  const service = BoulderStateService.getInstance()
  const state = await service.getState()

  expect(state.active_plan).toContain('.fuxi/plans/')
})

it('should list plans from .fuxi/plans and legacy .sisyphus/plans', async () => {
  // mock readdir for both folders, expect merged unique list
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest tests/unit/services/boulder-state.test.ts -t "default boulder state under .fuxi/plans" --run`
Expected: FAIL because default is `.sisyphus/plans`.

Run: `pnpm vitest tests/unit/services/plan-file.test.ts -t "list plans from .fuxi/plans and legacy" --run`
Expected: FAIL because service currently reads only `.sisyphus/plans`.

**Step 3: Write minimal implementation**

```ts
// boulder-state.service.ts
this.boulderPath = path.join(process.cwd(), '.fuxi', 'boulder.json')
const defaultPlanPath = path.join(process.cwd(), '.fuxi', 'plans', `${defaultPlanName}.md`)
```

```ts
// plan-file.service.ts
private readonly primaryPlansDir = path.join(process.cwd(), '.fuxi', 'plans')
private readonly legacyPlansDir = path.join(process.cwd(), '.sisyphus', 'plans')

async listPlans(): Promise<string[]> {
  const names = new Set<string>()
  for (const dir of [this.primaryPlansDir, this.legacyPlansDir]) {
    if (!fs.existsSync(dir)) continue
    for (const file of fs.readdirSync(dir)) {
      if (file.endsWith('.md')) names.add(file.replace('.md', ''))
    }
  }
  return Array.from(names)
}
```

(Keep `getPlanPath` defaulting to `.fuxi/plans/<plan>.md`; for read, fallback to legacy path if primary not found.)

**Step 4: Run test to verify it passes**

Run: `pnpm vitest tests/unit/services/boulder-state.test.ts tests/unit/services/plan-file.test.ts --run`
Expected: PASS for new defaults and legacy compatibility reads.

**Step 5: Commit**

```bash
git add tests/unit/services/boulder-state.test.ts tests/unit/services/plan-file.test.ts src/main/services/boulder-state.service.ts src/main/services/plan-file.service.ts
git commit -m "feat(plan-storage): default to .fuxi with legacy .sisyphus read fallback"
```

---

### Task 6: Update workforce regression tests for `.fuxi` first and `.sisyphus` compatibility

**Files:**
- Modify: `tests/unit/services/workforce/workforce-engine.test.ts:1073-1439`

**Step 1: Write the failing test**

```ts
it('should prefer .fuxi plan path in user-facing examples while still executing .sisyphus paths', async () => {
  await expect(
    workforceEngine.executeWorkflow('执行计划', 'test-session-123', { agentCode: 'kuafu' })
  ).rejects.toThrow('.fuxi/plans')

  vi.spyOn(fs, 'existsSync').mockImplementation(p => String(p).includes('.sisyphus/plans/compat.md'))
  vi.spyOn(fs, 'readFileSync').mockReturnValue('- [ ] Task 1: 兼容执行')

  await workforceEngine.executeWorkflow('执行计划 .sisyphus/plans/compat.md', 'test-session-123', {
    agentCode: 'kuafu'
  })

  expect(mockWorkerDispatcher.dispatch).toHaveBeenCalledWith(
    expect.objectContaining({ description: 'Task 1: 兼容执行' })
  )
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest tests/unit/services/workforce/workforce-engine.test.ts -t "prefer .fuxi plan path" --run`
Expected: FAIL before message and path handling updates.

**Step 3: Write minimal implementation**

```ts
// adjust existing tests to .fuxi default strings
// keep explicit compatibility tests that use .sisyphus paths and still pass
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest tests/unit/services/workforce/workforce-engine.test.ts --run`
Expected: PASS with both modern and compatibility scenarios.

**Step 5: Commit**

```bash
git add tests/unit/services/workforce/workforce-engine.test.ts
git commit -m "test(workforce): align plan path assertions to .fuxi with .sisyphus compatibility"
```

---

### Task 7: Full verification and final integration check

**Files:**
- Verify only (no new file required)
- Reference design: `docs/plans/2026-02-24-agent-routing-alignment-design.md`
- Reference implementation plan: `docs/plans/2026-02-24-agent-routing-alignment-implementation.md`

**Step 1: Run focused test suites**

Run:
- `pnpm vitest tests/unit/services/router/smart-router.test.ts --run`
- `pnpm vitest tests/unit/services/delegate/delegate-engine.test.ts --run`
- `pnpm vitest tests/unit/services/workforce/workforce-engine.test.ts --run`
- `pnpm vitest tests/integration/workforce-engine.test.ts --run`
- `pnpm vitest tests/integration/chat-ipc.test.ts --run`

Expected: PASS for all suites with no new regressions.

**Step 2: Run consolidated project tests**

Run: `pnpm test`
Expected: PASS (or failures unrelated to this change scope only; if unrelated, document and stop).

**Step 3: Spec-compliance checklist**

```md
- [ ] primary agentCode routes to workforce
- [ ] execution remains category-first
- [ ] checkpoint owner constrained to haotian
- [ ] fuxi runtime blocks execution-stage / implementation-intent requests
- [ ] default plan paths are .fuxi/plans + .fuxi/drafts
- [ ] legacy .sisyphus/plans reads still execute
```

**Step 4: Commit final adjustments (if any)**

```bash
git add src/main/services/router/smart-router.ts src/main/services/workforce/workforce-engine.ts src/main/services/delegate/delegate-engine.ts src/main/services/delegate/prompts/fuxi.ts src/main/ipc/handlers/message.ts src/main/services/boulder-state.service.ts src/main/services/plan-file.service.ts tests/unit/services/router/smart-router.test.ts tests/unit/services/delegate/delegate-engine.test.ts tests/unit/services/workforce/workforce-engine.test.ts tests/unit/services/boulder-state.test.ts tests/unit/services/plan-file.test.ts tests/integration/workforce-engine.test.ts tests/integration/chat-ipc.test.ts
git commit -m "feat(alignment): enforce primary routing, fuxi planning guard, and .fuxi plan defaults"
```

**Step 5: Pre-merge review skill handoff**

Use `@superpowers:requesting-code-review` for final review before merge/PR.

---

## Execution Notes

- Use `@superpowers:test-driven-development` for each task (write failing test first, then minimal code).
- Use `@superpowers:verification-before-completion` before claiming completion.
- Keep commits scoped to one task each; do not batch unrelated changes.
- Do not expand scope beyond the design doc.
