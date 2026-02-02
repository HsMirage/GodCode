## [2026-02-01T19:20:00Z] Blocker: Task 9 ArtifactRail wiring

- Tried 3 times with session ses_3e55984c8ffex8QZS97RWPT8Nd to change MainLayout import from ./ArtifactRail to ../artifact/ArtifactRail.
- No file changes produced; MainLayout still imports stub.
- Needs manual intervention or different agent session to update import.

## [2026-02-02T12:31:30Z] Blocker: Playwright E2E Electron launch failure

- Command: `pnpm build && pnpm test:e2e tests/e2e/chat-workflow.spec.ts`
- Error: `Process failed to launch!` when Playwright tries to launch Electron from `out/main/index.js`
- Impact: All Electron E2E tests fail at launch (not test-specific)
- Next step: Investigate Electron launch requirements in this environment (missing deps, sandbox flags, or Playwright/Electron config)

## [2026-02-02T13:11:45Z] Blocker: E2E requires xvfb-run / WSL skip

- `pnpm test:e2e tests/e2e/chat-workflow.spec.ts` now skips in WSL by design
- `xvfb-run` not installed in this environment (`xvfb-run: command not found`)
- Without xvfb, Electron E2E cannot run in this Linux shell
- Attempted `apt-get update` to install xvfb but lacked permissions (could not open /var/lib/apt/lists/lock)

## [2026-02-02T13:16:20Z] Blocker: No mock LLM mode for E2E/QA

- `CODEALL_E2E_TEST` is set in E2E fixture but unused in application code
- No mock adapter switch in `src/main/services/llm/factory.ts`
- E2E chat tests depend on real LLM responses or external setup

## [2026-02-02T13:17:10Z] Blocker: Chat send/stream QA not verifiable here

- Cannot run Electron UI in this environment (WSL skip + missing xvfb)
- No mock LLM mode in app → cannot validate chat send/streaming/tool calls without real APIs

## [2026-02-02T12:57:45Z] Blocker: pnpm test integration failures (Gemini)

- Command: `pnpm test`
- Failures:
  - `tests/integration/llm-providers.test.ts` (2 failed)
  - `tests/integration/llm-adapters.test.ts` (2 failed)
- Error pattern: Expected Gemini responses are empty (`''` vs expected 'Hello from Gemini')
- Impact: DoD item “pnpm test 所有测试通过” cannot be marked complete
