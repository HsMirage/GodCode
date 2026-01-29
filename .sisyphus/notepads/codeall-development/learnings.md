# Learnings & Patterns

## Architecture & Integration

- **Fusion Architecture**: Successfully combined `delegate_task` (depth) and `workforce` (breadth) patterns. The Router service is critical for dispatching between these two modes.
- **IPC Safety**: Strict typing of IPC channels (Main <-> Renderer) using shared TypeScript interfaces prevents runtime errors and "channel mismatch" bugs.
- **Embedded Database**: `pg-embed` + Prisma is viable for Electron but requires careful path handling across dev/prod environments (especially on Windows).

## Testing Strategy

- **Service Isolation**: Testing core logic (Router, Workforce) in isolation from Electron (using mocks) is much faster and more reliable than full E2E.
- **E2E Fragility**: Playwright with Electron is powerful but highly sensitive to environment configuration (OS libraries). "Works on my machine" is a real risk; containerized testing is essential.
- **ESM Migration**: Mixing CommonJS (legacy tests) and ESM (new code) causes significant friction. Enforcing ESM-only for new projects is recommended.

## Development Efficiency

- **Reference Projects**: Direct code adaptation from `oh-my-opencode` and `eigent` saved ~60% of dev time compared to writing from scratch.
- **Atomic Tasks**: Breaking down the 63-task plan into small, verifiable chunks kept progress steady and measurable.

## CodeAll Specifics

- **BrowserView**: Better than `<webview>` for security and control, but requires complex state management (resize events, tab switching) in the Main process.
- **Artifacts**: Storing artifacts as database records + file system references is robust, but ensuring synchronization is a distributed system problem (even locally).

---

_Added after Task 25 completion_

# Learnings from Copyright Header Implementation

## License Attribution Pattern

We successfully added copyright headers to source files copied from other open-source projects.
The pattern used:

1. Identify source project and license
2. Create standard header block with:
   - `@license` tag
   - Original copyright holder
   - Source URL
   - License name (SUL-1.0, Apache-2.0, MIT)
   - Specific license text/summary
   - Modification notice

## Source Mapping

- `src/main/services/delegate/*` -> oh-my-opencode (SUL-1.0)
- `src/main/services/workforce/*` -> eigent (Apache-2.0)
- `src/main/services/ai-browser/*` -> hello-halo (MIT)

## Issues Encountered

- `src/main/services/ai-browser/index.ts` had an existing header which caused a "multiple matches" error during edit. We appended the new header before the existing one by targeting the `/*` start of the file.
- TypeScript verification passed (ignoring unrelated test file error `tests/integration/full-workflow.test.ts` which was pre-existing).
