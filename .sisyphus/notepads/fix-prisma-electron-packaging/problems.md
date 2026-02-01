# Unresolved Blockers

## Critical: Preload Script ESM Loading Failure

### Problem
The packaged application cannot load the preload script due to ESM import syntax error:
```
Unable to load preload script: ...\out\preload\preload.mjs
SyntaxError: Cannot use import statement outside a module
```

### Impact
- Preload script fails to load
- `window.electron` is undefined in renderer process
- All IPC communication fails
- Application cannot initialize properly

### Root Cause
The preload script is built as ESM (.mjs) but Electron's preload context expects CommonJS or a different configuration.

### Blocking Tasks
- Task 5: Cannot verify "Database initialization timeout" is fixed because app fails earlier
- Task 6: Cannot verify application window content because IPC fails

### Next Steps
This requires a separate plan to:
1. Fix preload script module format (ESM → CJS or proper ESM configuration)
2. Update electron-builder configuration for preload bundling
3. Verify Electron BrowserWindow preload configuration

### Files to Investigate
- `out/preload/preload.mjs` - The problematic preload script
- `electron.vite.config.ts` - Vite build configuration for preload
- `src/main/index.ts` - BrowserWindow preload path configuration
- `electron-builder.yml` - ASAR packaging for preload scripts

### Evidence
See: `.sisyphus/notepads/fix-prisma-electron-packaging/learnings.md` - Task 5-6 section
