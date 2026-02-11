## 2026-02-11 Initial Decisions

- Agent-to-Strategy mapping: fuxi/luban → direct-enhanced, haotian/kuafu → workforce
- Hook system: hardcoded built-in hooks only, no plugin system
- Event bridge: debounce 100ms, session-scoped BrowserWindow targeting
- Security: path validation + audit logging, no process-level sandbox
