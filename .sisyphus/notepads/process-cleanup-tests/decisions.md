## Decisions
- Mocked `../../shared/logger` to avoid polluting test output and allow verification of log calls if needed.
- Decided to use `EventEmitter` as a base for mock processes because the service heavily relies on `process.once('exit', ...)` and `process.once('error', ...)`.
