
## CI Workflow Research (2026-02-02)

### 1. Recommended GitHub Actions Workflow Structure
Based on `electron-vite`, `pnpm`, and `playwright` requirements, the minimal robust CI pipeline should include:

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test-and-build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v3
        with:
          version: 9  # Align with packageManager in package.json if possible, or use latest 9
          run_install: false

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'

      - name: Install Dependencies
        run: pnpm install --frozen-lockfile

      - name: Lint & Format Check
        run: |
          pnpm lint
          # pnpm format # Optional: check if formatting is correct without writing

      - name: Typecheck
        run: pnpm typecheck

      - name: Run Unit Tests
        run: pnpm test

      - name: Install Playwright Browsers
        run: npx playwright install --with-deps

      - name: Run E2E Tests (Electron + Playwright)
        # Critical: xvfb is required for Electron in headless CI environments
        run: xvfb-run --auto-servernum --server-args="-screen 0 1280x960x24" pnpm test:e2e
        env:
          CI: true

      - name: Build (Linux)
        run: pnpm build:linux
```

### 2. Key Technical Decisions
- **XVFB Requirement**: Electron apps require a display server even for headless testing. On Linux (GitHub Actions), `xvfb-run` is mandatory.
  - *Evidence*: `electron-playwright-helpers` and Microsoft Playwright docs confirm `xvfb` necessity for Electron.
- **PNPM Caching**: Using `actions/setup-node` with `cache: 'pnpm'` is the modern standard, replacing older manual caching steps.
- **Node Version**: Fixed to `node-version: 20` to match local development environment (`v20.19.0`).
- **Playwright Dependencies**: `npx playwright install --with-deps` ensures system dependencies (like specific shared libs) required by browser binaries are present.

### 3. References
- [Playwright CI Docs](https://playwright.dev/docs/ci)
- [Electron Playwright Example](https://github.com/spaceagetv/electron-playwright-example)
- [GitHub Action: Setup PNPM](https://github.com/pnpm/action-setup)


## Auto-Update Configuration Strategy (2026-02-02)

### Decision
We will use the **"Baked-In" Configuration Pattern** with the `generic` provider for CodeAll.

### Rationale
1.  **Decoupling**: Keeps the update URL out of the source code (`src/main/index.ts`).
2.  **CI Flexibility**: Allows injecting different update URLs for different build pipelines (e.g. `nightly` vs `stable`) without code changes.
3.  **Simplicity**: The `generic` provider is the most flexible for self-hosted or simple static hosting (S3/MinIO/Nginx), which fits "CodeAll" as a potentially self-hosted platform.

### Implementation Details
1.  **electron-builder.yml**:
    ```yaml
    publish:
      provider: generic
      url: "${env.CODEALL_UPDATE_URL}"
    ```
2.  **src/main/index.ts**:
    - Remove `autoUpdater.setFeedURL(...)`.
    - Rely on `electron-updater` automatic configuration loading.
    - Keep `app.isPackaged` check.
3.  **Build System**:
    - Ensure `CODEALL_UPDATE_URL` is defined in the release workflow.
    - Default to a placeholder if undefined to prevent build errors, or require it for release builds.

### Fallback
If `CODEALL_UPDATE_URL` is missing during build, `electron-builder` might fail or embed an empty string. We should default to a placeholder in the build script or `.env`.

## Official GitHub Actions Examples for PNPM & Playwright/Electron (2026-02-02)

### 1. PNPM Caching Official Pattern
According to [pnpm official docs](https://pnpm.io/continuous-integration), the modern way to cache pnpm in GitHub Actions is using `actions/setup-node` with the `cache` option. This supersedes manual `actions/cache` steps.

**Recommended Pattern:**
```yaml
- uses: actions/setup-node@v4
  with:
    node-version: 20
    cache: 'pnpm'
```

### 2. Electron + Playwright in CI
Official [Playwright CI docs](https://playwright.dev/docs/ci) and community examples confirm two critical requirements for Electron apps on Linux CI runners:

1.  **Install System Dependencies**: `npx playwright install --with-deps` is required to fetch libraries needed by the browser binaries and Electron.
2.  **Headless Display Server (XVFB)**: Electron apps, even when driven by Playwright, require a display server. On headless Linux runners (like `ubuntu-latest`), `xvfb` is **mandatory**.

**Official/Standard Pattern:**
```yaml
- name: Install Playwright Browsers & Deps
  run: npx playwright install --with-deps

- name: Run Electron Tests
  run: xvfb-run --auto-servernum --server-args="-screen 0 1280x960x24" pnpm test:e2e
```

**Key Links:**
- [Playwright CI Guide](https://playwright.dev/docs/ci)
- [Electron Playwright Example (SpaceAgeTV)](https://github.com/spaceagetv/electron-playwright-example)
- [Microsoft Playwright GitHub Action](https://github.com/microsoft/playwright-github-action) (Archived, but confirms `xvfb` usage in history)


## Reference: Auto-Update & Publish Documentation (2026-02-02)

### Authoritative Links
- **Publish Configuration**: [electron.build/publish](https://www.electron.build/publish.html) - Official docs for `publish` options in `electron-builder.yml`.
- **Auto-Update Guide**: [electron.build/auto-update](https://www.electron.build/auto-update.html) - Complete guide on using `electron-updater`.
- **Generic Provider**: [electron.build/publish#byo-generic-create-your-own](https://www.electron.build/publish.html#byo-generic-create-your-own) - Specifics for the `generic` provider.

### Minimal Config Example (Generic Provider)
**`electron-builder.yml`**:
```yaml
publish:
  provider: generic
  url: "https://updates.example.com/apps/codeall"
  # Optional: channel: "latest"
```

**`src/main/index.ts`**:
```typescript
import { autoUpdater } from "electron-updater"

// Basic usage (no setFeedURL needed if config is baked in)
autoUpdater.checkForUpdatesAndNotify()

// Event handling
autoUpdater.on('update-available', () => {
  console.log('Update available')
})
```

### 3. PNPM Caching Nuance (Setup-Node vs Action-Setup)
While `actions/setup-node` (v4) has built-in `cache: 'pnpm'` support, the official [pnpm/action-setup](https://github.com/pnpm/action-setup) is often used *before* it to ensure the correct PNPM version is installed.

**Best Practice Combination:**
1. Use `pnpm/action-setup` to install the precise PNPM version.
2. Use `actions/setup-node` to install Node.js AND handle the caching (it detects the pnpm-lock.yaml).

```yaml
- uses: pnpm/action-setup@v3
  with:
    version: 9

- uses: actions/setup-node@v4
  with:
    node-version: 20
    cache: 'pnpm'
```
This combination provides the most reliable setup: correct package manager version + official caching logic from the Node.js action.
