# Learnings - 2026-02-02

## README.md Alignment

- **Web Server Mode**: Verified missing `start:web` script in `package.json`. Updated README to mark it as **Planned**.
- **Workflow Visualization**: Confirmed `WorkflowView.tsx` exists and is imported in `ChatPage.tsx`. Updated README to mention toggle in Chat interface.
- **Updater Config**: Verified `electron-builder.yml` uses `CODEALL_UPDATE_URL`. Added "Deployment & Updates" section to README.

## Electron E2E Test Fix

- **Issue**: `Process failed to launch!` when running `pnpm test:e2e` in WSL2.
- **Root Cause**: WSL2 networking isolation. Electron.exe runs in Windows and binds to Windows localhost (127.0.0.1). Playwright in WSL tries to connect to WSL's localhost, which is a different network namespace. WebSocket connection fails with ECONNREFUSED.
- **Fix**: Added WSL detection in `tests/e2e/fixtures/electron.ts`. Tests gracefully skip with informative message when running in WSL.
- **Verification**: Run E2E tests from Windows PowerShell: `pnpm test:e2e`

## E2E Testing & LLM Mocking

- **CODEALL_E2E_TEST Flag**: Defined in `tests/e2e/fixtures/electron.ts` but **completely unused** in the application source code (`src/`).
- **No Built-in Mocking**: The application currently has no mechanism to switch to a "Mock LLM Adapter" based on environment variables.
- **E2E Behavior**: Existing E2E tests (`tests/e2e/chat-workflow.spec.ts`) appear to rely on real API calls (60s timeout), which is flaky and costly.
- **Recommendation**: Implement a `MockAdapter` in `src/main/services/llm/mock.adapter.ts` and update `factory.ts` to use it when `process.env.CODEALL_E2E_TEST` is set.

## MockLLMAdapter Implementation

- **Created**: `src/main/services/llm/mock.adapter.ts` implementing `LLMAdapter` interface
- **Features**:
  - Deterministic canned responses based on user message keywords (hello/hi, help, error)
  - Tool execution demo: messages containing "tool:" trigger `file_list` tool via `ToolExecutionService`
  - `streamMessage` yields word-by-word for streaming simulation
- **Tool Registration**: Side-effect import of `@/main/services/tools` registers builtin tools
- **Context**: Uses `ToolExecutionContext` with `workspaceDir: process.cwd()`, `sessionId: 'mock-session'`
- **Next Step**: Integrate into `factory.ts` to activate via `CODEALL_E2E_TEST` env variable

## Chat IPC Integration Tests

- **Created**: `tests/integration/chat-ipc.test.ts` exercising `handleMessageSend` with `CODEALL_E2E_TEST=1`
- **Test 1**: Normal message → assistant response contains "Mock Response"
- **Test 2**: Message with "tool:" → response includes "Tool Execution Result"
- **Approach**:
  - Mock Electron, child_process, fs, Prisma with in-memory store
  - Mock SmartRouter to return 'direct' strategy
  - Create fake `IpcMainInvokeEvent` with mocked `event.sender.send`
  - Capture `message:stream-chunk` calls to verify streaming behavior
- **Key Pattern**: Dynamic import of `handleMessageSend` AFTER mocks are set up to ensure mock wiring
