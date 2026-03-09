# Troubleshooting Guide

This guide provides solutions for common issues encountered when setting up, developing, or using CodeAll.

## 1. E2E Testing & Electron Launch Issues

### Symptom: "Process failed to launch" or Playwright Timeout

When running `pnpm test:e2e`, you might encounter an error indicating that the Electron process failed to launch.

**Solutions:**

1. **Build before Testing**: Ensure you have a fresh build of the application before running E2E tests.
   ```bash
   pnpm build
   pnpm test:e2e
   ```
2. **Missing System Dependencies (Linux)**: If you are running tests on a Linux environment (including WSL or CI), Playwright/Electron requires specific system libraries and a display server.
   - Install dependencies: `npx playwright install-deps`
   - Use `xvfb` to provide a virtual display:
     ```bash
     xvfb-run pnpm test:e2e
     ```

## 2. Auto-Updater Configuration

### Symptom: Update check fails or uses incorrect URL

The application uses `electron-updater` for seamless updates, configured via the `CODEALL_UPDATE_URL` environment variable.

**Troubleshooting Steps:**

1. **Check Environment Variables**: Ensure `CODEALL_UPDATE_URL` is correctly set during the **build process**.
   - For Windows: `set CODEALL_UPDATE_URL=https://your-update-server.com/`
   - For Linux/macOS: `export CODEALL_UPDATE_URL=https://your-update-server.com/`
2. **Verify `app-update.yml`**: After building, check if `resources/app-update.yml` inside the packaged app contains the expected provider and URL.
3. **Development Mode**: Note that the auto-updater is typically disabled in development mode to avoid configuration errors.

## 3. Missing or Invalid Model API Keys

### Symptom: "Authentication Error" or "No Response" in Chat

If the AI agents fail to respond or return error messages related to authentication.

**Troubleshooting Steps:**

1. **Validate API Keys**:
   - Navigate to **Settings > API Keys**.
   - Ensure the keys for OpenAI, Anthropic, or Gemini are pasted correctly without extra spaces.
2. **Model Availability**: Verify that your API key has access to the specific model version configured in **Settings > LLM Config**.
3. **Quota & Billing**: Check your provider's dashboard to ensure you have sufficient credits/quota.

## 4. Database Connection Issues

### Symptom: "Failed to initialize database"

CodeAll uses an embedded PostgreSQL database powered by Prisma.

**Solutions:**

1. **Port Conflict**: Ensure no other PostgreSQL instance is using the default port assigned to the embedded server.
2. **Permissions**: On Windows, ensure the application has write permissions to its data directory. Try running as Administrator if issues persist.
3. **Reset State**: If the database state is corrupted, you can try resetting it (Warning: this deletes all local sessions/tasks):
   ```bash
   pnpm prisma db push --force-reset
   pnpm prisma generate
   ```

## 5. Hook Reliability (Timeout / Circuit Breaker)

### Symptom: Hook occasionally times out or is skipped with circuit-open status

CodeAll’s unified hook entry includes reliability protections:

- **Timeout control**: a single hook call is capped (default 2000ms).
- **Graceful degradation**: timeout or hook error is recorded, but the main pipeline continues.
- **Circuit breaker**: repeated failures for the same hook (default threshold 3) open a cooldown window (default 30s), during which executions are skipped.

**How to diagnose quickly:**

1. Open **Settings > Hook治理 > 最近执行证据链**.
2. Check `result.status`:
   - `success`: hook executed normally
   - `error`: hook callback threw
   - `timeout`: hook exceeded timeout cap
   - `circuit_open`: hook skipped during cooldown
3. Check `degraded`:
   - `true` indicates reliability fallback was applied (main chain preserved)
4. If `circuit_open` appears, inspect `circuitOpenUntil` to know when retries resume.

**Recommended follow-up:**

- Reduce expensive work in hook callbacks.
- Move external/network-heavy operations out of inline hook path.
- Add targeted tests for hook callback latency and failure handling.

---

_Ultraworked with [Sisyphus](https://github.com/code-yeongyu/oh-my-opencode)_


## 6. Browser Workbench Residue / Bounds Issues

### Symptom: Browser panel is closed but the page is still visible

This usually indicates the renderer panel has unmounted, but the underlying Electron `BrowserView` was not hidden in time.

**Current behavior:**

- Closing the browser panel hides the visible `BrowserView` during component unmount.
- Switching sessions clears old browser tabs and closes the browser panel before entering the next session.

**Troubleshooting Steps:**

1. Re-open the browser panel and verify whether the active tab list is empty or stale.
2. Switch to another session and back once; the old session's `BrowserView` should be destroyed during the session cleanup path.
3. If the panel area looks blank after resizing, resize the right panel again or reopen the browser panel to force a fresh bounds sync.
4. In development mode, inspect logs from:
   - `src/main/services/browser-view.service.ts`
   - `src/renderer/src/components/panels/browser-panel-lifecycle.ts`
   - `src/renderer/src/services/browser-session-cleanup.ts`

### Symptom: Browser content is misaligned after layout resize

This usually comes from stale bounds or an overlay temporarily blocking the `BrowserView`.

**Troubleshooting Steps:**

1. Confirm no modal/dialog is covering the workbench.
2. Toggle the browser panel once to retrigger lifecycle sync.
3. Check whether the browser container has non-zero width and height.
4. If the issue reproduces reliably, capture the active session ID, browser tab ID, and the latest resize operation for debugging.
