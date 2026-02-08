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
import { autoUpdater } from 'electron-updater' // ❌ Fails in packaged app
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

## [2026-02-02] Gemini Adapter Test Mock Shape Update

### Issue

Gemini adapter integration tests failing due to outdated mock response shapes.

### Root Cause

The Gemini adapter was updated to parse responses using the new Google Generative AI SDK format:

- `response.candidates[0].content.parts` for non-streaming
- `chunk.candidates[0].content.parts` for streaming

But tests still used the old `text()` function API:

```typescript
// OLD (broken)
{
  text: () => 'Hello from Gemini'
}
```

### Solution

Updated mocks to match new SDK response structure:

```typescript
// NEW (correct)
{
  candidates: [
    {
      content: {
        parts: [{ text: 'Hello from Gemini' }]
      }
    }
  ]
}
```

### Files Modified

- `tests/integration/llm-adapters.test.ts` (2 test cases in GeminiAdapter describe block)

### Pattern

When SDK APIs change, test mocks must match the **exact shape** that production code parses.
Review adapter implementation (`response.candidates?.[0]?.content?.parts`) to understand expected mock structure.

## [2026-02-08] Explore prompt template migration (QianLiYan)

- Ported the explore agent prompt into `src/main/services/delegate/prompts/explore.ts` as `explorePromptTemplate`.
- Kept original section structure intact: mission, critical deliverables, success criteria, failure conditions, constraints, and tool strategy.
- Applied identity adaptation to `千里眼 (QianLiYan) - The All-Seeing Eye` and added mythology context line.
- Preserved hard requirements in prompt text: absolute paths, `<analysis>/<results>/<files>/<answer>/<next_steps>` output, read-only constraints, and 3+ parallel tool execution.

## [2026-02-08] Browser tools binding verification (LuBan executor)

- Browser tool registration in `src/main/services/tools/index.ts` is already complete for 6 tools: `browser_navigate`, `browser_click`, `browser_fill`, `browser_snapshot`, `browser_screenshot`, `browser_extract`.
- Browser adapter typing in `src/main/services/tools/builtin/browser-tools.ts` benefits from explicit `ToolParameter[]` mapping instead of `any[]` to keep Tool interface compliance strict.
- To make browser tools reachable in default agent bindings, updating `src/shared/agent-definitions.ts` for `luban` is necessary (not just `delegate/agents.ts`).

## [2026-02-08] Metis → ChongMing prompt migration pattern

- Prompt migrations should preserve the original directive structure exactly (phase flow, intent matrix, tool guidance, output schema, QA directives) and only adapt identity/localization fields.
- For Chinese-mythology agent ports, keep both bilingual identity and role subtitle in the first heading to avoid losing original behavioral framing.
- Prompt templates in CodeAll should export a strict `AgentPromptTemplate` object with `agentCode` aligned to `src/shared/agent-definitions.ts`.

## [2026-02-08] Librarian prompt migration (DiTing)

- The prompt template format in CodeAll delegate prompts is a simple `AgentPromptTemplate` object with `{ agentCode, description, version, systemPrompt }` and no factory wrapper.
- For migration fidelity, preserving the original phase structure and tool reference tables verbatim avoids behavioral drift in downstream agent execution.
- Identity adaptation can be done safely by changing only the title/identity lines while retaining operational instructions (classification phases, citation format, permalink construction, failure recovery).

## [2026-02-08] Momus prompt migration (LeiGong)

- Migrated the full Momus review prompt into `src/main/services/delegate/prompts/momus.ts` as `momusPromptTemplate` with `agentCode: 'leigong'`.
- Preserved the original review structure and guardrails exactly: purpose question, 3 check categories, 8 non-check items, Step 0 validation, 5-step review process, OKAY/REJECT framework, anti-patterns, and output format.
- Identity adaptation is low-risk when limited to role/name replacement plus mythology context line (`雷公 (LeiGong) - The Thunder God Reviewer`) without changing decision logic.

## [2026-02-08] Oracle prompt migration (BaiZe)

- Ported the full upstream Oracle system prompt into `src/main/services/delegate/prompts/oracle.ts` with all original sections preserved (`context`, `expertise`, `decision_framework`, `output_verbosity_spec`, `response_structure`, `uncertainty_and_ambiguity`, `long_context_handling`, `scope_discipline`, `tool_usage_rules`, `high_risk_self_check`, `guiding_principles`, `delivery`).
- Identity adaptation was constrained to role framing only: `白泽 (BaiZe) - The Omniscient Divine Beast` plus mythology context line about knowing all things, diagnosing ailments, and seeing through deceptions.
- For readonly parity with original Oracle constraints, explicit non-implementation restrictions were included in the prompt context (`do not write/edit`).
