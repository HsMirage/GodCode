## Learnings
- IPC handler registration follows ping handler pattern in src/main/ipc/index.ts.

- 2026-01-28: Added Winston logger service with dev console logs and production daily-rotated files
- 2026-01-28: Log path uses app.getPath('userData')/logs with 14-day retention
- 2026-01-28: Main process logs added for app start, db init, window creation, and quit
 - TypeScript path alias @/* is required for @/ imports; tsc passes but LSP diagnostics tool still reports unresolved aliases.
- 2026-01-28: Anthropic adapter uses @anthropic-ai/sdk messages API with retry/backoff and 30s abort timeout
- 2026-01-28: Added LLM adapter factory for anthropic provider; unsupported providers throw an error.
