# 2026-02-25 Model Selection & Protocol Fix Design

## 1. Background and Problem Statement

This design implements a **phased remediation strategy** for `彻底修复清单.md`, with an initial focus on stabilizing production behavior and eliminating current user-facing failures.

Selected execution strategy:
- **Phase 1 (this change): A + B + C + F**
- **Phase 2 (follow-up governance): D + E**

Primary issues to eliminate in Phase 1:
1. Model selection inconsistencies across runtime paths (potential precheck/send mismatch risk)
2. Incorrect fallback behavior when bindings are enabled but `modelId` is empty
3. Occasional protocol drift to legacy OpenAI-compatible endpoint behavior
4. Missing regression coverage for the above failure modes

## 2. Scope and Goals (Phase 1)

### 2.1 Included

- **A. Single source of truth for runtime model selection**
  - Runtime model selection must use `ModelSelectionService.resolveModelSelection(...)` consistently.
- **B. Correct fallback behavior + legacy resolver de-risking**
  - `enabled=true` with empty `modelId` must continue to system default fallback.
  - Invalid binding references (`modelId` points to missing model) must fail fast with `MODEL_NOT_FOUND`.
  - Remove runtime influence of legacy resolver chain.
- **C. Protocol enforcement + migration**
  - New OpenAI-compatible/custom/Azure/OpenAI model defaults to `responses`.
  - Protocol normalization changes from permissive fallback to strict validation.
  - Startup migration backfills missing `config.apiProtocol` for target providers.
- **F. Regression tests**
  - Unit + integration/E2E test coverage for all above scenarios.

### 2.2 Excluded (Phase 2)

- D: full removal of model literals from agent/category definitions and all runtime governance layers
- E: broader schema/metadata evolution (`contextWindow`, `maxOutputTokens`, capabilities, etc.)

## 3. Current-State Findings (Context)

Observed key runtime call sites already using model selection service:
- `src/main/ipc/handlers/message.ts:170`
- `src/main/services/delegate/delegate-engine.ts:269`
- `src/main/services/llm/multimodal-looker.service.ts:154`
- `src/main/services/workforce/workforce-engine.ts:2463`

Observed protocol default/fallback behavior requiring change:
- `src/renderer/src/components/settings/ProviderModelPanel.tsx:42-44`
- `src/renderer/src/components/settings/ProviderModelPanel.tsx:67-72`
- `src/renderer/src/components/settings/ProviderModelPanel.tsx:158`
- `src/renderer/src/components/settings/ProviderModelPanel.tsx:209`

Observed runtime hardcoded model literal still present (Phase 2 governance concern):
- `src/main/services/workforce/workforce-engine.ts:309-313`

## 4. Design

### 4.1 Model Selection Path Unification (A + B)

#### Architectural rule
All runtime model decisions flow through:
- `ModelSelectionService.resolveModelSelection(...)`

#### Behavioral contract
1. Override model spec (if provided) takes top priority.
2. Agent binding (if enabled and valid).
3. Category binding (if enabled and valid).
4. System default model.
5. Otherwise fail with `MODEL_NOT_CONFIGURED`.

#### Binding semantics
- `enabled=true && modelId=null` => return `null` from binding resolver and continue fallback.
- `enabled=true && modelId set but model missing` => throw `MODEL_NOT_FOUND`.

#### Service boundary
- `BindingService` retains CRUD-only responsibilities.
- Any runtime selection/precheck behavior must not be reintroduced into `BindingService`.

### 4.2 Protocol Strictness and Safe Defaults (C1)

#### UI defaults
In `ProviderModelPanel`, default model protocol values for create flows switch to:
- `apiProtocol: 'responses'`

#### Validation behavior
`normalizeApiProtocol` becomes strict:
- Allowed values: `responses`, `chat/completions`
- Any invalid value must surface an explicit validation error, not silently coerce to `chat/completions`.

#### Backend contract
Backend protocol checks remain strict in model selection and execution paths; invalid/missing protocol for required providers remains a hard error.

### 4.3 Startup Migration for Existing Data (C2)

#### Migration target
Providers in:
- `openai`, `openai-compatible`, `openai-compat`, `custom`, `azure-openai`, `azure`

#### Migration action
For models where `config.apiProtocol` is missing/empty:
- set `apiProtocol = 'responses'`

#### Operational requirements
- Idempotent (safe to run repeatedly)
- Observable (log count and scope)
- Fail-visible (clear error logging)

## 5. Error Handling Policy

- **Fallback allowed** only when binding is enabled but no model is selected.
- **Hard failure required** for dangling binding references and invalid protocol values.
- **No silent downgrade** from invalid protocol to legacy behavior.

## 6. Test Strategy (F)

### 6.1 Unit tests
- `tests/unit/services/llm/model-selection.service.test.ts`
  - enabled binding + empty `modelId` => falls back to system default
  - dangling `modelId` => `MODEL_NOT_FOUND`
- `tests/unit/services/llm/openai.adapter.test.ts`
  - openai-compatible default/protocol behavior aligned with strict contract
  - migrated models with previously missing protocol can send successfully

### 6.2 Integration / E2E
- `tests/e2e/settings.spec.ts`
  - creating OpenAI-compatible model defaults protocol to `responses`
- `tests/integration/*message*`, `tests/integration/*workforce*`
  - only system default configured => stable send success
  - repeated requests do not regress into legacy protocol path

## 7. Acceptance Mapping

### A acceptance
- Runtime selection invokes only `resolveModelSelection(...)`.
- No precheck/send model-source divergence.

### B acceptance
- System-default fallback works for enabled binding with empty `modelId`.
- `MODEL_NOT_FOUND` remains for dangling bound IDs.
- Runtime no longer depends on legacy resolver path.

### C acceptance
- New models default to `responses`.
- Existing models missing protocol are backfilled on startup.
- Legacy protocol error no longer appears under normal data integrity.

### F acceptance
- Unit/integration/E2E cases above are implemented and passing.

## 8. Definition of Done for Phase 1

Phase 1 is complete only when all are true:
1. Both reported error classes are consistently eliminated in regression coverage.
2. Runtime model-selection path is unified and verifiable.
3. New and migrated protocol behavior is deterministic and controlled.
4. Test suites covering A/B/C/F pass.

## 9. Follow-up (Phase 2)

After Phase 1 stabilization, execute D+E governance work:
- remove model literals from definitions/runtime policy layers
- move runtime policy decisions to model metadata-driven configuration
