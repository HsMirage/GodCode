# CodeAll Development Guide

This guide provides instructions for setting up the development environment, building the project, and contributing to CodeAll.

## 1. Environment Setup

### Prerequisites

- **Node.js**: v18.0.0 or higher.
- **PNPM**: v8.0.0 or higher (`npm install -g pnpm`).
- **PostgreSQL**: Not required locally (we use `embedded-postgres`), but useful for production.
- **Git**: For version control.

### Initial Setup

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd CodeAll
   ```
2. Install dependencies:
   ```bash
   pnpm install
   ```
   _Note: This will also download the embedded Postgres binary._

## 2. Development Commands

### Running the App

Start the development server with hot-reload:

```bash
pnpm dev
```

- Starts the Renderer (Vite) on port 5173.
- Starts the Electron Main process.
- Initializes the embedded database on a random free port.

### Building

Build the application for production:

```bash
# For your current OS
pnpm build

# Platform specific
pnpm build:win    # Windows (NSIS)
pnpm build:mac    # macOS (DMG/Zip)
pnpm build:linux  # Linux (AppImage)
```

Output artifacts will be in the `dist/` directory.

### Testing

Run unit tests with Vitest:

```bash
pnpm test          # Run once
pnpm test:watch    # Watch mode
pnpm test:e2e      # Run Playwright E2E tests
```

### Code Quality

```bash
pnpm typecheck     # Run TypeScript compiler check
pnpm lint          # Run ESLint
pnpm format        # Run Prettier
```

## 3. Project Structure

```
CodeAll/
├── src/
│   ├── main/           # Electron Main Process
│   │   ├── ipc/        # IPC Handlers
│   │   ├── services/   # Core Logic (DB, LLM, Browser)
│   │   └── index.ts    # Entry Point
│   ├── preload/        # Context Bridge
│   └── renderer/       # React UI
│       ├── components/ # UI Components
│       ├── hooks/      # Custom Hooks
│       └── store/      # Zustand Stores
├── prisma/             # Database Schema
├── tests/              # Test Suites
└── electron.vite.config.ts # Build Config
```

## 4. Coding Conventions

### TypeScript

- **Strict Mode**: Enabled. No `any` unless absolutely necessary.
- **Interfaces**: Prefixed with `I` is NOT required. Use Descriptive names.
- **Types vs Interfaces**: Use `type` for unions/primitives, `interface` for objects.

### Style

- **Semicolons**: None (controlled by Prettier).
- **Quotes**: Single quotes preferred.
- **Indentation**: 2 spaces.

### Database Changes

1. Modify `prisma/schema.prisma`.
2. Generate the client:
   ```bash
   pnpm prisma generate
   ```
3. Migrations are handled automatically by `DatabaseService` in dev.

## 5. Adding New Features

### Adding an IPC Handler

1. Define the handler in `src/main/ipc/handlers/`.
2. Register it in `src/main/ipc/index.ts`.
3. Add types to `src/preload/index.d.ts` (if exposing via context bridge).
4. Invoke from renderer using `ipcRenderer.invoke()`.

### Adding a UI Component

1. Create component in `src/renderer/src/components/`.
2. Use Shadcn/UI primitives where possible.
3. Add stories or tests if complex.
