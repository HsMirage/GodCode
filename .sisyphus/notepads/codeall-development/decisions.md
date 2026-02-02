## Decisions

- Widened domain Model provider/apiKey/baseURL types to align with Prisma record shape for IPC handler interoperability.
- 2026-01-28: Added a dedicated LLM adapter factory with explicit provider checks and error for unsupported providers.
- 2026-01-28: Routed rules editing stays in renderer local state; regex compiled with default 'i' flag and order managed via HTML5 drag-and-drop.
- 2026-01-29: Added a toggleable Artifact Rail to the right side of the Chat Page to view generated artifacts alongside chat/canvas. Layout dynamically adjusts widths (50/25/25 when all open).
- 2026-01-29: **License Audit Complete** - All 5 reference projects reviewed:
  - ccg-workflow: MIT ✅
  - eigent: Apache-2.0 ✅
  - hello-halo: MIT ✅
  - moltbot: MIT ✅
  - oh-my-opencode: **SUL-1.0 (Sustainable Use License)** ⚠️ - Not standard MIT/Apache. Limited to internal business or non-commercial use. CodeAll as personal/non-commercial project is compliant.
- 2026-02-01: Configured `electron-updater` in `src/main/index.ts` with a placeholder feed URL (`https://example.com/updates`). Real URL to be configured later.
- 2026-02-01: Used `logger` service for all auto-updater events to ensure visibility in production logs.
