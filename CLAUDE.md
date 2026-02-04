# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CodeAll is a Multi-LLM Collaborative Programming Platform built with Electron and React. It orchestrates complex development tasks by decomposing them into sub-tasks executed by specialized AI agents.

## Common Commands

```bash
# Install dependencies (pnpm required)
pnpm install

# Initialize database (required before first run)
pnpm prisma generate

# Development
pnpm dev              # Start Electron app in dev mode

# Testing
pnpm test             # Unit tests (Vitest)
pnpm test:watch       # Watch mode
pnpm test:e2e         # E2E tests (Playwright, builds first)
pnpm test:performance # Performance tests

# Code quality
pnpm lint             # ESLint
pnpm typecheck        # TypeScript check
pnpm format           # Prettier

# Build
pnpm build:win        # Windows
pnpm build:mac        # macOS
pnpm build:linux      # Linux
```

## Architecture

### Process Model (Electron)

- **Main Process** (`src/main/`): Node.js backend handling database, LLM calls, file operations, and IPC
- **Renderer Process** (`src/renderer/`): React SPA for the UI
- **Preload** (`src/preload/`): Secure bridge exposing IPC to renderer
- **Shared** (`src/shared/`): Common types and utilities

### Core Services (`src/main/services/`)

| Service | Purpose |
|---------|---------|
| `workforce/` | Decomposes user requests into DAG of sub-tasks |
| `delegate/` | Routes tasks to specialized agents (oracle, explore, librarian) |
| `llm/` | LLM adapters (OpenAI-compatible, factory pattern) |
| `tools/` | Tool registry and executor (file-read, file-write, browser-tools) |
| `ai-browser/` | Playwright-based browser automation for agents |
| `database.ts` | Prisma client singleton with embedded PostgreSQL |

### IPC Communication

All IPC channels are defined in `src/shared/ipc-channels.ts`:
- **INVOKE_CHANNELS**: Request-response (renderer → main)
- **EVENT_CHANNELS**: One-way events (main → renderer)

Handlers are registered in `src/main/ipc/index.ts`.

### State Management (Renderer)

Zustand stores in `src/renderer/src/store/`:
- `session.store.ts`: Chat sessions and messages
- `config.store.ts`: App configuration
- `agent.store.ts`: Agent state and task tracking
- `ui.store.ts`: UI state

### Database (Prisma + Embedded PostgreSQL)

Schema in `prisma/schema.prisma`. Key models:
- **Space**: Workspace mapped to local directory
- **Session**: Chat session within a space
- **Message**: Chat messages
- **Task**: Sub-tasks with status tracking
- **Run**: Execution logs for tasks
- **ApiKey**: Encrypted API key storage

### Agent System

Predefined agents in `src/main/services/delegate/agents.ts`:
- **oracle**: Pure reasoning, no tools
- **explore**: Code exploration (grep, read, glob)
- **librarian**: Information retrieval (websearch, context7)

## Key Patterns

### Path Aliases
- `@/` maps to `src/` for imports

### Tool Execution
Tools are defined in `src/main/services/tools/` with permission policies. Each tool implements `ToolInterface` and is registered in the tool registry.

### API Key Security
API keys are encrypted using OS Keychain via `src/main/services/keychain.service.ts`.

## Testing

- Unit tests: `tests/` directory, Vitest with happy-dom
- E2E tests: Playwright, requires build first
- Test utilities in `tests/utils/`
