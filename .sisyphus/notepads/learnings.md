## Context Manager & Prompt Template Services

### Context Manager Service

- Implemented sliding window context management in `src/main/services/context-manager.service.ts`.
- Features:
  - Sliding window selection based on token limit (default 8000 tokens).
  - System message prioritization (always kept if possible).
  - Recent message prioritization.
  - Basic session summarization (first 50 messages).
  - Message cleanup utility.
- Tech Stack: Prisma for data access, simple heuristic for token estimation (1 token ≈ 4 english chars / 2 chinese chars).

### Prompt Template Service

- Implemented file-based prompt template system in `src/main/services/prompt-template.service.ts`.
- Features:
  - CRUD operations for templates.
  - Categories: system, user, custom.
  - Variable substitution (format `{variableName}`).
  - Storage location: `app.getPath('userData')/prompts`.
  - Default template initialization.

## Unified ContentCanvas Component

- Consolidating `ContentCanvas` logic:
  - Merged `src/renderer/src/components/layout/ContentCanvas.tsx` (Artifact Preview) and `src/renderer/src/components/canvas/ContentCanvas.tsx` (Browser/Tab System).
  - The new unified component resides in `src/renderer/src/components/canvas/ContentCanvas.tsx`.
  - It prioritizes `useArtifactStore.selectedArtifact` (legacy artifact preview) over `useCanvasLifecycle.tabs` (browser tabs) to maintain existing user workflow while introducing the new tab system.
  - Implemented a dual-close mechanism (`handleClose`) that synchronizes `useUIStore.showContentCanvas` (MainLayout visibility) and `useCanvasLifecycle.isOpen` (ChatPage/Canvas visibility).
- Removed duplicated stub component from `layout` directory.

## File Write Tool 单测修复（2026-02-06）

- `file-write.ts` 现已在执行时调用 `ArtifactService.getInstance().createArtifact(...)`，单测必须显式 mock `@/main/services/artifact.service`，否则会触发真实依赖。
- `file-write.ts` 会先 `fs.readFile` 判断 `changeType`（`created` / `modified`），测试中需在 `beforeEach` 设定 `fs.readFile` 默认 reject（如 `ENOENT`）来稳定走 `created` 分支。
- 返回 `metadata.size` 应使用 `Buffer.byteLength(content, 'utf8')` 语义；断言建议同步校验 `changeType`。
- 路径越界测试在 Windows 下要避免硬编码 POSIX 路径，使用 `path.resolve(...)` 与 `path.join('..', 'x')` 保持跨平台稳定。
