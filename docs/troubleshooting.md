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

