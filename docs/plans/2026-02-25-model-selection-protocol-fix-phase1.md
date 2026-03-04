# Model Selection & Protocol Phase 1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate model-selection/protocol regressions by landing Phase 1 (A+B+C+F): single runtime model-selection path, correct binding fallback semantics, strict protocol defaults/validation, startup migration for legacy model data, and regression tests.

**Architecture:** Keep runtime selection centralized in `ModelSelectionService.resolveModelSelection(...)`, enforce protocol correctness at both renderer and runtime boundaries, and migrate persisted model configs during startup so old records become deterministic. Validate with TDD-style focused unit/integration/E2E tests before broader suite checks.

**Tech Stack:** Electron, TypeScript, React, Prisma (PostgreSQL), Vitest, Playwright, pnpm.

---

### Task 1: Isolated workspace baseline

**Files:**
- Modify: `.worktrees/` (new worktree directory)
- Test: baseline targeted tests only

**Step 1: Create worktree branch**

```bash
git -C "/Users/mirage/AI/AiWork/CodeAll" worktree add "/Users/mirage/AI/AiWork/CodeAll/.worktrees/model-selection-protocol-phase1" -b "fix/model-selection-protocol-phase1"
```

**Step 2: Install dependencies in worktree**

```bash
pnpm -C "/Users/mirage/AI/AiWork/CodeAll/.worktrees/model-selection-protocol-phase1" install
```

**Step 3: Verify baseline on focused files**

Run:
```bash
pnpm -C "/Users/mirage/AI/AiWork/CodeAll/.worktrees/model-selection-protocol-phase1" vitest run tests/unit/services/llm/openai.adapter.test.ts
```
Expected: PASS (or existing known failures are documented before changes)

**Step 4: Commit (worktree setup not committed unless files changed)**

```bash
git -C "/Users/mirage/AI/AiWork/CodeAll/.worktrees/model-selection-protocol-phase1" status
```

---

### Task 2: Add failing tests for model-selection fallback semantics (B1)

**Files:**
- Create: `tests/unit/services/llm/model-selection.service.test.ts`
- Modify: `src/main/services/llm/model-selection.service.ts` (only if needed to satisfy tests)
- Test: `tests/unit/services/llm/model-selection.service.test.ts`

**Step 1: Write the failing tests**

```ts
it('falls back to system default when agent binding enabled but modelId is empty', async () => {
  // arrange: agent binding enabled + modelId null, system default configured
  // expect: source === 'system-default'
})

it('throws MODEL_NOT_FOUND when binding modelId points to missing model', async () => {
  // arrange: enabled binding with dangling modelId
  // expect: throw /MODEL_NOT_FOUND/
})
```

**Step 2: Run test to verify it fails**

Run:
```bash
pnpm -C "/Users/mirage/AI/AiWork/CodeAll/.worktrees/model-selection-protocol-phase1" vitest run tests/unit/services/llm/model-selection.service.test.ts
```
Expected: FAIL initially (new test or behavior mismatch)

**Step 3: Write minimal implementation (if needed)**

```ts
if (!binding.model) {
  return null
}

if (binding.modelId && !binding.model) {
  throw new Error('MODEL_NOT_FOUND: ...')
}
```

**Step 4: Run test to verify it passes**

Run:
```bash
pnpm -C "/Users/mirage/AI/AiWork/CodeAll/.worktrees/model-selection-protocol-phase1" vitest run tests/unit/services/llm/model-selection.service.test.ts
```
Expected: PASS

**Step 5: Commit**

```bash
git -C "/Users/mirage/AI/AiWork/CodeAll/.worktrees/model-selection-protocol-phase1" add tests/unit/services/llm/model-selection.service.test.ts src/main/services/llm/model-selection.service.ts
git -C "/Users/mirage/AI/AiWork/CodeAll/.worktrees/model-selection-protocol-phase1" commit -m "test(llm): lock binding fallback semantics in model selection"
```

---

### Task 3: Enforce protocol defaults + strict validation in settings UI (C1)

**Files:**
- Modify: `src/renderer/src/components/settings/ProviderModelPanel.tsx`
- Create: `tests/unit/renderer/provider-model-panel.protocol.test.tsx`
- Test: `tests/unit/renderer/provider-model-panel.protocol.test.tsx`

**Step 1: Write failing tests**

```tsx
it('defaults apiProtocol to responses for new model forms', () => {
  // expect default form value === 'responses'
})

it('rejects invalid apiProtocol values instead of silently coercing', () => {
  // expect explicit validation error path
})
```

**Step 2: Run tests to verify they fail**

Run:
```bash
pnpm -C "/Users/mirage/AI/AiWork/CodeAll/.worktrees/model-selection-protocol-phase1" vitest run tests/unit/renderer/provider-model-panel.protocol.test.tsx
```
Expected: FAIL

**Step 3: Implement minimal UI changes**

```ts
type ModelApiProtocol = 'chat/completions' | 'responses'

function normalizeApiProtocol(value: unknown): ModelApiProtocol {
  if (value === 'responses' || value === 'chat/completions') return value
  throw new Error('INVALID_MODEL_PROTOCOL')
}

// defaults
apiProtocol: 'responses'
```

Also update create paths so model creation payload sends:
```ts
config: { apiProtocol: 'responses' }
```

**Step 4: Re-run renderer tests**

Run:
```bash
pnpm -C "/Users/mirage/AI/AiWork/CodeAll/.worktrees/model-selection-protocol-phase1" vitest run tests/unit/renderer/provider-model-panel.protocol.test.tsx
```
Expected: PASS

**Step 5: Commit**

```bash
git -C "/Users/mirage/AI/AiWork/CodeAll/.worktrees/model-selection-protocol-phase1" add src/renderer/src/components/settings/ProviderModelPanel.tsx tests/unit/renderer/provider-model-panel.protocol.test.tsx
git -C "/Users/mirage/AI/AiWork/CodeAll/.worktrees/model-selection-protocol-phase1" commit -m "fix(settings): default openai-compatible protocol to responses and validate strictly"
```

---

### Task 4: Add startup migration to backfill missing model protocol (C2)

**Files:**
- Modify: `src/main/services/database.ts`
- Test: `tests/integration/llm-providers.test.ts` (or add focused migration integration case)

**Step 1: Write failing integration test (or extend existing)**

```ts
it('backfills missing apiProtocol to responses for openai-compatible providers on startup', async () => {
  // seed model without config.apiProtocol
  // run init path / migration helper
  // expect config.apiProtocol === 'responses'
})
```

**Step 2: Run test to verify failure**

Run:
```bash
pnpm -C "/Users/mirage/AI/AiWork/CodeAll/.worktrees/model-selection-protocol-phase1" vitest run tests/integration/llm-providers.test.ts
```
Expected: FAIL for migration case

**Step 3: Implement migration helper in database init**

```ts
async function ensureModelProtocolCompatibility(client: any): Promise<void> {
  const targetProviders = ['openai', 'openai-compatible', 'openai-compat', 'custom', 'azure-openai', 'azure']
  // find models by provider, patch missing/empty config.apiProtocol => 'responses'
  // log migrated count
}

// call during DatabaseService._doInit after schema compatibility checks
await ensureModelProtocolCompatibility(prismaClient)
```

**Step 4: Run test to verify pass**

Run:
```bash
pnpm -C "/Users/mirage/AI/AiWork/CodeAll/.worktrees/model-selection-protocol-phase1" vitest run tests/integration/llm-providers.test.ts
```
Expected: PASS

**Step 5: Commit**

```bash
git -C "/Users/mirage/AI/AiWork/CodeAll/.worktrees/model-selection-protocol-phase1" add src/main/services/database.ts tests/integration/llm-providers.test.ts
git -C "/Users/mirage/AI/AiWork/CodeAll/.worktrees/model-selection-protocol-phase1" commit -m "feat(db): migrate missing model apiProtocol to responses at startup"
```

---

### Task 5: Remove legacy resolver runtime influence + hardcoded legacy model (B2)

**Files:**
- Delete: `src/main/services/llm/model-resolver.ts`
- Delete/Modify: `tests/unit/services/llm/model-resolver.test.ts`
- Test: replacement/remaining llm tests

**Step 1: Write/adjust expectation tests first**

```ts
it('does not rely on legacy model resolver in runtime paths', () => {
  // enforce resolveModelSelection as runtime source of truth
})
```

**Step 2: Remove runtime legacy resolver file and dead tests**

```ts
// remove model-resolver exports and references (if any)
```

**Step 3: Verify string removal**

Run:
```bash
pnpm -C "/Users/mirage/AI/AiWork/CodeAll/.worktrees/model-selection-protocol-phase1" vitest run tests/unit/services/llm/openai.adapter.test.ts
```
Expected: PASS

Run:
```bash
rg -n "claude-3-5-sonnet-20241022" "/Users/mirage/AI/AiWork/CodeAll/.worktrees/model-selection-protocol-phase1/src"
```
Expected: no runtime matches

**Step 4: Commit**

```bash
git -C "/Users/mirage/AI/AiWork/CodeAll/.worktrees/model-selection-protocol-phase1" add -u src/main/services/llm/model-resolver.ts tests/unit/services/llm/model-resolver.test.ts
git -C "/Users/mirage/AI/AiWork/CodeAll/.worktrees/model-selection-protocol-phase1" commit -m "refactor(llm): remove legacy model-resolver runtime path"
```

---

### Task 6: Add regression tests for default-model-only and protocol stability (F)

**Files:**
- Modify: `tests/integration/chat-ipc.test.ts`
- Modify: `tests/integration/workforce-engine.test.ts`
- Modify: `tests/e2e/settings.spec.ts`
- Test: integration + e2e cases

**Step 1: Add failing integration tests**

```ts
it('sends successfully with only defaultModelId configured and no agent/category model binding', async () => {
  // expect success + modelSource system-default
})

it('uses responses protocol for openai-compatible model end-to-end', async () => {
  // expect no legacy chat/completions fallback when responses configured/defaulted
})
```

**Step 2: Run tests to verify failure**

Run:
```bash
pnpm -C "/Users/mirage/AI/AiWork/CodeAll/.worktrees/model-selection-protocol-phase1" vitest run tests/integration/chat-ipc.test.ts tests/integration/workforce-engine.test.ts
```
Expected: FAIL initially for new cases

**Step 3: Minimal fixes for test wiring only (if needed)**

```ts
// adjust mocks/fixtures to seed default model, empty binding modelId, and protocol config
```

**Step 4: Re-run integration + selected e2e**

Run:
```bash
pnpm -C "/Users/mirage/AI/AiWork/CodeAll/.worktrees/model-selection-protocol-phase1" vitest run tests/integration/chat-ipc.test.ts tests/integration/workforce-engine.test.ts
pnpm -C "/Users/mirage/AI/AiWork/CodeAll/.worktrees/model-selection-protocol-phase1" playwright test tests/e2e/settings.spec.ts -g "protocol"
```
Expected: PASS

**Step 5: Commit**

```bash
git -C "/Users/mirage/AI/AiWork/CodeAll/.worktrees/model-selection-protocol-phase1" add tests/integration/chat-ipc.test.ts tests/integration/workforce-engine.test.ts tests/e2e/settings.spec.ts
git -C "/Users/mirage/AI/AiWork/CodeAll/.worktrees/model-selection-protocol-phase1" commit -m "test(regression): cover default-model fallback and protocol stability"
```

---

### Task 7: End-to-end verification and completion gate

**Files:**
- Verify only (no required file changes)

**Step 1: Run focused verification suite**

Run:
```bash
pnpm -C "/Users/mirage/AI/AiWork/CodeAll/.worktrees/model-selection-protocol-phase1" vitest run \
  tests/unit/services/llm/model-selection.service.test.ts \
  tests/unit/services/llm/openai.adapter.test.ts \
  tests/unit/renderer/provider-model-panel.protocol.test.tsx \
  tests/integration/chat-ipc.test.ts \
  tests/integration/workforce-engine.test.ts \
  tests/integration/llm-providers.test.ts
```
Expected: PASS

**Step 2: Run static verification checks**

Run:
```bash
pnpm -C "/Users/mirage/AI/AiWork/CodeAll/.worktrees/model-selection-protocol-phase1" typecheck
rg -n "claude-3-5-sonnet-20241022" "/Users/mirage/AI/AiWork/CodeAll/.worktrees/model-selection-protocol-phase1/src"
```
Expected: typecheck PASS; no runtime legacy string matches

**Step 3: Final summary commit (if pending changes)**

```bash
git -C "/Users/mirage/AI/AiWork/CodeAll/.worktrees/model-selection-protocol-phase1" status
git -C "/Users/mirage/AI/AiWork/CodeAll/.worktrees/model-selection-protocol-phase1" add <remaining-files>
git -C "/Users/mirage/AI/AiWork/CodeAll/.worktrees/model-selection-protocol-phase1" commit -m "fix(llm): complete phase1 model-selection and protocol hardening"
```

---

## Scope Notes (explicitly deferred to Phase 2)

- `src/shared/agent-definitions.ts` removal of `defaultModel/fallbackModels` type/data (D1)
- `src/main/services/delegate/category-resolver.ts` removal of `defaultModel` projection (D2)
- Runtime hardcoded model-literal policy removal in concurrency/context-window strategy (D3)
- Prisma model metadata expansion (`contextWindow`, `maxOutputTokens`, `capabilities`, etc.) (E)

## Mandatory execution discipline

- Use `@superpowers:test-driven-development` before each implementation block.
- Use `@superpowers:verification-before-completion` before claiming done.
- Keep commits small and task-scoped.
