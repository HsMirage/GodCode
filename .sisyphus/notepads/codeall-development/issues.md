## E2E Testing Blockers (Confirmed 2026-01-29)

- **Status**: CRITICAL - All E2E tests failing.
- **Error 1**: `tests/e2e/mvp3.spec.ts` -> "Process failed to launch!". This confirms the missing system dependencies (likely `libnss3`, `libatk`, etc.) in the environment.
- **Error 2**: `tests/e2e/mvp1.spec.ts` -> "ReferenceError: \_\_dirname is not defined". Legacy tests need update to ESM patterns.
- **Action Taken**: Created `tests/e2e/final-acceptance.spec.ts` as a STUB (skipped) to document the blocker and required user journey.
- **Next Steps**:
  1. Install system dependencies in environment.
  2. Refactor `mvp1.spec.ts` to use `fileURLToPath(import.meta.url)`.
  3. Re-run `pnpm test:e2e` only after environment fix.
