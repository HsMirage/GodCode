## Context

Luban completion output currently mixes user-facing summaries with transport/debug fragments (for example `assistant to=functions.bash` markers and embedded tool-call JSON blocks). The issue appears in orchestration/integration paths that consume delegate output and in UI surfaces that render final completion text. At the same time, raw execution data is still valuable for run logs, observability, and recovery diagnostics.

Constraints:
- Keep validation evidence (typecheck/build/test outcomes) available for workflow telemetry.
- Avoid breaking existing orchestration contracts and role/stage semantics.
- Ensure multilingual text is preserved while removing protocol artifacts.

## Goals / Non-Goals

**Goals:**
- Define a stable sanitization boundary between execution internals and user-visible completion text.
- Preserve raw output for telemetry while producing deterministic, clean presentation output.
- Standardize completion rendering behavior across workflow result surfaces.
- Add regression coverage for known garbled-output patterns.

**Non-Goals:**
- Redesign the delegate/tool execution protocol.
- Change task decomposition, scheduling, or retry policy semantics.
- Backfill or rewrite historical stored messages.

## Decisions

1. **Introduce canonical completion-output sanitization before user presentation**
   - **Decision:** Add a single sanitization step in main-process completion/integration output assembly, and require user-facing summary paths to consume sanitized text.
   - **Rationale:** Centralization prevents divergence across renderer views and avoids relying on prompt discipline alone.
   - **Alternatives considered:**
     - Prompt-only fixes in agent prompts (rejected: brittle, model-dependent).
     - Renderer-only filtering (rejected: duplicates logic, can miss non-renderer consumers).

2. **Maintain dual-channel output semantics (raw vs sanitized)**
   - **Decision:** Keep raw delegate/tool output in run logs/observability; produce sanitized output for chat/workflow completion summaries.
   - **Rationale:** Preserves forensic/debug value while protecting UX.
   - **Alternatives considered:**
     - Overwrite raw output with sanitized text (rejected: loses diagnostics).
     - Expose only raw output everywhere (rejected: repeats current UX problem).

3. **Use deterministic artifact-stripping rules for protocol wrappers**
   - **Decision:** Strip known transport artifacts (tool-call wrappers, structured tool payload prefixes, escaped command envelopes) while preserving meaningful narrative text and validation statements.
   - **Rationale:** Deterministic rules reduce nondeterminism and avoid ad hoc per-view cleanup.
   - **Alternatives considered:**
     - LLM post-processing for cleanup (rejected: nondeterministic and costlier).
     - Aggressive blanket filtering (rejected: high risk of dropping legitimate content).

4. **Add focused regression tests at orchestration and rendering boundaries**
   - **Decision:** Add tests that feed representative garbled payloads and assert clean summary output plus preserved telemetry evidence.
   - **Rationale:** Prevents recurrence and protects both UX and observability behavior.
   - **Alternatives considered:**
     - Manual verification only (rejected: not durable).

## Risks / Trade-offs

- **[Risk] False-positive stripping removes legitimate content** → **Mitigation:** Match only explicit protocol/tool-wrapper patterns and keep conservative rules with fixture-based tests.
- **[Risk] False negatives for new wrapper formats** → **Mitigation:** Centralize sanitizer rules for easy extension and add regression cases when new patterns appear.
- **[Risk] Inconsistent adoption across output surfaces** → **Mitigation:** Route all completion summary generation through the same sanitization boundary and verify with integration tests.

## Migration Plan

- Implement as a non-breaking behavior change for newly produced completion outputs.
- Keep existing storage/log schemas; add fields only if required to distinguish sanitized vs raw output in-memory contracts.
- Validate in test suites that telemetry keeps raw detail while UI-bound output is sanitized.
- Rollback strategy: disable/bypass sanitization step and revert to prior presentation path if critical regressions are discovered.

## Open Questions

- Should any sanitized-output marker be exposed in telemetry for easier troubleshooting?
- Should the system annotate summaries when large tool payload blocks were removed?
- Should the same sanitizer be reused for other agent types beyond Luban immediately, or gated by workflow role/category?