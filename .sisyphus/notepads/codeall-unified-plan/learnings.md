# NSIS Configuration Learning

The NSIS configuration in `electron-builder.yml` must be placed at the root level, but `electron-builder` might be strict about YAML formatting or caching.

It seems `electron-builder` on Linux (WSL) cannot build Windows NSIS installers (.exe) because it requires Wine, which failed with `ERR_ELECTRON_BUILDER_CANNOT_EXECUTE`.

However, the configuration in `electron-builder.yml` is syntactically correct:

```yaml
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  shortcutName: CodeAll
  createDesktopShortcut: always
  createStartMenuShortcut: true
```

The error `wine is required` confirms that the configuration was picked up (because it tried to build nsis target), but the environment lacks the necessary tools to finalize the artifact.

# Dependency Management Learning

We encountered significant issues with pnpm lockfiles and permissions in WSL.
Switching to `npm install --no-package-lock --legacy-peer-deps --force` was required to bypass strict peer dependency checks and file permission errors, especially with `tailwindcss` and `sonner`.
This allowed the build to proceed to the packaging stage, confirming the application code builds correctly even if the final Windows installer packaging fails on Linux.

## [2026-02-01 21:50] Windows Build Complete - Installer Limitation

### Build Success
- ✅ Electron app successfully built: `dist/win-unpacked/CodeAll.exe` (169MB)
- ✅ Total unpacked size: 713MB (includes Electron, Chromium, all dependencies)
- ✅ All assets, resources, and Prisma binaries correctly packaged

### NSIS Installer Limitation
- ❌ NSIS installer (.exe) creation failed on WSL/Linux
- **Reason**: electron-builder requires Wine to create Windows installers on Linux
- **Error**: `wine is required, please see https://electron.build/multi-platform-build#linux`

### Solutions
1. **For WSL/Linux users**: Install Wine and run `pnpm build:win` again
2. **Recommended**: Build on native Windows machine (no Wine required)
3. **Alternative**: Use CI/CD with Windows runner (GitHub Actions, AppVeyor)

### Task 10.1.3 Status
- **Manual Testing**: Requires running `CodeAll.exe` on Windows machine
- **Current State**: Unpacked build ready, installer pending Wine setup or Windows build environment

### Configuration Verification
- ✅ NSIS configuration in `electron-builder.yml` is correct
- ✅ App metadata (appId, productName, copyright) configured
- ✅ Icon path configured (build/icon.ico)
- ⚠️ Icon size is 48x48 (recommended 256x256+)

## [2026-02-01 22:10] electron-updater ESM Import Fix

### Issue
User reported crash on packaged Windows app:
```
SyntaxError: Named export 'autoUpdater' not found. The requested module 'electron-updater' is a CommonJS module
```

### Root Cause
`electron-updater` is a CommonJS module, but code used ESM named import:
```typescript
import { autoUpdater } from 'electron-updater'  // ❌ Fails in packaged app
```

### Solution
Changed to CommonJS-compatible default import pattern:
```typescript
import pkg from 'electron-updater'
const { autoUpdater } = pkg
```

### Files Modified
- `src/main/index.ts` (lines 3-4)

### Pattern
This is the SAME pattern used for Prisma fix in Phase 0:
- When Electron packages CommonJS modules, named ESM imports break
- Always use default import + destructuring for CommonJS dependencies
- Applies to: `@prisma/client`, `electron-updater`, and similar CJS modules

### Verification
```bash
✅ pnpm typecheck - No errors
✅ pnpm build - Success
✅ grep verification - No other electron-updater imports
```

### Recommendation
Check ALL dependencies before packaging:
1. Identify CommonJS modules (look for `exports.autoUpdater =` in node_modules)
2. Use default import pattern preemptively
3. Test packaged app, not just dev mode
