# Learnings - CodeAll Development

## [2026-01-28 14:18] Task 0: Licenses & Domain Model Freezing

### Git Setup
- Initialized git repository successfully
- Created comprehensive .gitignore covering Node.js, Electron, database, IDE files
- Configured local git user: "CodeAll Developer <dev@codeall.local>"
- First commit includes 6 files (442 insertions): .gitignore, README, licenses.md, domain.ts, schema.prisma, events.ts

### Domain Model
- All core interfaces frozen in `src/types/domain.ts`
- Database schema defined in `prisma/schema.prisma`
- IPC events defined in `src/types/events.ts`

### Directory Structure Established
```
/mnt/d/网站/CodeAll/
├── .gitignore
├── README.md
├── docs/
│   └── licenses.md
├── src/
│   └── types/
│       ├── domain.ts
│       └── events.ts
└── prisma/
    └── schema.prisma
```

## [2026-01-28 14:26] Task 1: Project Scaffolding & Build Configuration

### Package Manager & Dependencies
- Using pnpm 10.11.0 as package manager
- Installed 777 packages successfully
- Core dependencies: electron ^28.0.0, react ^18.2.0, electron-vite ^2.0.0
- Database: prisma + @prisma/client (latest)
- State: zustand ^4.5.0
- Logging: winston ^3.11.0
- Testing: vitest ^1.6.1, playwright ^1.57.0

### Build System
- Using electron-vite (NOT plain vite) for Electron dual-process support
- Main entry: src/main/index.ts
- Preload entry: src/main/preload.ts
- Renderer entry: src/renderer/index.html → src/renderer/src/index.tsx
- Build output: out/ directory (main/, preload/, renderer/)

### TypeScript Configuration
- Strict mode enabled
- Path aliases configured: @main, @renderer, @shared, @types
- Target: ES2020, Module: ESNext
- JSX: react-jsx (React 18 automatic runtime)

### Code Quality
- ESLint configured with TypeScript + React rules
- Prettier configured: no semicolons, single quotes, 100 print width
- All verification passed: typecheck ✓, lint ✓, build ✓

### Directory Structure Created
```
src/
  main/          - Electron main process
    index.ts     - Application entry point
    preload.ts   - Context bridge for secure IPC
  renderer/      - React frontend
    index.html   - HTML entry
    src/
      index.tsx  - React root component
  shared/        - Shared utilities (empty for now)
  types/         - Domain models (from Task 0)
tests/
  unit/          - Unit tests (empty for now)
  e2e/           - E2E tests (empty for now)
```

### Build Verification Results
- Build completed in ~700ms
- Generated files:
  - out/main/index.js (1.09 kB)
  - out/preload/preload.mjs (0.43 kB)
  - out/renderer/index.html + assets (214.44 kB)

## [2026-01-28 $(date +%H:%M)] Task 2: Electron Framework & IPC Communication

### IPC Infrastructure Created
- Created `src/main/ipc/handlers/ping.ts` - Test handler returning 'pong'
- Created `src/main/ipc/index.ts` - Central IPC registration function
- Updated `src/main/index.ts` - Calls registerIpcHandlers() on app ready
- Updated `src/main/preload.ts` - Exposes `window.codeall.invoke()` via contextBridge

### Security Configuration
- contextIsolation: true (enforced)
- nodeIntegration: false (enforced)
- API exposed as `window.codeall` (NOT window.api or window.halo)
- Using contextBridge for safe IPC exposure

### IPC Pattern Adopted
- Function-based handlers (not class-based)
- Handlers use async functions with proper TypeScript types
- ipcMain.handle() for invoke-based communication
- Unused event parameters prefixed with underscore to satisfy ESLint

### Build Verification
- `pnpm typecheck` passed
- `pnpm lint` passed
- `pnpm build` succeeded (out/main, out/preload, out/renderer)

### Implementation Notes
- Subagents refused multi-file delegation (wanted ultra-atomic tasks)
- Atlas implemented IPC scaffold directly as coordination work
- Followed hello-halo's preload pattern but simplified for MVP
- Dev tools open automatically in development mode

### Next Steps
- Task 3: PostgreSQL embedded database (can run in parallel)
- TODO: Runtime verification needed - test `pnpm dev` and `window.codeall.invoke('ping')`

## [2026-01-28] Task 3: PostgreSQL Embedded Database

### Package Installation
- Installed `embedded-postgres` v18.1.0-beta.15 (ESM package, requires dynamic import)
- Downgraded Prisma from v7.3.0 to v6.19.2 due to breaking changes in v7
  - Prisma 7 requires new config format (prisma.config.ts instead of schema url)
  - MVP stability > latest version - using v6 for now
- Created `.pnpm-approve-builds` to whitelist Prisma build scripts

### Database Service Architecture
- Singleton pattern: `DatabaseService.getInstance()`
- Database path: `app.getPath('userData')/db/` (cross-platform)
- PostgreSQL embedded config:
  - Port: 54320 (to avoid conflict with system postgres)
  - User/Password: codeall/codeall
  - Persistent mode enabled
- Dynamic import for ESM compatibility: `await import('embedded-postgres')`

### Integration Points
- Main process initialization: `app.whenReady()` → `db.init()` before window creation
- Graceful shutdown: `app.on('quit')` → `db.shutdown()`
- DATABASE_URL set dynamically at runtime: `process.env.DATABASE_URL`

### Prisma Setup
- Schema validated successfully (124 lines, 8 models)
- Prisma Client generated to node_modules
- Migration deferred: Will run on first app startup when database is actually running

### Verification Results
- ✅ TypeScript compilation: no errors
- ✅ ESLint: all checks passed (fixed `any` type to `EmbeddedPostgres`)
- ✅ Build: successful (out/main/index.js 3.59 kB)

### Key Decisions
- Database migration NOT run during build - will auto-migrate on first app startup
- Embedded postgres binary download happens on first init (user experience consideration)
- Used type import for EmbeddedPostgres to avoid runtime dependency before dynamic import

### Git Commit
- Commit: 670a004
- Message: `feat(database): integrate embedded PostgreSQL and Prisma ORM`
- Files: database.ts, index.ts, package.json, pnpm-lock.yaml, .pnpm-approve-builds

### Next Steps
- Task 4: UI Framework (React + TailwindCSS + Configuration Panel)
- TODO: Manual runtime test needed - start app and verify database initializes

## [2026-01-28] Task 4 (partial): Router Scaffold

### Renderer Routing
- Added `App.tsx` with `BrowserRouter` + `Routes` for `/` and `/settings`
- Placeholder pages `ChatPage` and `SettingsPage` using Tailwind dark classes
- `index.tsx` now renders `<App />` and keeps `index.css` import
